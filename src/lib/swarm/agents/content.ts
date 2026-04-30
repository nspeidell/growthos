import { BaseAgent, type AgentContext } from "./base-agent";
import type { TaskType, TaskInput, TaskOutput } from "../types";
import { generateWithClaude } from "@/lib/ai/claude";
import { buildSystemPrompt, type PromptContext } from "@/lib/ai/doctrine";
import type { DoctrineMode, Platform, ContentType } from "@/types/api";

/**
 * Default platform → content type mapping used by the autonomous agent.
 */
const PLATFORM_CONTENT_TYPE: Record<string, ContentType> = {
  instagram: "caption",
  facebook: "post",
  x: "thread",
  youtube: "script",
  linkedin: "post",
  reddit: "post",
  tiktok: "reel_script",
  pinterest: "pin",
  threads: "caption",
  google_business: "post",
  wordpress: "blog",
  medium: "blog",
  ghost: "blog",
  substack: "newsletter",
  website: "blog",
  email: "email",
};

/**
 * Content Creator Agent — autonomous multi-platform content generation.
 *
 * When invoked by the swarm orchestrator, this agent:
 *   1. Reads the brief from the task input
 *   2. Generates platform-customized content for every requested platform
 *   3. Returns structured artifacts that the orchestrator can persist + schedule
 *
 * Works with `generate_content`, `schedule_post`, and `review_brand_voice` tasks.
 */
export class ContentAgent extends BaseAgent {
  readonly role = "content" as const;
  readonly name = "Content Creator";
  readonly capabilities: TaskType[] = [
    "generate_content",
    "review_brand_voice",
    "schedule_post",
  ];

  async execute(
    taskType: TaskType,
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    switch (taskType) {
      case "generate_content":
        return this.generateMultiPlatformContent(input, context);
      case "schedule_post":
        return this.scheduleContent(input, context);
      case "review_brand_voice":
        return this.reviewBrandVoice(input, context);
      default:
        throw new Error(`ContentAgent cannot handle task type: ${taskType}`);
    }
  }

  /**
   * Generate content for multiple platforms from a single brief.
   *
   * Expected input.context:
   *   - platforms: string[]     — e.g. ["instagram", "x", "linkedin"]
   *   - doctrineMode: string    — e.g. "hormozi"
   *   - brand: { brandName, mission, tone, audience }
   *   - contentTypes?: Record<string, string>  — optional overrides
   */
  private async generateMultiPlatformContent(
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const ctx = (input.context ?? {}) as Record<string, unknown>;
    const platforms = (ctx.platforms as string[]) ?? ["instagram", "x", "linkedin"];
    const doctrineMode = (ctx.doctrineMode as string) ?? "balanced";
    const brand = (ctx.brand as {
      brandName: string;
      mission: string;
      tone: string;
      audience: string;
    }) ?? {
      brandName: "Brand",
      mission: "Grow the brand",
      tone: "Professional yet approachable",
      audience: "Entrepreneurs and creators",
    };
    const typeOverrides = (ctx.contentTypes as Record<string, string>) ?? {};

    const drafts: Array<{
      platform: string;
      type: string;
      body: string;
      success: boolean;
    }> = [];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const platform of platforms) {
      const contentType =
        typeOverrides[platform] ??
        PLATFORM_CONTENT_TYPE[platform] ??
        "post";

      const promptCtx: PromptContext = {
        mode: doctrineMode as DoctrineMode,
        brand: {
          brandName: brand.brandName,
          mission: brand.mission,
          tone: brand.tone,
          audience: brand.audience,
        },
        platform: platform as Platform,
        contentType: contentType as ContentType,
        additionalContext:
          "This content is being generated autonomously by the GrowthOS swarm engine. " +
          "Make it publish-ready — no placeholders, no TODO markers.",
      };

      const systemPrompt = buildSystemPrompt(promptCtx);

      try {
        const body = await generateWithClaude({
          systemPrompt,
          userMessage: input.instruction,
          maxTokens: 4096,
          temperature: context.temperature ?? 0.7,
        });

        // Rough token estimates (actual counts come from the API response
        // but generateWithClaude currently returns just the text)
        totalInputTokens += systemPrompt.length / 4 + input.instruction.length / 4;
        totalOutputTokens += body.length / 4;

        drafts.push({ platform, type: contentType, body, success: true });
      } catch (err) {
        drafts.push({
          platform,
          type: contentType,
          body: `[Generation failed: ${err instanceof Error ? err.message : "Unknown"}]`,
          success: false,
        });
      }
    }

    const succeeded = drafts.filter((d) => d.success);
    const failed = drafts.filter((d) => !d.success);

    return {
      result: {
        drafts,
        platforms,
        doctrineMode,
        generatedAt: new Date().toISOString(),
        stats: {
          total: drafts.length,
          succeeded: succeeded.length,
          failed: failed.length,
        },
      },
      summary:
        `Generated ${succeeded.length}/${drafts.length} platform drafts for: "${input.instruction.slice(0, 80)}..."` +
        (failed.length > 0
          ? ` (failed: ${failed.map((f) => f.platform).join(", ")})`
          : ""),
      score: succeeded.length / Math.max(drafts.length, 1),
      tokensUsed: Math.round(totalInputTokens + totalOutputTokens),
      costCents: this.estimateCost(
        Math.round(totalInputTokens),
        Math.round(totalOutputTokens),
        context.modelProvider
      ),
      artifacts: succeeded.map((d) => ({
        type: "content" as const,
        id: `draft-${d.platform}-${Date.now()}`,
        preview: d.body.slice(0, 120),
      })),
    };
  }

  /**
   * Schedule generated content to connected accounts.
   * This is a planning step — the orchestrator will call the actual
   * scheduling server actions after the agent returns.
   */
  private async scheduleContent(
    input: TaskInput,
    _context: AgentContext
  ): Promise<TaskOutput> {
    const ctx = (input.context ?? {}) as Record<string, unknown>;
    const assetIds = (ctx.assetIds as string[]) ?? [];
    const scheduledFor = (ctx.scheduledFor as string) ?? new Date(Date.now() + 3600000).toISOString();

    return {
      result: {
        action: "schedule_batch",
        assetIds,
        scheduledFor,
        instruction: input.instruction,
      },
      summary: `Prepared batch schedule for ${assetIds.length} assets at ${scheduledFor}`,
      score: 1.0,
      tokensUsed: 0,
      costCents: 0,
      artifacts: [],
    };
  }

  /**
   * Review content against brand voice guidelines.
   */
  private async reviewBrandVoice(
    input: TaskInput,
    context: AgentContext
  ): Promise<TaskOutput> {
    const systemPrompt = this.buildSystemPrompt(
      `You are a brand voice reviewer. Analyze the provided content against brand guidelines ` +
        `and score it for tone consistency, audience fit, and platform appropriateness. ` +
        `Return a JSON object with: score (0-1), issues (string[]), suggestions (string[]).`,
      context
    );

    try {
      const review = await generateWithClaude({
        systemPrompt,
        userMessage: input.instruction,
        maxTokens: 2048,
        temperature: 0.3,
      });

      return {
        result: { review },
        summary: `Brand voice review completed for: ${input.instruction.slice(0, 60)}...`,
        score: 0.9,
        tokensUsed: 800,
        costCents: this.estimateCost(500, 300, context.modelProvider),
      };
    } catch {
      return {
        result: { review: "Review failed" },
        summary: "Brand voice review failed",
        score: 0,
        tokensUsed: 0,
        costCents: 0,
      };
    }
  }
}
