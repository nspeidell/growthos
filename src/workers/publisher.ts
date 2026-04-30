/**
 * Cloudflare Worker: Publisher
 *
 * Two trigger modes:
 * 1. Cron (every minute): scans for queued posts whose scheduled_for <= now,
 *    sends them to PUBLISH_QUEUE.
 * 2. Queue Consumer: processes publish jobs — decrypts tokens, calls platform
 *    adapter, updates status.
 *
 * Retry logic: up to 3 attempts with exponential backoff.
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";
import { decrypt } from "@/lib/utils/crypto";
import { publishToplatform } from "@/lib/publishers/adapters";

const MAX_RETRIES = 3;

interface PublishJobMessage {
  postId: string;
  platform: string;
  contentBody: string;
  accessTokenEncrypted: string;
  metadata?: string;
  retryCount: number;
}

export default {
  /**
   * Cron trigger: find due posts and enqueue them.
   */
  async scheduled(
    _event: ScheduledEvent,
    env: CloudflareEnv
  ): Promise<void> {
    const now = Date.now();

    // Find queued posts that are due
    const { results: duePosts } = await env.DB.prepare(
      `SELECT
         sp.id, sp.platform, sp.content_asset_id, sp.connected_account_id,
         sp.metadata, sp.retry_count,
         ca.access_token_encrypted,
         cas.body as content_body
       FROM scheduled_posts sp
       JOIN connected_accounts ca ON sp.connected_account_id = ca.id
       JOIN content_assets cas ON sp.content_asset_id = cas.id
       WHERE sp.post_status = 'queued'
         AND sp.scheduled_for <= ?
         AND ca.account_status = 'active'
       ORDER BY sp.scheduled_for ASC
       LIMIT 50`
    )
      .bind(now)
      .all<{
        id: string;
        platform: string;
        content_body: string;
        access_token_encrypted: string;
        metadata: string | null;
        retry_count: number;
      }>();

    if (!duePosts || duePosts.length === 0) return;

    // Mark all as 'publishing' and send to queue
    for (const post of duePosts) {
      await env.DB.prepare(
        `UPDATE scheduled_posts SET post_status = 'publishing', updated_at = ? WHERE id = ?`
      )
        .bind(now, post.id)
        .run();

      const message: PublishJobMessage = {
        postId: post.id,
        platform: post.platform,
        contentBody: post.content_body,
        accessTokenEncrypted: post.access_token_encrypted,
        metadata: post.metadata ?? undefined,
        retryCount: post.retry_count,
      };

      await env.PUBLISH_QUEUE.send(message);
    }
  },

  /**
   * Queue consumer: process publish jobs.
   */
  async queue(
    batch: MessageBatch<PublishJobMessage>,
    env: CloudflareEnv
  ): Promise<void> {
    for (const msg of batch.messages) {
      const job = msg.body;

      try {
        // Decrypt access token
        const accessToken = await decrypt(
          job.accessTokenEncrypted,
          env.ENCRYPTION_KEY
        );

        // Parse metadata
        const metadata = job.metadata
          ? (JSON.parse(job.metadata) as Record<string, unknown>)
          : undefined;

        // Publish via platform adapter
        const result = await publishToplatform(job.platform, {
          body: job.contentBody,
          accessToken,
          metadata,
        });

        // Mark as published
        const now = Date.now();
        await env.DB.prepare(
          `UPDATE scheduled_posts
           SET post_status = 'published',
               platform_post_id = ?,
               platform_post_url = ?,
               published_at = ?,
               updated_at = ?
           WHERE id = ?`
        )
          .bind(
            result.platformPostId,
            result.platformPostUrl,
            now,
            now,
            job.postId
          )
          .run();

        // Update last_used_at on connected account
        await env.DB.prepare(
          `UPDATE connected_accounts SET last_used_at = ? WHERE access_token_encrypted = ?`
        )
          .bind(now, job.accessTokenEncrypted)
          .run();

        msg.ack();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        if (job.retryCount >= MAX_RETRIES) {
          // Max retries exceeded — mark as failed
          await env.DB.prepare(
            `UPDATE scheduled_posts
             SET post_status = 'failed',
                 error_message = ?,
                 updated_at = ?
             WHERE id = ?`
          )
            .bind(
              `Failed after ${MAX_RETRIES} attempts: ${errorMessage}`,
              Date.now(),
              job.postId
            )
            .run();

          msg.ack(); // Don't retry further
        } else {
          // Increment retry count and retry with backoff
          await env.DB.prepare(
            `UPDATE scheduled_posts
             SET retry_count = retry_count + 1,
                 error_message = ?,
                 post_status = 'queued',
                 updated_at = ?
             WHERE id = ?`
          )
            .bind(errorMessage, Date.now(), job.postId)
            .run();

          const backoffSeconds = Math.pow(2, job.retryCount + 1) * 15; // 30s, 60s, 120s
          msg.retry({ delaySeconds: backoffSeconds });
        }
      }
    }
  },
};
