/**
 * GET /r/[code]
 *
 * Edge-runtime attribution redirect handler.
 *
 * Flow:
 *   1. Lookup short_code in D1 — 404 if not found or expired
 *   2. Detect rapid-click fraud (same IP hash within 60s on same link)
 *   3. Log referral_visit with privacy-safe SHA-256 IP/UA hashing
 *   4. Increment click_count (+ unique_click_count if first-touch) on tracking_links
 *   5. Increment total_clicks on partners
 *   6. Set first-touch attribution cookie (JSON, configurable TTL)
 *   7. Build destination URL with UTM params
 *   8. 301 redirect
 */

import { NextRequest, NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";

export const runtime = "edge";

// Attribution cookie name
const COOKIE_NAME = "gos_attr";

// Rapid-click dedup window: if same IP hash clicks same link within this many ms, mark suspicious
const RAPID_CLICK_WINDOW_MS = 60_000; // 60 seconds

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * SHA-256 hash a string using the Web Crypto API (available in edge runtime).
 * Salted with the workspace_id for privacy isolation across workspaces.
 */
async function sha256(value: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${value}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Detect device type from User-Agent string.
 * Returns: desktop | mobile | tablet | bot | unknown
 */
function detectDeviceType(ua: string): string {
  if (!ua) return "unknown";
  const lower = ua.toLowerCase();
  if (
    /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest\/0\.|developers\.google\.com\/\+\/web\/snippet|slackbot|vkshare|w3c_validator|whatsapp/i.test(lower)
  ) {
    return "bot";
  }
  if (/tablet|ipad|playbook|silk/i.test(lower)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(lower)) return "mobile";
  return "desktop";
}

/**
 * Append UTM params to a URL, only if the tracking link has them defined.
 */
function buildDestinationUrl(
  destinationUrl: string,
  utmParams: {
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmContent?: string | null;
  }
): string {
  try {
    const url = new URL(destinationUrl);
    if (utmParams.utmSource) url.searchParams.set("utm_source", utmParams.utmSource);
    if (utmParams.utmMedium) url.searchParams.set("utm_medium", utmParams.utmMedium);
    if (utmParams.utmCampaign) url.searchParams.set("utm_campaign", utmParams.utmCampaign);
    if (utmParams.utmContent) url.searchParams.set("utm_content", utmParams.utmContent);
    return url.toString();
  } catch {
    // Malformed URL — return as-is
    return destinationUrl;
  }
}

/**
 * Generate a random session ID (16 random hex bytes).
 */
function randomSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get the raw IP from CF headers, falling back gracefully.
 */
function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// ─── Row types (subset from D1 raw query results) ─────────────────────────────

interface TrackingLinkRow {
  id: string;
  workspace_id: string;
  partner_id: string;
  campaign_id: string | null;
  destination_url: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  attribution_window_days: number;
  click_count: number;
  unique_click_count: number;
  expires_at: number | null; // Unix ms from partner_campaigns join
}

interface RecentClickRow {
  created_at: number;
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const env = getBindings();
  const db = env.DB;

  // ── 1. Lookup tracking link + optional campaign expiry ──────────────────────
  const row = await db
    .prepare(
      `SELECT
         tl.id,
         tl.workspace_id,
         tl.partner_id,
         tl.campaign_id,
         tl.destination_url,
         tl.utm_source,
         tl.utm_medium,
         tl.utm_campaign,
         tl.utm_content,
         tl.attribution_window_days,
         tl.click_count,
         tl.unique_click_count,
         pc.expires_at
       FROM tracking_links tl
       LEFT JOIN partner_campaigns pc ON tl.campaign_id = pc.id
       WHERE tl.short_code = ?
       LIMIT 1`
    )
    .bind(code)
    .first<TrackingLinkRow>();

  if (!row) {
    return new NextResponse("Link not found", { status: 404 });
  }

  // Check campaign expiry
  const now = Date.now();
  if (row.expires_at && now > row.expires_at) {
    return new NextResponse("Link expired", { status: 410 });
  }

  // ── 2. Privacy-safe fingerprinting ─────────────────────────────────────────
  const rawIp = getClientIp(req);
  const rawUa = req.headers.get("user-agent") ?? "";
  const referrer = req.headers.get("referer") ?? null;
  const country = req.headers.get("cf-ipcountry") ?? null;
  const deviceType = detectDeviceType(rawUa);

  const [ipHash, uaHash] = await Promise.all([
    sha256(rawIp, row.workspace_id),
    sha256(rawUa, row.workspace_id),
  ]);

  // ── 3. Rapid-click fraud detection ─────────────────────────────────────────
  const windowStart = now - RAPID_CLICK_WINDOW_MS;
  const recentClick = await db
    .prepare(
      `SELECT created_at FROM referral_visits
       WHERE tracking_link_id = ? AND ip_hash = ?
       AND created_at > ?
       LIMIT 1`
    )
    .bind(row.id, ipHash, windowStart)
    .first<RecentClickRow>();

  const isSuspicious = !!recentClick;
  const fraudReason = isSuspicious ? "rapid_click" : null;

  // ── 4. Determine session + first-touch ─────────────────────────────────────
  const existingCookie = req.cookies.get(COOKIE_NAME);
  const isFirstTouch = !existingCookie;

  // Parse existing session_id from cookie if present, or generate new one
  let sessionId: string;
  try {
    const existing = existingCookie
      ? JSON.parse(existingCookie.value)
      : null;
    sessionId = existing?.session_id ?? randomSessionId();
  } catch {
    sessionId = randomSessionId();
  }

  // ── 5. Log referral visit ───────────────────────────────────────────────────
  const visitId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO referral_visits
         (id, tracking_link_id, partner_id, ip_hash, user_agent_hash, referrer, country,
          device_type, session_id, is_suspicious, fraud_reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      visitId,
      row.id,
      row.partner_id,
      ipHash,
      uaHash,
      referrer,
      country,
      deviceType,
      sessionId,
      isSuspicious ? 1 : 0,
      fraudReason,
      now
    )
    .run();

  // ── 6. Increment click counts (atomic SQL) ──────────────────────────────────
  // Only increment unique_click_count on first touch from this IP on this link
  const wasUniqueIp = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM referral_visits
       WHERE tracking_link_id = ? AND ip_hash = ? AND id != ?`
    )
    .bind(row.id, ipHash, visitId)
    .first<{ cnt: number }>();

  const isUniqueClick = (wasUniqueIp?.cnt ?? 0) === 0;

  // Fire-and-forget D1 updates (waitUntil not available in Pages edge, use .run())
  await Promise.all([
    db
      .prepare(
        `UPDATE tracking_links
         SET click_count = click_count + 1${isUniqueClick ? ", unique_click_count = unique_click_count + 1" : ""}
         WHERE id = ?`
      )
      .bind(row.id)
      .run(),
    db
      .prepare(
        `UPDATE partners
         SET total_clicks = total_clicks + 1, updated_at = ?
         WHERE id = ?`
      )
      .bind(now, row.partner_id)
      .run(),
  ]);

  // ── 7. Build destination URL with UTM params ────────────────────────────────
  const destination = buildDestinationUrl(row.destination_url, {
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
  });

  // ── 8. Build attribution cookie payload ─────────────────────────────────────
  const attributionWindowDays = row.attribution_window_days ?? 30;
  const cookieExpiry = new Date(now + attributionWindowDays * 24 * 60 * 60 * 1000);

  const cookiePayload = JSON.stringify({
    partner_id: row.partner_id,
    campaign_id: row.campaign_id ?? null,
    tracking_link_id: row.id,
    workspace_id: row.workspace_id,
    session_id: sessionId,
    timestamp: now,
    // first_touch preserved — if cookie already exists and has first_touch, keep it
    first_touch: isFirstTouch
      ? { partner_id: row.partner_id, tracking_link_id: row.id, timestamp: now }
      : (() => {
          try {
            return JSON.parse(existingCookie!.value).first_touch ?? null;
          } catch {
            return null;
          }
        })(),
  });

  // ── 9. Build response with 301 redirect + Set-Cookie ─────────────────────
  const response = NextResponse.redirect(destination, { status: 301 });

  // Only set cookie on non-suspicious clicks
  if (!isSuspicious) {
    response.cookies.set(COOKIE_NAME, cookiePayload, {
      expires: cookieExpiry,
      path: "/",
      httpOnly: false, // Client-readable so conversion pixel can read it
      secure: true,
      sameSite: "lax",
    });
  }

  // Prevent caching of redirect (links can be updated)
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

  return response;
}
