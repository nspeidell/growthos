import { createId } from "@paralleldrive/cuid2";
import { kvGet, kvSet, kvDelete } from "@/lib/cloudflare/kv";
import type { Role } from "@/lib/db/schema";

const SESSION_PREFIX = "session:";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Session data stored in KV.
 */
export interface SessionData {
  userId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  workspaceId: string;
  workspaceName: string;
  role: Role;
}

/**
 * Create a new session in KV and return the session ID.
 */
export async function createSession(data: SessionData): Promise<string> {
  const sessionId = createId();
  await kvSet(
    `${SESSION_PREFIX}${sessionId}`,
    data,
    SESSION_TTL_SECONDS
  );
  return sessionId;
}

/**
 * Get session data from KV by session ID.
 */
export async function getSession(
  sessionId: string
): Promise<SessionData | null> {
  return kvGet<SessionData>(`${SESSION_PREFIX}${sessionId}`);
}

/**
 * Delete a session from KV (logout).
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await kvDelete(`${SESSION_PREFIX}${sessionId}`);
}

/**
 * Refresh a session's TTL (extend expiry on activity).
 */
export async function refreshSession(
  sessionId: string,
  data: SessionData
): Promise<void> {
  await kvSet(
    `${SESSION_PREFIX}${sessionId}`,
    data,
    SESSION_TTL_SECONDS
  );
}

/**
 * Cookie configuration for session ID.
 */
export const SESSION_COOKIE_NAME = "growthos_session";

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
