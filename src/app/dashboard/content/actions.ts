"use server";

import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import {
  contentProjects,
  contentAssets,
  brandProfiles,
  connectedAccounts,
  scheduledPosts,
  mediaJobs,
} from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { generateWithClaude } from "@/lib/ai/claude";
import { buildSystemPrompt, type PromptContext } from "@/lib/ai/doctrine";
import { getPerformanceContextForPrompt } from "@/lib/ai/performance-context";
import { ContentAgent } from "@/lib/swarm/agents/content";
import type { AgentContext } from "@/lib/swarm/agents/base-agent";
import type {
  ContentProject,
  ContentAsset,
  BrandProfile,
  NewContentAsset,
  NewScheduledPost,
} from "@/lib/db/schema";
import type { Platform, ContentType, DoctrineMode } from "@/types/api";

// ─── Validation ───

const VALID_PLATFORMS = [
  "instagram", "facebook", "reddit", "youtube", "x", "website", "email",
  "linkedin", "pinterest", "tiktok", "threads", "google_business",
  "wordpress", "medium", "ghost", "substack",
] as const;

const VALID_CONTENT_TYPES = [
  "caption", "thread", "post", "script", "blog", "carousel", "hook",
  "meme_copy", "quote_card", "landing_copy", "email", "newsletter",
  "pin", "story", "reel_script",
] as const;

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200),
  brief: z.string().min(1).max(2000),
  doctrineMode: z.enum([
    "garyvee", "mrbeast", "hormozi", "brunson",
    "sethgodin", "dankennedy", "balanced",
  ]),
  platform: z.enum(VALID_PLATFORMS),
  contentType: z.enum(VALID_CONTENT_TYPES),
});

const MultiPlatformSchema = z.object({
  title: z.string().min(1).max(200),
  brief: z.string().min(1).max(2000),
  doctrineMode: z.enum([
    "garyvee", "mrbeast", "hormozi", "brunson",
    "sethgodin", "dankennedy", "balanced",
  ]),
  platforms: z.array(z.enum(VALID_PLATFORMS)).min(1),
  contentTypes: z.array(z.enum(VALID_CONTENT_TYPES)).min(1),
  // Media options (for video/image auto-generation)
  voiceProfileId: z.string().optional(),
  emotionalVibe: z.string().optional(),
  subjectTags: z.array(z.string()).optional(),
});

// Platforms that should auto-generate video when selected
const VIDEO_PLATFORMS = new Set(["youtube", "tiktok"]);
// Platforms that should auto-generate images when selected
const IMAGE_PLATFORMS = new Set(["instagram", "pinterest"]);

// ─── Types ───

interface ProjectWithAssets extends ContentProject {
  assets: ContentAsset[];
}

// ─── List Projects ───

export async function listProjects(
  status?: string
): Promise<ActionResult<ContentProject[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    let query = db
      .select()
      .from(contentProjects)
      .where(eq(contentProjects.workspaceId, session.workspaceId))
      .orderBy(desc(contentProjects.createdAt));

    const projects = await query.all();

    if (status) {
      return projects.filter((p) => p.status === status);
    }

    return projects;
  });
}

// ─── Get Project with Assets ───

export async function getProject(
  projectId: string
): Promise<ActionResult<ProjectWithAssets | null>> {
  return safeAction(async () => {
    await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const project = await db
      .select()
      .from(contentProjects)
      .where(eq(contentProjects.id, projectId))
      .get();

    if (!project) return null;

    const assets = await db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.projectId, projectId))
      .all();

    return { ...project, assets };
  });
}

// ─── Create Project + Generate Content ───

