"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import type { Workspace } from "@/lib/db/schema";

// ─── Validation ───

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

// ─── Types ───

export interface WorkspaceWithRole extends Workspace {
  role: string;
}

// ─── List User Workspaces ───

export async function listWorkspaces(): Promise<
  ActionResult<WorkspaceWithRole[]>
> {
  return safeAction(async () => {
    const session = await requireAuth();
    const { DB } = getBindings();
    const db = createDb(DB);

    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, session.userId))
      .all();

    const result: WorkspaceWithRole[] = [];

    for (const membership of memberships) {
      const workspace = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, membership.workspaceId))
        .get();

      if (workspace) {
        result.push({ ...workspace, role: membership.role });
      }
    }

    return result;
  });
}

// ─── Create Workspace ───

export async function createWorkspace(
  formData: FormData
): Promise<ActionResult<Workspace>> {
  return safeAction(async () => {
    const session = await requireAuth();
    const { DB } = getBindings();
    const db = createDb(DB);

    const input = CreateWorkspaceSchema.parse({
      name: formData.get("name"),
      slug: formData.get("slug"),
    });

    // Check slug uniqueness
    const existing = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, input.slug))
      .get();

    if (existing) {
      throw new Error("A workspace with this slug already exists");
    }

    const id = createId();
    const now = new Date();

    await db.insert(workspaces).values({
      id,
      name: input.name,
      slug: input.slug,
      ownerId: session.userId,
      plan: "free",
      createdAt: now,
    });

    // Add creator as owner
    await db.insert(workspaceMembers).values({
      id: createId(),
      workspaceId: id,
      userId: session.userId,
      role: "owner",
      joinedAt: now,
    });

    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .get();

    return workspace!;
  });
}

// ─── Switch Workspace ───

export async function switchWorkspace(
  workspaceId: string
): Promise<ActionResult<{ switched: boolean }>> {
  return safeAction(async () => {
    const session = await requireAuth();
    const { DB } = getBindings();
    const db = createDb(DB);

    // Verify user is a member of the target workspace
    const membership = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .all();

    const userMembership = membership.find(
      (m) => m.userId === session.userId
    );

    if (!userMembership) {
      throw new Error("You are not a member of this workspace");
    }

    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .get();

    if (!workspace) throw new Error("Workspace not found");

    // Create new session with updated workspace
    const newSessionId = await createSession({
      userId: session.userId,
      email: session.email,
      name: session.name,
      avatarUrl: session.avatarUrl,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      role: userMembership.role as "owner" | "admin" | "marketer" | "analyst" | "content_manager" | "viewer",
    });

    // Set new session cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, newSessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return { switched: true };
  });
}

// ─── Delete Workspace ───

export async function deleteWorkspace(
  workspaceId: string
): Promise<ActionResult<{ deleted: boolean }>> {
  return safeAction(async () => {
    const session = await requireAuth();
    const { DB } = getBindings();
    const db = createDb(DB);

    // Must be owner
    const membership = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .all();

    const userMembership = membership.find(
      (m) => m.userId === session.userId
    );

    if (!userMembership || userMembership.role !== "owner") {
      throw new Error("Only the workspace owner can delete it");
    }

    // Cascade delete handled by DB foreign keys
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    return { deleted: true };
  });
}
