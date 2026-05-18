"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Check,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Zap,
  Crown,
  Shield,
} from "lucide-react";
import {
  getBillingInfo,
  createCheckoutSession,
  createPortalSession,
  type BillingInfo,
} from "./actions";

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "/mo",
    icon: <Zap className="w-5 h-5" />,
    features: [
      "10 content pieces/mo",
      "2 platforms",
      "1 team member",
      "Basic content studio",
      "Manual publishing",
    ],
    cta: "Current Plan",
    priceId: null,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$49",
    period: "/mo",
    icon: <Crown className="w-5 h-5" />,
    features: [
      "Unlimited content",
      "5 platforms",
      "5 team members",
      "All content types",
      "Autonomous publishing",
      "Analytics dashboard",
      "SEO & competitor tools",
    ],
    cta: "Upgrade to Pro",
    priceId: "STRIPE_PRICE_PRO",
    highlight: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$199",
    period: "/mo",
    icon: <Shield className="w-5 h-5" />,
    features: [
      "Everything in Pro",
      "Unlimited platforms",
      "Unlimited team members",
      "API access",
      "White-label",
      "Priority support",
    ],
    cta: "Upgrade to Enterprise",
    priceId: "STRIPE_PRICE_ENTERPRISE",
  },
];

export default function BillingDashboard() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<string | null>(null);
  const [notifType, setNotifType] = useState<"success" | "info">("success");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) {
      setNotification("Subscription activated! Your plan has been upgraded.");
      setNotifType("success");
      window.history.replaceState({}, "", "/billing");
    } else if (params.get("canceled")) {
      setNotification("Checkout canceled — no changes were made.");
      setNotifType("info");
      window.history.replaceState({}, "", "/billing");
    }
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await getBillingInfo();
      if (result.success) setBilling(result.data);
      setLoading(false);
    }
    load();
  }, []);

  const handleUpgrade = (priceIdKey: string) => {
    startTransition(async () => {
      const result = await createCheckoutSession(priceIdKey);
      if (result.success && result.data.url) {
        window.location.href = result.data.url;
      }
    });
  };

  const handleManage = () => {
    startTransition(async () => {
      const result = await createPortalSession();
      if (result.success && result.data.url) {
        window.location.href = result.data.url;
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const currentPlan = billing?.workspace.plan ?? "free";

  return (
    <div className="space-y-6">
      {/* ─── Notification ────────────────────────────────────────────── */}
      {notification && (
        <div className={`rounded-lg p-4 flex items-center justify-between text-sm ${
          notifType === "success"
            ? "bg-primary/10 border border-primary/20 text-primary"
            : "bg-muted border border-border text-muted-foreground"
        }`}>
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="ml-4 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your subscription and usage</p>
        </div>
        {billing?.subscription && (
          <button
            onClick={handleManage}
            disabled={isPending}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium border border-border rounded-lg text-foreground hover:bg-accent disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" />
            Manage Subscription
          </button>
        )}
      </div>

      {/* ─── Past Due Warning ─────────────────────────────────────────── */}
      {billing?.subscription?.status === "past_due" && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Payment past due</p>
            <p className="text-xs text-destructive/80 mt-0.5">
              Please update your payment method to avoid service interruption.
            </p>
          </div>
          <button
            onClick={handleManage}
            className="ml-auto px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
          >
            Update Payment
          </button>
        </div>
      )}

      {/* ─── Usage Summary ────────────────────────────────────────────── */}
      {billing && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Current Period Usage</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <UsageMeter
              label="Content Generated"
              current={billing.usage.contentGenerated}
              limit={billing.limits.contentPerMonth}
            />
            <UsageMeter
              label="Media Generated"
              current={billing.usage.mediaGenerated}
              limit={Infinity}
            />
            <UsageMeter
              label="Posts Published"
              current={billing.usage.postsPublished}
              limit={Infinity}
            />
            <UsageMeter
              label="Platforms"
              current={0}
              limit={billing.limits.platforms}
            />
          </div>
        </div>
      )}

      {/* ─── Plan Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key;
          const isUpgrade =
            plan.key === "pro"
              ? currentPlan === "free"
              : plan.key === "enterprise"
              ? currentPlan !== "enterprise"
              : false;

          return (
            <div
              key={plan.key}
              className={`rounded-lg border p-6 transition-all ${
                plan.highlight
                  ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card"
              } ${isCurrent ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={plan.highlight ? "text-primary" : "text-muted-foreground"}>
                  {plan.icon}
                </span>
                <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                {isCurrent && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                    Current
                  </span>
                )}
              </div>

              <div className="mb-4">
                <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                <span className="text-muted-foreground">{plan.period}</span>
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="text-center text-sm text-muted-foreground py-2">Your current plan</div>
              ) : isUpgrade && plan.priceId ? (
                <button
                  onClick={() => handleUpgrade(plan.priceId!)}
                  disabled={isPending}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    plan.highlight
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border text-foreground hover:bg-accent"
                  }`}
                >
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : plan.cta}
                </button>
              ) : (
                <div className="text-center text-sm text-muted-foreground/50 py-2">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Usage Meter ─────────────────────────────────────────────────────────────

function UsageMeter({ label, current, limit }: { label: string; current: number; limit: number }) {
  const isUnlimited = limit === Infinity;
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium text-foreground">
          {current.toLocaleString()}
          {isUnlimited ? "" : ` / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!isUnlimited ? (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isNearLimit ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      ) : (
        <div className="h-1.5 bg-emerald-500/20 rounded-full">
          <div className="h-full w-0 bg-emerald-500 rounded-full" />
        </div>
      )}
    </div>
  );
}