export async function createAndGenerate(
  formData: FormData
): Promise<ActionResult<ProjectWithAssets>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateProjectSchema.parse({
      title: formData.get("title"),
      brief: formData.get("brief"),
      doctrineMode: formData.get("doctrineMode"),
      platform: formData.get("platform"),
      contentType: formData.get("contentType"),
    });

    // Get brand profile for prompt context
    const brand = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, session.workspaceId))
      .get();

    if (!brand) {
      throw new Error(
        "Set up your Brand Vault first (Settings → Brand)"
      );
    }

    // Create project
    const projectId = createId();
    const now = new Date();

    await db.insert(contentProjects).values({
      id: projectId,
      workspaceId: session.workspaceId,
      title: input.title,
      brief: input.brief,
      doctrineMode: input.doctrineMode,
      status: "generating",
      createdBy: session.userId,
      createdAt: now,
      updatedAt: now,
    });

    // Build prompt and generate content
    // Fetch historical performance data for this platform to inject as context.
    // Non-blocking — if no data exists yet, returns empty string.
    const performanceContext = await getPerformanceContextForPrompt(
      DB,
      session.workspaceId,
      input.platform as Platform
    );

    const promptCtx: PromptContext = {
      mode: input.doctrineMode as DoctrineMode,
      brand: {
        brandName: brand.brandName,
        mission: brand.mission,
        tone: brand.tone,
        audience: brand.audience,
      },
      platform: input.platform as Platform,
      contentType: input.contentType as ContentType,
      additionalContext: performanceContext || undefined,
    };

    const systemPrompt = buildSystemPrompt(promptCtx);

    try {
      const generatedContent = await generateWithClaude({
        systemPrompt,
        userMessage: input.brief,
        maxTokens: 4096,
      });

      // Create content asset
      const assetId = createId();
      const asset: typeof contentAssets.$inferInsert = {
        id: assetId,
        projectId,
        platform: input.platform,
        type: input.contentType,
        body: generatedContent,
        version: 1,
        status: "draft",
        createdAt: now,
      };

      await db.insert(contentAssets).values(asset);

      // Update project status
      await db
        .update(contentProjects)
        .set({ status: "review", updatedAt: new Date() })
        .where(eq(contentProjects.id, projectId));

      // Return plain serializable object (no Date instances)
      return {
        id: projectId,
        workspaceId: session.workspaceId,
        title: input.title,
        brief: input.brief,
        doctrineMode: input.doctrineMode,
        status: "review" as const,
        createdBy: session.userId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        assets: [{
          id: assetId,
          projectId,
          platform: input.platform,
          type: input.contentType,
          body: generatedContent,
          version: 1,
          status: "draft" as const,
          createdAt: now.toISOString(),
        }],
      } as unknown as ProjectWithAssets;
    } catch (error) {
      // If generation fails, mark project as draft so user can retry
      await db
        .update(contentProjects)
        .set({ status: "draft", updatedAt: new Date() })
        .where(eq(contentProjects.id, projectId));

      throw error;
    }
  });
}

// ─── Create Project + Generate for Multiple Platforms ───

export interface MultiPlatformResult {
  projectId: string;
  title: string;
  assets: Array<{
    id: string;
    platform: string;
    type: string;
    body: string;
    status: string;
    mediaJobId?: string; // ID of auto-queued video/image job
    mediaType?: "video_composite" | "meme" | "quote_card" | "thumbnail";
  }>;
  mediaJobsQueued: number;
}

