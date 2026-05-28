/**
 * Cloudflare Worker: Token Refresher
 *
 * Runs every hour. Finds connected accounts whose tokens expire within
 * 24 hours and proactively refreshes them so publishing never fails
 * due to an expired token.
 *
 * Platforms handled:
 * - X (Twitter): OAuth 2.0 refresh token flow (tokens expire in 2 hours)
 * - Facebook: extend long-lived token (tokens last 60 days)
 * - Instagram: refresh long-lived token via graph.instagram.com
 * - Threads: refresh long-lived token via graph.threads.net
 * - LinkedIn: OAuth 2.0 refresh token flow (tokens expire in 60 days)
 */

import type { CloudflareEnv } from "@/lib/cloudflare/bindings";
import { decrypt, encrypt } from "../lib/utils/crypto";

const REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // refresh if expiring within 24h

interface ConnectedAccount {
  id: string;
  platform: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: number | null; // Unix seconds
}

export default {
  async scheduled(_event: ScheduledEvent, env: CloudflareEnv): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const windowSec = Math.floor((Date.now() + REFRESH_WINDOW_MS) / 1000);

    // Find accounts expiring within the refresh window
    const { results } = await env.DB.prepare(
      `SELECT id, platform, access_token_encrypted, refresh_token_encrypted, token_expires_at
       FROM connected_accounts
       WHERE account_status = 'active'
         AND token_expires_at IS NOT NULL
         AND token_expires_at <= ?
       ORDER BY token_expires_at ASC
       LIMIT 100`
    )
      .bind(windowSec)
      .all<ConnectedAccount>();

    if (!results || results.length === 0) return;

    console.log(`[token-refresher] Found ${results.length} account(s) needing refresh`);

    for (const account of results) {
      try {
        await refreshAccount(account, env, nowSec);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[token-refresher] Failed to refresh ${account.platform} (${account.id}): ${msg}`);
        // Mark as error so the UI can prompt reconnect
        await env.DB.prepare(
          `UPDATE connected_accounts SET account_status = 'error', updated_at = ? WHERE id = ?`
        ).bind(Date.now(), account.id).run();
      }
    }
  },
};

async function refreshAccount(
  account: ConnectedAccount,
  env: CloudflareEnv,
  nowSec: number
): Promise<void> {
  const env2 = env as unknown as Record<string, string>;

  switch (account.platform) {
    case "x":
      await refreshXToken(account, env, env2);
      break;
    case "facebook":
      await refreshFacebookToken(account, env, env2);
      break;
    case "instagram":
      await refreshInstagramToken(account, env);
      break;
    case "threads":
      await refreshThreadsToken(account, env);
      break;
    case "linkedin":
      await refreshLinkedInToken(account, env, env2);
      break;
    default:
      // Platform doesn't support token refresh — mark expired
      console.log(`[token-refresher] No refresh support for ${account.platform} (${account.id}) — marking error`);
      await env.DB.prepare(
        `UPDATE connected_accounts SET account_status = 'error', updated_at = ? WHERE id = ?`
      ).bind(Date.now(), account.id).run();
  }

  void nowSec; // suppress unused warning
}

// ─── X (Twitter) ───

async function refreshXToken(
  account: ConnectedAccount,
  env: CloudflareEnv,
  env2: Record<string, string>
): Promise<void> {
  if (!account.refresh_token_encrypted) {
    throw new Error("No refresh token stored for X");
  }

  const refreshToken = await decrypt(account.refresh_token_encrypted, env.ENCRYPTION_KEY);

  const res = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${env2["X_CLIENT_ID"]}:${env2["X_CLIENT_SECRET"]}`),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`X refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const newAccessEnc = await encrypt(data.access_token, env.ENCRYPTION_KEY);
  const newRefreshEnc = await encrypt(data.refresh_token, env.ENCRYPTION_KEY);
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

  await env.DB.prepare(
    `UPDATE connected_accounts
     SET access_token_encrypted = ?, refresh_token_encrypted = ?, token_expires_at = ?,
         account_status = 'active', updated_at = ?
     WHERE id = ?`
  ).bind(newAccessEnc, newRefreshEnc, expiresAt, Date.now(), account.id).run();

  console.log(`[token-refresher] X token refreshed for ${account.id}, expires in ${data.expires_in}s`);
}

// ─── Facebook ───

async function refreshFacebookToken(
  account: ConnectedAccount,
  env: CloudflareEnv,
  env2: Record<string, string>
): Promise<void> {
  const accessToken = await decrypt(account.access_token_encrypted, env.ENCRYPTION_KEY);
  const appId = env2["META_APP_ID"];
  const appSecret = env2["META_APP_SECRET"];

  // Facebook long-lived token exchange
  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${accessToken}`
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Facebook token refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in?: number;
  };

  const newAccessEnc = await encrypt(data.access_token, env.ENCRYPTION_KEY);
  // Long-lived tokens last ~60 days
  const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in ?? 5183944);

  await env.DB.prepare(
    `UPDATE connected_accounts
     SET access_token_encrypted = ?, token_expires_at = ?,
         account_status = 'active', updated_at = ?
     WHERE id = ?`
  ).bind(newAccessEnc, expiresAt, Date.now(), account.id).run();

  console.log(`[token-refresher] Facebook token refreshed for ${account.id}`);
}

