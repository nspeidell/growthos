"use client";

import { useState, useEffect, useTransition } from "react";
import {
  CreditCard,
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
    features: ["10 content pieces/mo", "2 platforms", "1 team member", "Basic content studio", "Manual publishing"],
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) {
      setNotification("Subscription activated! Your plan has been upgraded.");
      window.history.replaceState({}, "", "/billing");
    } else if (params.get("canceled")) {
      setNotification("Checkout canceled — no changes were made.");
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
      // The priceId would come from env — for now use the key as placeholder
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
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const currentPlan = billing?.workspace.plan ?? "free";

  return (
    <div className="space-y-6">
      {/* Notification */}
      {notification && (
        <div className="rounded-lg bg-brand-50 border border-brand-200 p-4 flex items-center justify-between">
          <span className="text-sm">{notification}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-brand-600 hover:text-brand-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Billing</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Manage your subscription and usage
          </p>
        </div>
        {billing?.subscription && (
          <button
            onClick={handleManage}
            disabled={isPending}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" />
            Manage Subscription
          </button>
        )}
      </div>

      {/* Subscription Status */}
      {billing?.subscription?.status === "past_due" && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">
              Payment past due
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Please update your payment method to avoid service interruption.
            </p>
          </div>
          <button
            onClick={handleManage}
            className="ml-auto px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Update Payment
          </button>
        </div>
      )}

      {/* Usage Summary */}
      {billing && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-900 mb-3">
            Current Period Usage
          </h2>
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

      {/* Plan Cards */}
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
              className={`rounded-lg border p-6 ${
                plan.highlight
                  ? "border-brand-300 bg-brand-50/50 ring-1 ring-brand-200"
                  : "border-neutral-200 bg-white"
              } ${isCurrent ? "ring-2 ring-brand-500" : ""}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={
                    plan.highlight ? "text-brand-600" : "text-neutral-500"
                  }
                >
                  {plan.icon}
                </span>
                <h3 className="text-lg font-semibold text-neutral-900">
                  {plan.name}
                </h3>
                {isCurrent && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-brand-100 text-brand-800 rounded-full">
                    Current
                  </span>
                )}
              </div>

              <div className="mb-4">
                <span className="text-3xl font-bold text-neutral-900">
                  {plan.price}
                </span>
                <span className="text-neutral-500">{plan.period}</span>
              </div>

              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-neutral-700"
                  >
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="text-center text-sm text-neutral-500 py-2">
                  Your current plan
                </div>
              ) : isUpgrade && plan.priceId ? (
                <button
                  onClick={() => handleUpgrade(plan.priceId!)}
                  disabled={isPending}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    plan.highlight
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                  }`}
                >
                  {isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    plan.cta
                  )}
                </button>
              ) : (
                <div className="text-center text-sm text-neutral-400 py-2">
                  —
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Usage Meter ───

function UsageMeter({
  label,
  current,
  limit,
}: {
  label: string;
  current: number;
  limit: number;
}) {
  const isUnlimited = limit === Infinity;
  const percentage = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
  const isNearLimit = !isUnlimited && percentage >= 80;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-neutral-600">{label}</span>
        <span className="text-xs font-medium text-neutral-900">
          {current.toLocaleString()}
          {isUnlimited ? "" : ` / ${limit.toLocaleString()}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isNearLimit ? "bg-red-500" : "bg-brand-500"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      {isUnlimited && (
        <div className="h-1.5 bg-green-100 rounded-full">
          <div className="h-full bg-green-400 rounded-full w-0" />
        </div>
      )}
    </div>
  );
}
