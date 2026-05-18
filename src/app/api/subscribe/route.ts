/**
 * POST /api/subscribe
 *
 * Public email capture endpoint. Used by:
 * - /waitlist page
 * - /subscribe page (public newsletter signup)
 * - /lead-magnet/[slug] pages
 *
 * No authentication required.
 * Rate-limited by workspace slug + IP (future).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { subscribers, workspaces, leadMagnets } from "@/lib/db/schema";
import { enrollSubscriber } from "@/lib/automations/enroll";

export const runtime = "edge";

const SubscribeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  workspaceSlug: z.string().min(1),
  source: z.enum(["waitlist", "newsletter", "lead_magnet"]),
  leadMagnetSlug: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const env = getBindings();
  const db = createDb(env.DB);

  let input: z.infer<typeof SubscribeSchema>;
  try {
    const body = await request.json();
    input = SubscribeSchema.parse(body);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Find workspace by slug
  const workspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, input.workspaceSlug))
    .get();

  if (!workspace) {
    return NextResponse.json(
      { error: "Workspace not found" },
      { status: 404 }
    );
  }

  // Check for duplicate
  const existing = await db
    .select()
    .from(subscribers)
    .where(
      and(
        eq(subscribers.workspaceId, workspace.id),
        eq(subscribers.email, input.email)
      )
    )
    .get();

  if (existing) {
    // Reactivate if previously unsubscribed
    if (existing.subscriberStatus === "unsubscribed") {
      await db
        .update(subscribers)
        .set({ subscriberStatus: "active", unsubscribedAt: null })
        .where(eq(subscribers.id, existing.id));
    }
    // Still return the download URL so returning visitors can get the file
    let existingDownloadUrl: string | null = null;
    if (input.source === "lead_magnet" && input.leadMagnetSlug) {
      const lm = await db
        .select()
        .from(leadMagnets)
        .where(
          and(
            eq(leadMagnets.workspaceId, workspace.id),
            eq(leadMagnets.slug, input.leadMagnetSlug)
          )
        )
        .get();
      if (lm) existingDownloadUrl = lm.fileUrl;
    }
    return NextResponse.json({
      success: true,
      resubscribed: true,
      ...(existingDownloadUrl ? { downloadUrl: existingDownloadUrl } : {}),
    });
  }

  // Validate lead magnet if source is lead_magnet
  let resolvedLeadMagnetSlug: string | null = null;
  let downloadUrl: string | null = null;
  if (input.source === "lead_magnet" && input.leadMagnetSlug) {
    const lm = await db
      .select()
      .from(leadMagnets)
      .where(
        and(
          eq(leadMagnets.workspaceId, workspace.id),
          eq(leadMagnets.slug, input.leadMagnetSlug)
        )
      )
      .get();

    if (lm) {
      resolvedLeadMagnetSlug = lm.slug;
      downloadUrl = lm.fileUrl;
      // Increment download count
      await db
        .update(leadMagnets)
        .set({ downloads: (lm.downloads ?? 0) + 1 })
        .where(eq(leadMagnets.id, lm.id));
    }
  }

  // Create subscriber
  const tags = [
    ...(input.tags ?? []),
    input.source,
    ...(resolvedLeadMagnetSlug ? [`lm:${resolvedLeadMagnetSlug}`] : []),
  ];

  const newId = createId();
  await db.insert(subscribers).values({
    id: newId,
    workspaceId: workspace.id,
    email: input.email,
    name: input.name ?? null,
    tags: JSON.stringify(tags),
    source: input.source,
    leadMagnetSlug: resolvedLeadMagnetSlug,
    subscriberStatus: "active",
    subscribedAt: new Date(),
  });

  // Update KV count
  const countKey = `subscribers_count:${workspace.id}`;
  const current = await env.KV.get(countKey);
  await env.KV.put(countKey, String((current ? parseInt(current) : 0) + 1));

  // Enroll in any matching automations — must be awaited so Cloudflare's edge
  // runtime doesn't terminate the execution context before the insert completes.
  // (Fire-and-forget promises are not guaranteed to finish after Response is sent.)
  const triggerType = input.source === "lead_magnet" ? "lead_magnet" : "subscribe";
  await enrollSubscriber({
    subscriberId: newId,
    workspaceId: workspace.id,
    triggerType,
    triggerValue: input.leadMagnetSlug,
    db,
  }).catch(() => { /* enrollment failure is non-critical; subscriber is already saved */ });

  return NextResponse.json({
    success: true,
    ...(downloadUrl ? { downloadUrl } : {}),
  });
}
