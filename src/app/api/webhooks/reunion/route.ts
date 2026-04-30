/**
 * POST /api/webhooks/reunion
 *
 * Webhook handler for Reunion platform events.
 * Verifies HMAC-SHA256 signature, processes events idempotently.
 *
 * Events handled:
 * - campaign.delivered → Update sent count
 * - campaign.opened → Increment open count
 * - campaign.clicked → Increment click count
 * - campaign.completed → Mark campaign as completed
 * - user.churned → Trigger reactivation (future)
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { reunionCampaigns } from "@/lib/db/schema";
import { ReunionClient } from "@/lib/reunion/client";

export const runtime = "edge";

interface ReunionWebhookEvent {
  id: string;
  type: string;
  campaignId: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export async function POST(request: NextRequest) {
  const env = getBindings();
  const body = await request.text();
  const signature = request.headers.get("x-reunion-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing x-reunion-signature header" },
      { status: 400 }
    );
  }

  // Verify webhook signature
  const valid = await ReunionClient.verifyWebhook(
    body,
    signature,
    env.REUNION_WEBHOOK_SECRET
  );

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  const event: ReunionWebhookEvent = JSON.parse(body);
  const db = createDb(env.DB);

  try {
    // Find the GrowthOS campaign by matching the reunion campaign ID stored in the name or by content
    // The campaignId from Reunion maps to our campaign's id
    const campaign = await db
      .select()
      .from(reunionCampaigns)
      .where(eq(reunionCampaigns.id, event.campaignId))
      .get();

    if (!campaign) {
      // Not our campaign, acknowledge anyway
      return NextResponse.json({ received: true });
    }

    switch (event.type) {
      case "campaign.delivered": {
        const sentCount = (event.data.sentCount as number) ?? 0;
        await db
          .update(reunionCampaigns)
          .set({ sentCount })
          .where(eq(reunionCampaigns.id, event.campaignId));
        break;
      }

      case "campaign.opened": {
        const openedCount = (event.data.openedCount as number) ?? 0;
        await db
          .update(reunionCampaigns)
          .set({ openedCount })
          .where(eq(reunionCampaigns.id, event.campaignId));
        break;
      }

      case "campaign.clicked": {
        const clickedCount = (event.data.clickedCount as number) ?? 0;
        await db
          .update(reunionCampaigns)
          .set({ clickedCount })
          .where(eq(reunionCampaigns.id, event.campaignId));
        break;
      }

      case "campaign.completed": {
        const stats = event.data as {
          sentCount?: number;
          openedCount?: number;
          clickedCount?: number;
        };
        await db
          .update(reunionCampaigns)
          .set({
            campaignStatus: "completed",
            sentCount: stats.sentCount ?? campaign.sentCount,
            openedCount: stats.openedCount ?? campaign.openedCount,
            clickedCount: stats.clickedCount ?? campaign.clickedCount,
          })
          .where(eq(reunionCampaigns.id, event.campaignId));
        break;
      }

      case "user.churned": {
        // Future: auto-create reactivation campaign
        // TODO: auto-create reactivation campaign
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Webhook processing failed";
    console.error(`Reunion webhook error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
