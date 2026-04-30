/**
 * Cron endpoint: Enqueue signal scan jobs for all active listening sources.
 * Called periodically (e.g., every 15 minutes) by Cloudflare Cron Triggers or external scheduler.
 *
 * GET /api/cron/signal-scan
 */

import { getBindings } from "@/lib/cloudflare/bindings";
import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(request: Request) {
  const env = getBindings();

  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get("authorization");
  if (env.ENVIRONMENT === "production" && authHeader !== `Bearer ${env.SESSION_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = Date.now();

    // Find all active sources that are due for scanning
    const sources = await env.DB.prepare(
      `SELECT ls.id, ls.workspace_id, ls.source_type, ls.config, ls.scan_frequency_minutes
       FROM listening_sources ls
       WHERE ls.is_active = 1
         AND (ls.last_scanned_at IS NULL OR ls.last_scanned_at < ? - (ls.scan_frequency_minutes * 60 * 1000))
         AND ls.error_count < 10
       LIMIT 50`
    )
      .bind(now)
      .all<{
        id: string;
        workspace_id: string;
        source_type: string;
        config: string;
        scan_frequency_minutes: number;
      }>();

    if (sources.results.length === 0) {
      return NextResponse.json({ enqueued: 0, message: "No sources due for scanning" });
    }

    // Get active keywords per workspace (batch query)
    const workspaceIds = [...new Set(sources.results.map((s) => s.workspace_id))];
    const keywordsByWorkspace = new Map<string, string[]>();

    for (const wsId of workspaceIds) {
      const keywords = await env.DB.prepare(
        `SELECT keyword FROM tracked_keywords WHERE workspace_id = ? AND is_active = 1`
      )
        .bind(wsId)
        .all<{ keyword: string }>();

      keywordsByWorkspace.set(
        wsId,
        keywords.results.map((k) => k.keyword)
      );
    }

    // Enqueue scan jobs
    let enqueued = 0;
    for (const source of sources.results) {
      const keywords = keywordsByWorkspace.get(source.workspace_id) ?? [];

      await env.SIGNAL_QUEUE.send({
        sourceId: source.id,
        workspaceId: source.workspace_id,
        sourceType: source.source_type,
        config: source.config,
        keywords,
      });

      enqueued++;
    }

    return NextResponse.json({
      enqueued,
      workspaces: workspaceIds.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
