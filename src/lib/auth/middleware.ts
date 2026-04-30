import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getSession,
  SESSION_COOKIE_NAME,
  type SessionData,
} from "./session";

// ═══════════════════════════════════════════
// Permission System
// ═══════════════════════════════════════════

export type Permission =
  | "content:read"
  | "content:write"
  | "publish:write"
  | "publish:queue"
  | "publish:approve"
  | "analytics:read"
  | "analytics:write"
  | "team:read"
  | "team:write"
  | "billing:read"
  | "billing:write"
  | "settings:write"
  | "swarm:read"
  | "swarm:launch"
  | "swarm:admin"
  | "experiments:read"
  | "experiments:write"
  | "experiments:admin"
  | "signals:read"
  | "signals:write"
  | "signals:admin";

/**
 * Role → Permission mapping.
 * Hierarchical: owner has everything, viewer has read-only.
 */
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    "content:read",
    "content:write",
    "publish:write",
    "publish:queue",
    "publish:approve",
    "analytics:read",
    "analytics:write",
    "team:read",
    "team:write",
    "billing:read",
    "billing:write",
    "settings:write",
    "swarm:read",
    "swarm:launch",
    "swarm:admin",
    "experiments:read",
    "experiments:write",
    "experiments:admin",
    "signals:read",
    "signals:write",
    "signals:admin",
  ],
  admin: [
    "content:read",
    "content:write",
    "publish:write",
    "publish:queue",
    "publish:approve",
    "analytics:read",
    "analytics:write",
    "team:read",
    "team:write",
    "billing:read",
    "settings:write",
    "swarm:read",
    "swarm:launch",
    "swarm:admin",
    "experiments:read",
    "experiments:write",
    "experiments:admin",
    "signals:read",
    "signals:write",
    "signals:admin",
  ],
  marketer: [
    "content:read",
    "content:write",
    "publish:write",
    "publish:queue",
    "publish:approve",
    "analytics:read",
    "swarm:read",
    "swarm:launch",
    "experiments:read",
    "experiments:write",
    "signals:read",
    "signals:write",
  ],
  analyst: [
    "content:read",
    "analytics:read",
    "analytics:write",
    "swarm:read",
    "experiments:read",
    "signals:read",
  ],
  content_manager: [
    "content:read",
    "content:write",
    "publish:queue",
    "analytics:read",
    "swarm:read",
    "experiments:read",
    "signals:read",
  ],
  viewer: [
    "content:read",
    "analytics:read",
    "swarm:read",
    "experiments:read",
    "signals:read",
  ],
};

// ═══════════════════════════════════════════
// Auth Guards
// ═══════════════════════════════════════════

/**
 * Require authentication. Redirects to /login if no valid session.
 * Use in Server Components and Server Actions.
 */
export async function requireAuth(): Promise<SessionData> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    redirect("/login");
  }

  const session = await getSession(sessionId);

  if (!session) {
    redirect("/login");
  }

  return session;
}

/**
 * Require a specific permission. Throws if the user's role doesn't include it.
 */
export async function requirePermission(
  permission: Permission
): Promise<SessionData> {
  const session = await requireAuth();
  const permissions = ROLE_PERMISSIONS[session.role] ?? [];

  if (!permissions.includes(permission)) {
    throw new PermissionError(
      `Role "${session.role}" does not have permission "${permission}"`
    );
  }

  return session;
}

/**
 * Check if a role has a specific permission (without throwing).
 */
export function hasPermission(
  role: string,
  permission: Permission
): boolean {
  const permissions = ROLE_PERMISSIONS[role] ?? [];
  return permissions.includes(permission);
}

/**
 * Get all permissions for a role.
 */
export function getPermissions(role: string): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Try to get the current session without redirecting.
 * Returns null if not authenticated.
 */
export async function getOptionalSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) return null;

  return getSession(sessionId);
}

// ═══════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════

export class AuthError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthError";
  }
}

export class PermissionError extends Error {
  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "PermissionError";
  }
}
