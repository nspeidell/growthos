/**
 * Cloudflare Cron Worker: Token Refresh
 *
 * Runs hourly to refresh OAuth tokens that are expiring soon.
 * Tokens expiring within 1 hour get refreshed proactively.
 * Accounts with failed refresh attempts are marked as "expired".
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";
import { encrypt, decrypt } from "@/lib/utils/crypto";
import {
  PLATFORM_OAUTH_CONFIGS,
  refreshAccessToken,
} from "@/lib/auth/social-oauth";

const REFRESH_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour before expiry

interface ConnectedAccountRow {
  id: string;
  platform: string;
  refresh_token_encrypted: string | null;
  token_expires_at: number | null;
  account_status: string;
}

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: CloudflareEnv
  ): Promise<void> {
    const now = Date.now();
    const threshold = now + REFRESH_THRESHOLD_MS;

    // Find accounts with tokens expiring soon
    const { results: accounts } = await env.DB.prepare(
      `SELECT id, platform, refresh_token_encrypted, token_expires_at, account_status
       FROM connected_accounts
       WHERE account_status = 'active'
         AND token_expires_at IS NOT NULL
         AND token_expires_at < ?
         AND refresh_token_encrypted IS NOT NULL`
    )
      .bind(threshold)
      .all<ConnectedAccountRow>();

    if (!accounts || accounts.length === 0) return;

    for (const account of accounts) {
      try {
        const config = PLATFORM_OAUTH_CONFIGS[account.platform];
        if (!config) continue;

        const clientId = (env as unknown as Record<string, string>)[
          config.clientIdEnvKey
        ];
        const clientSecret = (env as unknown as Record<string, string>)[
          config.clientSecretEnvKey
        ];

        if (!clientId || !clientSecret || !account.refresh_token_encrypted) {
          continue;
        }

        // Decrypt refresh token
        const refreshToken = await decrypt(
          account.refresh_token_encrypted,
          env.ENCRYPTION_KEY
        );

        // Refresh the token
        const newTokens = await refreshAccessToken(
          config,
          refreshToken,
          clientId,
          clientSecret
        );

        // Encrypt new tokens
        const newAccessEncrypted = await encrypt(
          newTokens.accessToken,
          env.ENCRYPTION_KEY
        );
        const newRefreshEncrypted = newTokens.refreshToken
          ? await encrypt(newTokens.refreshToken, env.ENCRYPTION_KEY)
          : account.refresh_token_encrypted;

        const newExpiry = newTokens.expiresIn
          ? now + newTokens.expiresIn * 1000
          : null;

        // Update in D1
        await env.DB.prepare(
          `UPDATE connected_accounts
           SET access_token_encrypted = ?,
               refresh_token_encrypted = ?,
               token_expires_at = ?,
               account_status = 'active'
           WHERE id = ?`
        )
          .bind(newAccessEncrypted, newRefreshEncrypted, newExpiry, account.id)
          .run();
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `Token refresh failed for account ${account.id}: ${errorMsg}`
        );

        // Mark as expired so UI shows reconnect prompt
        await env.DB.prepare(
          `UPDATE connected_accounts
           SET account_status = 'expired'
           WHERE id = ?`
        )
          .bind(account.id)
          .run();
      }
    }
  },
};
