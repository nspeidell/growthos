"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { workspaceMembers, users, workspaces } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";

// ─── Types ───

export interface TeamMember {
  memberId: string;
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: Date;
}

const ROLES = [
  "owner",
  "admin",
  "marketer",
  "analyst",
  "content_manager",
  "viewer",
] as const;

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
});

const UpdateRoleSchema = z.object({
  memberId: z.string().min(1),
  role: z.enum(ROLES),
});

// ─── List Members ───

export async function listMembers(): Promise<ActionResult<TeamMember[]>> {
  return safeAction(async () => {
    const session = await requirePermission("team:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const members = await db
      .select({
        memberId: workspaceMembers.id,
        userId: workspaceMembers.userId,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, session.workspaceId))
      .all();

    return members;
  });
}

// ─── Invite Member ───

export async function inviteMember(
  formData: FormData
): Promise<ActionResult<{ invited: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("team:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = InviteSchema.parse({
      email: formData.get("email"),
      role: formData.get("role"),
    });

    // Cannot assign owner role via invite
    if (input.role === "owner") {
      throw new Error("Cannot invite with owner role");
    }

    // Check if user exists
    let user = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .get();

    // If user doesn't exist, create a placeholder
    if (!user) {
      const newId = createId();
      await db.insert(users).values({
        id: newId,
        email: input.email,
        name: input.email.split("@")[0] ?? "User",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      user = await db.select().from(users).where(eq(users.id, newId)).get();
    }

    if (!user) throw new Error("Failed to create user");

    // Check if already a member
    const existing = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, session.workspaceId),
          eq(workspaceMembers.userId, user.id)
        )
      )
      .get();

    if (existing) {
      throw new Error("User is already a member of this workspace");
    }

    await db.insert(workspaceMembers).values({
      id: createId(),
      workspaceId: session.workspaceId,
      userId: user.id,
      role: input.role,
      joinedAt: new Date(),
    });

    // In production, send invite email via Resend here
    return { invited: true };
  });
}

// ─── Update Role ───

export async function updateMemberRole(
  formData: FormData
): Promise<ActionResult<{ updated: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("team:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = UpdateRoleSchema.parse({
      memberId: formData.get("memberId"),
      role: formData.get("role"),
    });

    // Cannot change to owner via this action
    if (input.role === "owner") {
      throw new Error("Cannot assign owner role");
    }

    const member = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.id, input.memberId))
      .get();

    if (!member || member.workspaceId !== session.workspaceId) {
      throw new Error("Member not found");
    }

    // Cannot change owner's role
    if (member.role === "owner") {
      throw new Error("Cannot change workspace owner's role");
    }

    await db
      .update(workspaceMembers)
      .set({ role: input.role })
      .where(eq(workspaceMembers.id, input.memberId));

    return { updated: true };
  });
}

// ─── Remove Member ───

export async function removeMember(
  memberId: string
): Promise<ActionResult<{ removed: boolean }>> {
  return safeAction(async () => {
    const session = await requirePermission("team:write");
    const { DB } = getBindings();
    const db = createDb(DB);

    const member = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.id, memberId))
      .get();

    if (!member || member.workspaceId !== session.workspaceId) {
      throw new Error("Member not found");
    }

    // Cannot remove workspace owner
    if (member.role === "owner") {
      throw new Error("Cannot remove workspace owner");
    }

    // Cannot remove yourself (prevents locked-out workspace)
    if (member.userId === session.userId) {
      throw new Error("Cannot remove yourself from the workspace");
    }

    await db
      .delete(workspaceMembers)
      .where(eq(workspaceMembers.id, memberId));

    return { removed: true };
  });
}