export async function createAndGenerateMultiPlatform(
  input: {
    title: string;
    brief: string;
    doctrineMode: string;
    platforms: string[];
    contentTypes: string[];
    voiceProfileId?: string;
    emotionalVibe?: string;
    subjectTags?: string[];
  }
): Promise<ActionResult<MultiPlatformResult>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const parsed = MultiPlatformSchema.parse(input);

    // Get brand profile
    const brand = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, session.workspaceId))
      .get();

    if (!brand) {
      throw new Error("Set up your Brand Vault first (Settings → Brand)");
    }

    // Create project
    const projectId = createId();
    const now = new Date();

    await db.insert(contentProjects).values({
      id: projectId,
      workspaceId: session.workspaceId,
      title: parsed.title,
      brief: parsed.brief,
      doctrineMode: parsed.doctrineMode,
      status: "generating",
      createdBy: session.userId,
      createdAt: now,
      updatedAt: now,
    });

    const assets: MultiPlatformResult["assets"] = [];
    let mediaJobsQueued = 0;

    // Try to get MEDIA_QUEUE binding (may not exist in all envs)
    let mediaQueue: Queue | null = null;
    try {
      const bindings = getBindings();
      mediaQueue = bindings.MEDIA_QUEUE ?? null;
    } catch {
      // Queue not available — skip media auto-generation
      console.warn("[content/actions] MEDIA_QUEUE binding not available, skipping media auto-generation");
    }

    // Generate content for each platform
    for (let i = 0; i < parsed.platforms.length; i++) {
      const platform = parsed.platforms[i]!;
      const contentType = parsed.contentTypes[i]!;

      // Inject historical performance data for this platform
      const perfContext = await getPerformanceContextForPrompt(
        DB,
        session.workspaceId,
        platform as Platform
      );

      const promptCtx: PromptContext = {
        mode: parsed.doctrineMode as DoctrineMode,
        brand: {
          brandName: brand.brandName,
          mission: brand.mission,
          tone: brand.tone,
          audience: brand.audience,
        },
        platform: platform as Platform,
        contentType: contentType as ContentType,
        additionalContext: perfContext || undefined,
      };

      const systemPrompt = buildSystemPrompt(promptCtx);

      try {
        const generatedContent = await generateWithClaude({
          systemPrompt,
          userMessage: parsed.brief,
          maxTokens: 4096,
        });

        const assetId = createId();
        await db.insert(contentAssets).values({
          id: assetId,
          projectId,
          platform: platform as NewContentAsset["platform"],
          type: contentType as NewContentAsset["type"],
          body: generatedContent,
          version: 1,
          status: "draft",
          createdAt: new Date(),
        });

        let mediaJobId: string | undefined;
        let mediaType: "video_composite" | "meme" | "quote_card" | "thumbnail" | undefined;

        // Auto-queue media jobs for video platforms
        if (VIDEO_PLATFORMS.has(platform)) {
          mediaType = "video_composite";
          mediaJobId = createId();

          await db.insert(mediaJobs).values({
            id: mediaJobId,
            workspaceId: session.workspaceId,
            type: "video_composite",
            prompt: generatedContent,
            provider: "elevenlabs",
            config: JSON.stringify({
              script: generatedContent,
              emotionalVibe: parsed.emotionalVibe || "energetic",
              subjectTags: parsed.subjectTags || [],
              platform,
              projectTitle: parsed.title,
            }),
            voiceProfileId: parsed.voiceProfileId ?? null,
            status: "queued",
            createdBy: session.userId,
            createdAt: new Date(),
          });

          // Send to processing queue if available
          if (mediaQueue) {
            await mediaQueue.send({
              jobId: mediaJobId,
              type: "video_composite",
              prompt: generatedContent,
              provider: "elevenlabs",
              config: JSON.stringify({
                script: generatedContent,
                emotionalVibe: parsed.emotionalVibe || "energetic",
                subjectTags: parsed.subjectTags || [],
              }),
              workspaceId: session.workspaceId,
              voiceProfileId: parsed.voiceProfileId,
            });
          }
          mediaJobsQueued++;
        }

        // Auto-queue image jobs for image-first platforms
        if (IMAGE_PLATFORMS.has(platform) && (contentType === "quote_card" || contentType === "meme_copy")) {
          mediaType = contentType === "quote_card" ? "quote_card" : "meme";
          mediaJobId = createId();

          await db.insert(mediaJobs).values({
            id: mediaJobId,
            workspaceId: session.workspaceId,
            type: mediaType,
            prompt: `Create a ${mediaType === "quote_card" ? "quote card" : "meme"} for: ${generatedContent.substring(0, 500)}`,
            provider: "replicate",
            status: "queued",
            createdBy: session.userId,
            createdAt: new Date(),
          });

          if (mediaQueue) {
            await mediaQueue.send({
              jobId: mediaJobId,
              type: mediaType,
              prompt: `Create a ${mediaType === "quote_card" ? "quote card" : "meme"} for: ${generatedContent.substring(0, 500)}`,
              provider: "replicate",
              workspaceId: session.workspaceId,
            });
          }
          mediaJobsQueued++;
        }

        // Link media job to content asset
        if (mediaJobId) {
          await db
            .update(contentAssets)
            .set({ mediaJobId })
            .where(eq(contentAssets.id, assetId));
        }

        assets.push({
          id: assetId,
          platform,
          type: contentType,
          body: generatedContent,
          status: "draft",
          mediaJobId,
          mediaType,
        });
      } catch (error) {
        // If one platform fails, continue with others
        console.error(`Failed to generate for ${platform}:`, error);
        assets.push({
          id: "",
          platform,
          type: contentType,
          body: `[Generation failed: ${error instanceof Error ? error.message : "Unknown error"}]`,
          status: "error",
        });
      }
    }

    // Update project status
    const hasSuccess = assets.some((a) => a.status !== "error");
    await db
      .update(contentProjects)
      .set({
        status: hasSuccess ? "review" : "draft",
        updatedAt: new Date(),
      })
      .where(eq(contentProjects.id, projectId));

    return {
      projectId,
      title: parsed.title,
      assets,
      mediaJobsQueued,
    };
  });
}

