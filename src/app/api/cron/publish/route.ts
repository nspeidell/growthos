/**
 * GET /api/cron/publish
 *
 * Triggered every minute by Cloudflare cron.
 * Finds queued posts whose scheduled_for <= now, publishes them inline,
 * and updates their status.
 *
 * No queue needed — publishes directly in the request lifecycle.
 * Can also be called manually for testing.
 */

import { NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";
import { decrypt } from "@/lib/utils/crypto";
import { publishToplatform } from "@/lib/publishers/adapters";

export const runtime = "edge";

// Allow up to 60 seconds for publishing (Cloudflare edge max is 30s CPU,
// but wall-clock with fetch can go longer)
export const maxDuration = 60;

const MAX_RETRIES = 3;

export async function GET() {
  try {
    return await handlePublish();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json({ error: message, stack }, { status: 500 });
  }
}

async function handlePublish() {
  const env = getBindings();
  const now = Date.now();

  // Find queued posts that are due
  const { results: duePosts } = await env.DB.prepare(
    `SELECT
       sp.id, sp.platform, sp.retry_count, sp.metadata,
       ca.id as connected_account_id,
       ca.access_token_encrypted,
       ca.refresh_token_encrypted,
       ca.token_expires_at,
       ca.platform_account_id,
       cas.body as content_body
     FROM scheduled_posts sp
     JOIN connected_accounts ca ON sp.connected_account_id = ca.id
     JOIN content_assets cas ON sp.content_asset_id = cas.id
     WHERE sp.post_status = 'queued'
       AND sp.scheduled_for <= ?
       AND ca.account_status = 'active'
     ORDER BY sp.scheduled_for ASC
     LIMIT 20`
  )
    .bind(now)
    .all<{
      id: string;
      platform: string;
      retry_count: number;
      metadata: string | null;
      connected_account_id: string;
      access_token_encrypted: string;
      refresh_token_encrypted: string | null;
      token_expires_at: number | null;
      platform_account_id: string | null;
      content_body: string;
    }>();

  if (!duePosts || duePosts.length === 0) {
    return NextResponse.json({ published: 0, message: "No posts due" });
  }

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const post of duePosts) {
    // Mark as publishing
    await env.DB.prepare(
      `UPDATE scheduled_posts SET post_status = 'publishing', updated_at = ? WHERE id = ?`
    )
      .bind(now, post.id)
      .run();

    try {
      let accessToken = await decrypt(
        post.access_token_encrypted,
        env.ENCRYPTION_KEY
      );

      // ── Token refresh for short-lived tokens (e.g. X OAuth 2.0 = 2hr TTL) ──
      // token_expires_at is stored as Unix seconds. Refresh if expired or
      // expiring within the next 5 minutes.
      if (post.platform === "x" && post.refresh_token_encrypted && post.token_expires_at) {
        const expiresAtMs = post.token_expires_at * 1000;
        const bufferMs = 5 * 60 * 1000;
        if (now >= expiresAtMs - bufferMs) {
          const refreshToken = await decrypt(post.refresh_token_encrypted, env.ENCRYPTION_KEY);
          const clientId = (env as unknown as Record<string, string>).X_CLIENT_ID;
          const clientSecret = (env as unknown as Record<string, string>).X_CLIENT_SECRET;

          const refreshRes = await fetch("https://api.x.com/2/oauth2/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: "Basic " + btoa(`${clientId}:${clientSecret}`),
            },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: refreshToken,
            }),
          });

          if (refreshRes.ok) {
            const refreshData = await refreshRes.json() as {
              access_token: string;
              refresh_token?: string;
              expires_in?: number;
            };

            accessToken = refreshData.access_token;
            const newExpiresAt = refreshData.expires_in
              ? Math.floor((now / 1000) + refreshData.expires_in)
              : null;

            // Encrypt and persist the new tokens
            const { encrypt } = await import("@/lib/utils/crypto");
            const newAccessEnc = await encrypt(accessToken, env.ENCRYPTION_KEY);
            const newRefreshEnc = refreshData.refresh_token
              ? await encrypt(refreshData.refresh_token, env.ENCRYPTION_KEY)
              : post.refresh_token_encrypted;

            await env.DB.prepare(
              `UPDATE connected_accounts
               SET access_token_encrypted = ?,
                   refresh_token_encrypted = ?,
                   token_expires_at = ?
               WHERE id = ?`
            )
              .bind(newAccessEnc, newRefreshEnc, newExpiresAt, post.connected_account_id)
              .run();
          }
          // If refresh fails, proceed with the existing token and let the
          // platform adapter surface a meaningful error.
        }
      }

      const metadata: Record<string, unknown> = post.metadata
        ? (JSON.parse(post.metadata) as Record<string, unknown>)
        : {};

      // Pass the connected account's platform_account_id so adapters can
      // use it as a fallback (e.g. Facebook page ID for New Pages Experience)
      if (post.platform_account_id) {
        metadata._accountId = post.platform_account_id;
      }

      const result = await publishToplatform(post.platform, {
        body: post.content_body,
        accessToken,
        metadata,
      });

      await env.DB.prepare(
        `UPDATE scheduled_posts
         SET post_status = 'published',
             platform_post_id = ?,
             platform_post_url = ?,
             published_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(result.platformPostId, result.platformPostUrl, now, now, post.id)
        .run();

      results.push({ id: post.id, status: "published" });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      const nextRetry = post.retry_count + 1;
      const newStatus = nextRetry >= MAX_RETRIES ? "failed" : "queued";

      // Exponential backoff: requeue with delay if retries remain
      const retryDelayMs = newStatus === "queued"
        ? Math.pow(2, nextRetry) * 60 * 1000 // 2m, 4m, 8m
        : 0;

      await env.DB.prepare(
        `UPDATE scheduled_posts
         SET post_status = ?,
             retry_count = ?,
             scheduled_for = CASE WHEN ? > 0 THEN ? + ? ELSE scheduled_for END,
             error_message = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(
          newStatus,
          nextRetry,
          retryDelayMs,
          now,
          retryDelayMs,
          errorMessage,
          now,
          post.id
        )
        .run();

      results.push({ id: post.id, status: newStatus, error: errorMessage });
    }
  }

  return NextResponse.json({
    published: results.filter((r) => r.status === "published").length,
    failed: results.filter((r) => r.status === "failed").length,
    requeued: results.filter((r) => r.status === "queued").length,
    results,
  });
}
