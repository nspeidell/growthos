import { z } from "zod";
import { AuthError, PermissionError } from "@/lib/auth/middleware";

// ═══════════════════════════════════════════
// API Response Types
// ═══════════════════════════════════════════

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ErrorCode };

export type ErrorCode =
  | "VALIDATION"
  | "AUTH"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL";

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalItems: number;
  };
}

// ═══════════════════════════════════════════
// Safe Action Wrapper
// ═══════════════════════════════════════════

/**
 * Wraps an async function with standardized error handling.
 * Use in Server Actions and Route Handlers.
 */
export async function safeAction<T>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? "Validation error",
        code: "VALIDATION",
      };
    }

    if (error instanceof AuthError) {
      return {
        success: false,
        error: "Authentication required",
        code: "AUTH",
      };
    }

    if (error instanceof PermissionError) {
      return {
        success: false,
        error: "Insufficient permissions",
        code: "FORBIDDEN",
      };
    }

    // Log unexpected errors
    console.error(
      JSON.stringify({
        level: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred",
      code: "INTERNAL",
    };
  }
}

// ═══════════════════════════════════════════
// Rate Limiting
// ═══════════════════════════════════════════

/**
 * KV-backed sliding window rate limiter.
 */
export async function rateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const current = parseInt((await kv.get(key)) ?? "0");

  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }

  await kv.put(key, String(current + 1), {
    expirationTtl: windowSeconds,
  });

  return { allowed: true, remaining: limit - current - 1 };
}