// ─── Update Asset Status ───

export async function updateAssetStatus(
  assetId: string,
  newStatus: "draft" | "review" | "approved" | "rejected"
): Promise<ActionResult<{ updated: boolean }>> {
  return safeAction(async () => {
    const permission =
      newStatus === "approved" ? "publish:queue" : "content:write";
    await requirePermission(permission);

    const { DB } = getBindings();
    const db = createDb(DB);

    await db
      .update(contentAssets)
      .set({ status: newStatus })
      .where(eq(contentAssets.id, assetId));

    return { updated: true };
  });
}

// ─── Approve All & Schedule to All Matching Accounts ───

export interface BatchScheduleResult {
  approved: number;
  scheduled: number;
  skipped: string[]; // platforms with no matching connected account
}

export async function approveAndScheduleAll(
  assetIds: string[],
  scheduledFor: string
): Promise<ActionResult<BatchScheduleResult>> {
  return safeAction(async () => {
    const session = await requirePermission("publish:queue");
    const { DB } = getBindings();
    const db = createDb(DB);

    // Get all connected accounts for this workspace
    const accounts = await db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.workspaceId, session.workspaceId))
      .all();

    const activeAccounts = accounts.filter((a) => a.accountStatus === "active");

    let approved = 0;
    let scheduled = 0;
    const skipped: string[] = [];

    for (const assetId of assetIds) {
      if (!assetId) continue;

      // Get asset to find its platform
      const asset = await db
        .select()
        .from(contentAssets)
        .where(eq(contentAssets.id, assetId))
        .get();

      if (!asset) continue;

      // Approve the asset
      await db
        .update(contentAssets)
        .set({ status: "approved" })
        .where(eq(contentAssets.id, assetId));
      approved++;

      // Find matching connected account for this platform
      const matchingAccount = activeAccounts.find(
        (a) => a.platform === asset.platform
      );

      if (!matchingAccount) {
        skipped.push(asset.platform);
        continue;
      }

      // Create scheduled post
      const postId = createId();
      const now = new Date();

      await db.insert(scheduledPosts).values({
        id: postId,
        workspaceId: session.workspaceId,
        contentAssetId: assetId,
        connectedAccountId: matchingAccount.id,
        platform: asset.platform as NewScheduledPost["platform"],
        scheduledFor: new Date(scheduledFor),
        approvalMode: "autonomous",
        postStatus: "queued",
        createdBy: session.userId,
        createdAt: now,
        updatedAt: now,
      });
      scheduled++;
    }

    return { approved, scheduled, skipped };
  });
}

