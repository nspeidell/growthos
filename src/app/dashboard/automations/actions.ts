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
  trigger: z.enum(["subscriber_added", "tag_added", "lead_magnet_downloaded", "manual"]),
  triggerConfig: z.string().optional(), // JSON
  action: z.enum(["send_email", "add_tag", "wait", "webhook"]),
  actionConfig: z.string().optional(), // JSON
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
      trigger: formData.get("trigger"),
      triggerConfig: formData.get("triggerConfig") || undefined,
      action: formData.get("action"),
      actionConfig: formData.get("actionConfig") || undefined,
    });

    const id = createId();

    await db.insert(automations).values({
      id,
      workspaceId: session.workspaceId,
      name: input.name,
      trigger: input.trigger,
      triggerConfig: input.triggerConfig ?? null,
      action: input.action,
      actionConfig: input.actionConfig ?? null,
      isActive: true,
      executionCount: 0,
      createdAt: new Date(),
    });

    const automation = await db
      .select()
      .from(automations)
      .where(eq(automations.id, id))
      .get();

    return automation!;
  });
}

// ─── Toggle Active ───

export async function toggleAutomation(
  automationId: string
): Promise<ActionResult<{ isActive: boolean }>> {
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

    const newStatus = !existing.isActive;
    await db
      .update(automations)
      .set({ isActive: newStatus })
      .where(eq(automations.id, automationId));

    return { isActive: newStatus };
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
