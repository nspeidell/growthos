/**
 * enrollSubscriber
 *
 * Enroll a subscriber into all active automations that match the given trigger.
 * Called from /api/subscribe after a new subscriber is created.
 * Silently ignores UNIQUE constraint violations (double-enroll prevention).
 */

import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { createDb } from "@/lib/db/client";
import { automations, automationEnrollments } from "@/lib/db/schema";

export async function enrollSubscriber(opts: {
  subscriberId: string;
  workspaceId: string;
  triggerType: "subscribe" | "lead_magnet" | "tag_added" | "manual";
  triggerValue?: string; // lead magnet slug or tag name
  db: ReturnType<typeof createDb>;
}) {
  const { subscriberId, workspaceId, triggerType, triggerValue, db } = opts;
  const now = Date.now();

  const matchingAutomations = await db
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.workspaceId, workspaceId),
        eq(automations.automationStatus, "active"),
        eq(automations.triggerType, triggerType)
      )
    )
    .all();

  for (const automation of matchingAutomations) {
    // For lead_magnet trigger, optionally filter by slug
    if (triggerType === "lead_magnet" && automation.triggerConfig && triggerValue) {
      try {
        const config = JSON.parse(automation.triggerConfig) as { slug?: string };
        if (config.slug && config.slug !== triggerValue) continue;
      } catch { /* ignore bad config */ }
    }

    // Don't double-enroll (UNIQUE constraint on automation_id + subscriber_id)
    try {
      await db.insert(automationEnrollments).values({
        id: createId(),
        automationId: automation.id,
        subscriberId,
        workspaceId,
        currentStep: 0,
        enrollmentStatus: "active",
        nextStepAt: null, // run immediately on next cron tick
        enrolledAt: now,
      });

      // Increment enrolled count
      await db
        .update(automations)
        .set({ enrolledCount: (automation.enrolledCount ?? 0) + 1 })
        .where(eq(automations.id, automation.id));
    } catch {
      // UNIQUE constraint violation = already enrolled, skip silently
    }
  }
}