// ─── Regenerate Content ───

export async function regenerateContent(
  projectId: string,
  tweakedBrief?: string
): Promise<ActionResult<ContentAsset>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const project = await db
      .select()
      .from(contentProjects)
      .where(eq(contentProjects.id, projectId))
      .get();

    if (!project) throw new Error("Project not found");

    const brand = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, session.workspaceId))
      .get();

    if (!brand) throw new Error("Brand profile not found");

    // Get latest asset to determine version + platform/type
    const latestAsset = await db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.projectId, projectId))
      .orderBy(desc(contentAssets.version))
      .get();

    if (!latestAsset) throw new Error("No existing content to regenerate");

    const brief = tweakedBrief ?? project.brief ?? "";

    const promptCtx: PromptContext = {
      mode: project.doctrineMode as DoctrineMode,
      brand: {
        brandName: brand.brandName,
        mission: brand.mission,
        tone: brand.tone,
        audience: brand.audience,
      },
      platform: latestAsset.platform as Platform,
      contentType: latestAsset.type as ContentType,
      additionalContext: `This is a regeneration. Previous version: "${latestAsset.body.substring(0, 500)}..." — Please create a meaningfully different variation.`,
    };

    const systemPrompt = buildSystemPrompt(promptCtx);
    const generatedContent = await generateWithClaude({
      systemPrompt,
      userMessage: brief,
      temperature: 0.9, // Higher temp for more variation
    });

    const assetId = createId();
    const newAsset: typeof contentAssets.$inferInsert = {
      id: assetId,
      projectId,
      platform: latestAsset.platform,
      type: latestAsset.type,
      body: generatedContent,
      version: (latestAsset.version ?? 1) + 1,
      status: "draft",
      createdAt: new Date(),
    };

    await db.insert(contentAssets).values(newAsset);

    // Return plain serializable object
    return {
      ...newAsset,
      createdAt: newAsset.createdAt instanceof Date ? newAsset.createdAt.toISOString() : newAsset.createdAt,
    } as unknown as ContentAsset;
  });
}

// ─── List All Content Assets (Library) ───

export interface ContentAssetWithProject {
  id: string;
  projectId: string;
  projectTitle: string;
  platform: string;
  type: string;
  body: string;
  version: number;
  status: string;
  createdAt: string;
  mediaJob?: {
    id: string;
    type: string;
    status: string;
    r2Key: string | null;
    error: string | null;
  } | null;
  publishedPost?: {
    postStatus: string;
    platformPostUrl: string | null;
    publishedAt: number | null;
    errorMessage: string | null;
  } | null;
}

