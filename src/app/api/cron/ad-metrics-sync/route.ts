/**
 * GET /api/cron/ad-metrics-sync
 *
 * Vercel Cron handler — runs every 2 hours.
 * Pulls ad campaign metrics from platform APIs and caches per-workspace summaries in KV.
 *
 * Protected by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBindings } from "@/lib/cloudflare/bindings";

export const runtime = "edge";

interface AdCampaignRow {
  id: string;
  workspace_id: string;
  platform: string;
  platform_campaign_id: string | null;
  campaign_status: string;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = getBindings();

  // Get all active campaigns with platform IDs
  const { results: campaigns } = await env.DB.prepare(
    `SELECT id, workspace_id, platform, platform_campaign_id, campaign_status
     FROM ad_campaigns
     WHERE campaign_status = 'active'
       AND platform_campaign_id IS NOT NULL
     LIMIT 100`
  ).all<AdCampaignRow>();

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({ synced: 0 });
  }

  let synced = 0;
  const workspaceTotals: Record<string, {
    totalSpend: number;
    totalImpressions: number;
    totalClicks: number;
    totalConversions: number;
    activeCampaigns: number;
  }> = {};

  for (const campaign of campaigns) {
    try {
      // In production, this would call the platform API (Meta, Google, Reddit)
      // For now, we update cached workspace summaries from existing DB data
      const metrics = await env.DB.prepare(
        `SELECT spend, impressions, clicks, conversions FROM ad_campaigns WHERE id = ?`
      )
        .bind(campaign.id)
        .first<{ spend: number; impressions: number; clicks: number; conversions: number }>();

      if (!metrics) continue;

      if (!workspaceTotals[campaign.workspace_id]) {
        workspaceTotals[campaign.workspace_id] = {
          totalSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          totalConversions: 0,
          activeCampaigns: 0,
        };
      }

      const ws = workspaceTotals[campaign.workspace_id]!;
      ws.totalSpend += metrics.spend ?? 0;
      ws.totalImpressions += metrics.impressions ?? 0;
      ws.totalClicks += metrics.clicks ?? 0;
      ws.totalConversions += metrics.conversions ?? 0;
      ws.activeCampaigns += 1;
      synced++;
    } catch (error) {
      console.error(`Ad metrics sync failed for campaign ${campaign.id}:`, error);
    }
  }

  // Cache in KV
  for (const [workspaceId, totals] of Object.entries(workspaceTotals)) {
    await env.KV.put(
      `ad_kpi:${workspaceId}`,
      JSON.stringify({ ...totals, updatedAt: Date.now() }),
      { expirationTtl: 14400 } // 4 hour TTL, refreshed every 2 hours
    );
  }

  return NextResponse.json({ synced, workspaces: Object.keys(workspaceTotals).length });
}