// ─── Instagram ───

async function refreshInstagramToken(
  account: ConnectedAccount,
  env: CloudflareEnv
): Promise<void> {
  const accessToken = await decrypt(account.access_token_encrypted, env.ENCRYPTION_KEY);

  const res = await fetch(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${accessToken}`
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Instagram token refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: number;
  };

  const newAccessEnc = await encrypt(data.access_token, env.ENCRYPTION_KEY);
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

  await env.DB.prepare(
    `UPDATE connected_accounts
     SET access_token_encrypted = ?, token_expires_at = ?,
         account_status = 'active', updated_at = ?
     WHERE id = ?`
  ).bind(newAccessEnc, expiresAt, Date.now(), account.id).run();

  console.log(`[token-refresher] Instagram token refreshed for ${account.id}`);
}

// ─── Threads ───

async function refreshThreadsToken(
  account: ConnectedAccount,
  env: CloudflareEnv
): Promise<void> {
  const accessToken = await decrypt(account.access_token_encrypted, env.ENCRYPTION_KEY);

  const res = await fetch(
    `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${accessToken}`
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Threads token refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    expires_in: number;
  };

  const newAccessEnc = await encrypt(data.access_token, env.ENCRYPTION_KEY);
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

  await env.DB.prepare(
    `UPDATE connected_accounts
     SET access_token_encrypted = ?, token_expires_at = ?,
         account_status = 'active', updated_at = ?
     WHERE id = ?`
  ).bind(newAccessEnc, expiresAt, Date.now(), account.id).run();

  console.log(`[token-refresher] Threads token refreshed for ${account.id}`);
}

// ─── LinkedIn ───

async function refreshLinkedInToken(
  account: ConnectedAccount,
  env: CloudflareEnv,
  env2: Record<string, string>
): Promise<void> {
  if (!account.refresh_token_encrypted) {
    throw new Error("No refresh token stored for LinkedIn");
  }

  const refreshToken = await decrypt(account.refresh_token_encrypted, env.ENCRYPTION_KEY);

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env2["LINKEDIN_CLIENT_ID"] ?? "",
      client_secret: env2["LINKEDIN_CLIENT_SECRET"] ?? "",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LinkedIn refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const newAccessEnc = await encrypt(data.access_token, env.ENCRYPTION_KEY);
  const newRefreshEnc = data.refresh_token
    ? await encrypt(data.refresh_token, env.ENCRYPTION_KEY)
    : account.refresh_token_encrypted;
  const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;

  await env.DB.prepare(
    `UPDATE connected_accounts
     SET access_token_encrypted = ?, refresh_token_encrypted = ?, token_expires_at = ?,
         account_status = 'active', updated_at = ?
     WHERE id = ?`
  ).bind(newAccessEnc, newRefreshEnc, expiresAt, Date.now(), account.id).run();

  console.log(`[token-refresher] LinkedIn token refreshed for ${account.id}`);
}
