"use server";

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { automations } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { Automation } from "@/lib/db/schema";

// ─── Validation ───

const CreateAutomationSchema = z.object({
  name: z.string().min(1).max(200),
  triggerType: z.enum(["subscribe", "tag_added", "lead_magnet", "manual"]),
  triggerConfig: z.string().optional(), // JSON
  steps: z.string().min(1), // JSON array of steps
});

// ─── List Automations ───

export async function listAutomations(): Promise<ActionResult<Automation[]>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    return db
      .select()
      .from(automations)
      .where(eq(automations.workspaceId, session.workspaceId))
      .orderBy(desc(automations.createdAt))
      .all();
  });
}

// ─── Create Automation ───

export async function createAutomation(
  formData: FormData
): Promise<ActionResult<Automation>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateAutomationSchema.parse({
      name: formData.get("name"),
      triggerType: formData.get("triggerType"),
      triggerConfig: formData.get("triggerConfig") || undefined,
      steps: formData.get("steps"),
    });

    const id = createId();
    const now = new Date();

    await db.insert(automations).values({
      id,
      workspaceId: session.workspaceId,
      name: input.name,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig ?? null,
      steps: input.steps,
      automationStatus: "draft",
      enrolledCount: 0,
      completedCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    const automation = await db
      .select()
      .from(automations)
      .where(eq(automations.id, id))
      .get();

    return automation!;
  });
}

// ─── Toggle Status ───

export async function toggleAutomation(
  automationId: string
): Promise<ActionResult<{ automationStatus: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId))
      .get();

    if (!existing || existing.workspaceId !== session.workspaceId) {
      throw new Error("Automation not found");
    }

    const newStatus = existing.automationStatus === "active" ? "paused" : "active";
    await db
      .update(automations)
      .set({ automationStatus: newStatus, updatedAt: new Date() })
      .where(eq(automations.id, automationId));

    return { automationStatus: newStatus };
  });
}

// ─── Delete Automation ───

export async function deleteAutomation(
  automationId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const existing = await db
      .select()
      .from(automations)
      .where(eq(automations.id, automationId))
      .get();

    if (!existing || existing.workspaceId !== session.workspaceId) {
      throw new Error("Automation not found");
    }

    await db.delete(automations).where(eq(automations.id, automationId));
    return { deleted: true };
  });
}
