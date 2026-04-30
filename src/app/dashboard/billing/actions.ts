"use server";

import { eq, and, gte } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/middleware";
import { getBindings } from "@/lib/cloudflare/bindings";
import { createDb } from "@/lib/db/client";
import { subscriptions, usageRecords, workspaces } from "@/lib/db/schema";
import { safeAction, type ActionResult } from "@/lib/utils/api";
import type { Subscription, Workspace } from "@/lib/db/schema";
import { PLAN_LIMITS, type PlanTier } from "@/types/api";

// ─── Types ───

export interface BillingInfo {
  workspace: Workspace;
  subscription: Subscription | null;
  usage: {
    contentGenerated: number;
    mediaGenerated: number;
    postsPublished: number;
    apiCalls: number;
  };
  limits: typeof PLAN_LIMITS[PlanTier];
}

// ─── Get Billing Info ───

export async function getBillingInfo(): Promise<ActionResult<BillingInfo>> {
  return safeAction(async () => {
    const session = await requirePermission("billing:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId))
      .get();

    if (!workspace) throw new Error("Workspace not found");

    // Get active subscription
    const sub = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.workspaceId, session.workspaceId),
          eq(subscriptions.status, "active")
        )
      )
      .get();

    // Get current period usage
    const periodStart = sub?.currentPeriodStart ?? getMonthStart();

    const usageRows = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.workspaceId, session.workspaceId),
          gte(usageRecords.periodStart, periodStart)
        )
      )
      .all();

    const usage = {
      contentGenerated: sumMetric(usageRows, "content_generated"),
      mediaGenerated: sumMetric(usageRows, "media_generated"),
      postsPublished: sumMetric(usageRows, "posts_published"),
      apiCalls: sumMetric(usageRows, "api_calls"),
    };

    const plan = (workspace.plan ?? "free") as PlanTier;
    const limits = PLAN_LIMITS[plan];

    return {
      workspace,
      subscription: sub ?? null,
      usage,
      limits,
    };
  });
}

// ─── Create Checkout Session ───

export async function createCheckoutSession(
  priceId: string
): Promise<ActionResult<{ url: string }>> {
  return safeAction(async () => {
    const session = await requirePermission("billing:write");
    const env = getBindings();

    const workspace = await createDb(env.DB)
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId))
      .get();

    if (!workspace) throw new Error("Workspace not found");

    // Create Stripe checkout session via API
    const params = new URLSearchParams({
      "payment_method_types[0]": "card",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      mode: "subscription",
      success_url: `${env.APP_URL}/billing?success=true`,
      cancel_url: `${env.APP_URL}/billing?canceled=true`,
      "metadata[workspaceId]": session.workspaceId,
      client_reference_id: session.workspaceId,
    });

    // If workspace already has a Stripe customer, use it
    if (workspace.stripeCustomerId) {
      params.set("customer", workspace.stripeCustomerId);
    } else {
      params.set("customer_email", session.email);
    }

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Stripe checkout failed: ${error}`);
    }

    const checkoutSession = (await response.json()) as { url: string };

    return { url: checkoutSession.url };
  });
}

// ─── Create Customer Portal Session ───

export async function createPortalSession(): Promise<
  ActionResult<{ url: string }>
> {
  return safeAction(async () => {
    const session = await requirePermission("billing:write");
    const env = getBindings();

    const workspace = await createDb(env.DB)
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId))
      .get();

    if (!workspace?.stripeCustomerId) {
      throw new Error("No billing account found — upgrade first");
    }

    const params = new URLSearchParams({
      customer: workspace.stripeCustomerId,
      return_url: `${env.APP_URL}/billing`,
    });

    const response = await fetch(
      "https://api.stripe.com/v1/billing_portal/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Portal session failed: ${error}`);
    }

    const portalSession = (await response.json()) as { url: string };

    return { url: portalSession.url };
  });
}

// ─── Usage Tracking ───

export async function trackUsage(
  metric: "content_generated" | "media_generated" | "posts_published" | "api_calls"
): Promise<void> {
  try {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const periodStart = getMonthStart();
    const periodEnd = getMonthEnd();

    // Check if record exists for this period
    const existing = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.workspaceId, session.workspaceId),
          eq(usageRecords.metric, metric),
          gte(usageRecords.periodStart, periodStart)
        )
      )
      .get();

    if (existing) {
      await db
        .update(usageRecords)
        .set({ count: (existing.count ?? 0) + 1 })
        .where(eq(usageRecords.id, existing.id));
    } else {
      await db.insert(usageRecords).values({
        workspaceId: session.workspaceId,
        metric,
        count: 1,
        periodStart,
        periodEnd,
      });
    }
  } catch {
    // Non-critical — don't break the main flow
    console.error("Usage tracking failed");
  }
}

// ─── Plan Enforcement ───

export async function checkPlanLimit(
  metric: "content_generated" | "media_generated" | "posts_published"
): Promise<ActionResult<{ allowed: boolean; current: number; limit: number }>> {
  return safeAction(async () => {
    const session = await requirePermission("content:read");
    const { DB } = getBindings();
    const db = createDb(DB);

    const workspace = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, session.workspaceId))
      .get();

    const plan = (workspace?.plan ?? "free") as PlanTier;
    const limits = PLAN_LIMITS[plan];

    const periodStart = getMonthStart();

    const record = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.workspaceId, session.workspaceId),
          eq(usageRecords.metric, metric),
          gte(usageRecords.periodStart, periodStart)
        )
      )
      .get();

    const current = record?.count ?? 0;
    const limit =
      metric === "content_generated"
        ? limits.contentPerMonth
        : Infinity;

    return {
      allowed: current < limit,
      current,
      limit,
    };
  });
}

// ─── Helpers ───

function sumMetric(
  records: Array<{ metric: string; count: number }>,
  metricName: string
): number {
  return records
    .filter((r) => r.metric === metricName)
    .reduce((sum, r) => sum + (r.count ?? 0), 0);
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getMonthEnd(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
}
