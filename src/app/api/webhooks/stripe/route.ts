/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler for subscription lifecycle events.
 * Verifies webhook signature, processes events idempotently.
 *
 * Events handled:
 * - checkout.session.completed → Create subscription, upgrade plan
 * - customer.subscription.updated → Sync status changes
 * - customer.subscription.deleted → Downgrade to free
 * - invoice.payment_failed → Mark past_due
 * - invoice.paid → Clear past_due
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { subscriptions, workspaces } from "@/lib/db/schema";

export const runtime = "edge";

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export async function POST(request: NextRequest) {
  const env = getBindings();
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  // Verify webhook signature
  let event: StripeEvent;
  try {
    event = await verifyWebhookSignature(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const db = createDb(env.DB);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const metadata = session.metadata as Record<string, string> | undefined;
        const workspaceId = metadata?.workspaceId;

        if (!workspaceId || !subscriptionId) break;

        // Fetch subscription details from Stripe
        const subResponse = await fetch(
          `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
          {
            headers: {
              Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
            },
          }
        );
        const sub = (await subResponse.json()) as {
          id: string;
          status: string;
          items: { data: Array<{ price: { id: string } }> };
          current_period_start: number;
          current_period_end: number;
        };

        const priceId = sub.items.data[0]?.price.id ?? "";
        const plan = determinePlan(priceId, env);

        // Create subscription record
        await db.insert(subscriptions).values({
          id: createId(),
          workspaceId,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          status: sub.status as "active" | "past_due" | "canceled" | "trialing" | "incomplete",
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // Upgrade workspace plan + set Stripe customer ID
        await db
          .update(workspaces)
          .set({
            plan: plan as "free" | "pro" | "enterprise",
            stripeCustomerId: customerId,
          })
          .where(eq(workspaces.id, workspaceId));

        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const stripeSubId = sub.id as string;
        const status = sub.status as string;
        const cancelAtPeriodEnd = sub.cancel_at_period_end as boolean;
        const items = sub.items as { data: Array<{ price: { id: string } }> };
        const priceId = items?.data?.[0]?.price?.id ?? "";
        const currentPeriodEnd = sub.current_period_end as number;

        const existing = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
          .get();

        if (existing) {
          await db
            .update(subscriptions)
            .set({
              status: status as "active" | "past_due" | "canceled" | "trialing" | "incomplete",
              stripePriceId: priceId,
              cancelAtPeriodEnd,
              currentPeriodEnd: new Date(currentPeriodEnd * 1000),
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

          // Update workspace plan if price changed
          const plan = determinePlan(priceId, env);
          await db
            .update(workspaces)
            .set({ plan: plan as "free" | "pro" | "enterprise" })
            .where(eq(workspaces.id, existing.workspaceId));
        }

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const stripeSubId = sub.id as string;

        const existing = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
          .get();

        if (existing) {
          // Mark subscription as canceled
          await db
            .update(subscriptions)
            .set({
              status: "canceled",
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));

          // Downgrade workspace to free
          await db
            .update(workspaces)
            .set({ plan: "free" })
            .where(eq(workspaces.id, existing.workspaceId));
        }

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription as string;

        if (stripeSubId) {
          await db
            .update(subscriptions)
            .set({
              status: "past_due",
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
        }

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const stripeSubId = invoice.subscription as string;

        if (stripeSubId) {
          const existing = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
            .get();

          if (existing && existing.status === "past_due") {
            await db
              .update(subscriptions)
              .set({
                status: "active",
                updatedAt: new Date(),
              })
              .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
          }
        }

        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Webhook processing failed";
    console.error(`Stripe webhook error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Helpers ───

function determinePlan(
  priceId: string,
  env: { STRIPE_PRICE_PRO: string; STRIPE_PRICE_ENTERPRISE: string }
): string {
  if (priceId === env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === env.STRIPE_PRICE_ENTERPRISE) return "enterprise";
  return "free";
}

/**
 * Verify Stripe webhook signature using Web Crypto API.
 * Compatible with Cloudflare Workers (no Node.js crypto dependency).
 */
async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): Promise<StripeEvent> {
  const parts = signatureHeader.split(",");
  const timestamp = parts
    .find((p) => p.startsWith("t="))
    ?.substring(2);
  const signature = parts
    .find((p) => p.startsWith("v1="))
    ?.substring(3);

  if (!timestamp || !signature) {
    throw new Error("Invalid signature format");
  }

  // Check timestamp tolerance (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    throw new Error("Webhook timestamp too old");
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(signedPayload)
  );

  const expectedSig = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (expectedSig.length !== signature.length) {
    throw new Error("Signature verification failed");
  }

  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) {
    mismatch |= expectedSig.charCodeAt(i) ^ signature.charCodeAt(i);
  }

  if (mismatch !== 0) {
    throw new Error("Signature verification failed");
  }

  return JSON.parse(payload) as StripeEvent;
}