export async function listContentAssets(filters?: {
  status?: string;
  platform?: string;
}): Promise<ActionResult<ContentAssetWithProject[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const projects = await db
      .select()
      .from(contentProjects)
      .where(eq(contentProjects.workspaceId, session.workspaceId))
      .all();

    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) return [];

    let allAssets: ContentAsset[] = [];
    // Fetch assets for each project (D1 doesn't support IN with large arrays well)
    for (const pid of projectIds) {
      const assets = await db
        .select()
        .from(contentAssets)
        .where(eq(contentAssets.projectId, pid))
        .orderBy(desc(contentAssets.createdAt))
        .all();
      allAssets.push(...assets);
    }

    // Apply filters
    if (filters?.status) {
      allAssets = allAssets.filter((a) => a.status === filters.status);
    }
    if (filters?.platform) {
      allAssets = allAssets.filter((a) => a.platform === filters.platform);
    }

    // Sort by newest first
    allAssets.sort((a, b) => {
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt as unknown as string).getTime();
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt as unknown as string).getTime();
      return bTime - aTime;
    });

    // Fetch media job data for assets that have mediaJobId
    const assetIds = allAssets.map((a) => a.id);
    const mediaJobMap = new Map<string, { id: string; type: string; status: string; r2Key: string | null; error: string | null }>();

    // Look up media jobs linked to content assets via the content_asset_id field
    for (const asset of allAssets) {
      if (asset.mediaJobId) {
        const job = await db
          .select({
            id: mediaJobs.id,
            type: mediaJobs.type,
            status: mediaJobs.status,
            r2Key: mediaJobs.resultR2Key,
            error: mediaJobs.errorMessage,
          })
          .from(mediaJobs)
          .where(eq(mediaJobs.id, asset.mediaJobId))
          .get();
        if (job) {
          mediaJobMap.set(asset.id, {
            id: job.id,
            type: job.type,
            status: job.status ?? "queued",
            r2Key: job.r2Key ?? null,
            error: job.error ?? null,
          });
        }
      }
    }

    // Fetch the most recent scheduled_post for each content asset
    const publishedPostMap = new Map<string, {
      postStatus: string;
      platformPostUrl: string | null;
      publishedAt: number | null;
      errorMessage: string | null;
    }>();

    for (const asset of allAssets) {
      const sp = await db
        .select({
          postStatus: scheduledPosts.postStatus,
          platformPostUrl: scheduledPosts.platformPostUrl,
          publishedAt: scheduledPosts.publishedAt,
          errorMessage: scheduledPosts.errorMessage,
        })
        .from(scheduledPosts)
        .where(eq(scheduledPosts.contentAssetId, asset.id))
        .orderBy(desc(scheduledPosts.createdAt))
        .get();

      if (sp) {
        publishedPostMap.set(asset.id, {
          postStatus: sp.postStatus,
          platformPostUrl: sp.platformPostUrl ?? null,
          publishedAt: sp.publishedAt instanceof Date ? sp.publishedAt.getTime() : (sp.publishedAt ?? null),
          errorMessage: sp.errorMessage ?? null,
        });
      }
    }

    return allAssets.map((a) => ({
      id: a.id,
      projectId: a.projectId,
      projectTitle: projectMap.get(a.projectId)?.title ?? "Untitled",
      platform: a.platform,
      type: a.type,
      body: a.body,
      version: a.version ?? 1,
      status: a.status,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      mediaJob: mediaJobMap.get(a.id) ?? null,
      publishedPost: publishedPostMap.get(a.id) ?? null,
    }));
  });
}

// ─── Media Job Status (for polling) ───

export async function getMediaJobStatus(
  jobIds: string[]
): Promise<ActionResult<Record<string, { status: string; r2Key: string | null; error: string | null }>>> {
  return safeAction(async () => {
    await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const result: Record<string, { status: string; r2Key: string | null; error: string | null }> = {};

    for (const jobId of jobIds) {
      const job = await db
        .select({
          id: mediaJobs.id,
          status: mediaJobs.status,
          r2Key: mediaJobs.resultR2Key,
          error: mediaJobs.errorMessage,
        })
        .from(mediaJobs)
        .where(eq(mediaJobs.id, jobId))
        .get();

      if (job) {
        result[jobId] = {
          status: job.status ?? "queued",
          r2Key: job.r2Key ?? null,
          error: job.error ?? null,
        };
      }
    }

    return result;
  });
}

// ─── Autonomous Content Generation (Swarm Agent) ───

export interface AutonomousResult {
  projectId: string;
  assetsCreated: number;
  scheduled: number;
  skippedPlatforms: string[];
  summary: string;
}

/**
 * Full autopilot: generate multi-platform content, approve, and schedule
 * all in one action using the swarm ContentAgent.
 */
export async function autonomousGenerate(input: {
  title: string;
  brief: string;
  doctrineMode: string;
  platforms: string[];
  scheduledFor?: string;
}): Promise<ActionResult<AutonomousResult>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    // Get brand
    const brand = await db
      .select()
      .from(brandProfiles)
      .where(eq(brandProfiles.workspaceId, session.workspaceId))
      .get();

    if (!brand) throw new Error("Set up your Brand Vault first (Settings → Brand)");

    // Get connected accounts
    const accounts = await db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.workspaceId, session.workspaceId))
      .all();

    const activeAccounts = accounts.filter((a) => a.accountStatus === "active");

    // Run the swarm ContentAgent
    const agent = new ContentAgent();
    const agentContext: AgentContext = {
      workspaceId: session.workspaceId,
      missionId: `auto-${createId()}`,
      anthropicApiKey: "", // Agent uses generateWithClaude which reads env
      modelProvider: "anthropic",
      temperature: 0.7,
    };

    const agentOutput = await agent.execute(
      "generate_content",
      {
        instruction: input.brief,
        context: {
          platforms: input.platforms,
          doctrineMode: input.doctrineMode,
          brand: {
            brandName: brand.brandName,
            mission: brand.mission,
            tone: brand.tone,
            audience: brand.audience,
          },
        },
      },
      agentContext
    );

    // Persist drafts as content assets
    const projectId = createId();
    const now = new Date();

    await db.insert(contentProjects).values({
      id: projectId,
      workspaceId: session.workspaceId,
      title: `[Auto] ${input.title}`,
      brief: input.brief,
      doctrineMode: input.doctrineMode,
      status: "review",
      createdBy: session.userId,
      createdAt: now,
      updatedAt: now,
    });

    const drafts = (agentOutput.result as { drafts: Array<unknown> }).drafts as Array<{
      platform: string;
      type: string;
      body: string;
      success: boolean;
    }>;

    const assetIds: string[] = [];
    const skippedPlatforms: string[] = [];

    for (const draft of drafts) {
      if (!draft.success) {
        skippedPlatforms.push(draft.platform);
        continue;
      }

      const assetId = createId();
      await db.insert(contentAssets).values({
        id: assetId,
        projectId,
        platform: draft.platform as NewContentAsset["platform"],
        type: draft.type as NewContentAsset["type"],
        body: draft.body,
        version: 1,
        status: "approved", // Auto-approve
        createdAt: new Date(),
      });
      assetIds.push(assetId);
    }

    // Auto-schedule to matching accounts
    const scheduleTime = input.scheduledFor
      ? new Date(input.scheduledFor)
      : new Date(Date.now() + 3600000);

    let scheduled = 0;

    for (let i = 0; i < assetIds.length; i++) {
      const draft = drafts.filter((d) => d.success)[i];
      if (!draft) continue;

      const matchingAccount = activeAccounts.find(
        (a) => a.platform === draft.platform
      );

      if (!matchingAccount) {
        skippedPlatforms.push(draft.platform);
        continue;
      }

      await db.insert(scheduledPosts).values({
        id: createId(),
        workspaceId: session.workspaceId,
        contentAssetId: assetIds[i]!,
        connectedAccountId: matchingAccount.id,
        platform: draft.platform as NewScheduledPost["platform"],
        scheduledFor: scheduleTime,
        approvalMode: "autonomous",
        postStatus: "queued",
        createdBy: session.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      scheduled++;
    }

    return {
      projectId,
      assetsCreated: assetIds.length,
      scheduled,
      skippedPlatforms: [...new Set(skippedPlatforms)],
      summary: agentOutput.summary,
    };
  });
}

// ─── Get Single Asset ───

export async function getAsset(
  assetId: string
): Promise<ActionResult<ContentAssetWithProject | null>> {
  return safeAction(async () => {
    await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const asset = await db
      .select()
      .from(contentAssets)
      .where(eq(contentAssets.id, assetId))
      .get();

    if (!asset) return null;

    const project = await db
      .select()
      .from(contentProjects)
      .where(eq(contentProjects.id, asset.projectId))
      .get();

    return {
      id: asset.id,
      projectId: asset.projectId,
      projectTitle: project?.title ?? "Untitled",
      platform: asset.platform,
      type: asset.type,
      body: asset.body,
      version: asset.version ?? 1,
      status: asset.status,
      createdAt: asset.createdAt instanceof Date ? asset.createdAt.toISOString() : String(asset.createdAt),
    };
  });
}
