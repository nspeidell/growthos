"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Megaphone,
  Plus,
  Trash2,
  Play,
  Pause,
  Archive,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronRight,
  Target,
  DollarSign,
  BarChart3,
  Eye,
  MousePointerClick,
} from "lucide-react";
import {
  listCampaigns,
  createCampaign,
  updateCampaignStatus,
  createVariant,
  deleteCampaign,
  type CampaignWithVariants,
} from "./actions";

// ─── Constants ───

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
  meta: { label: "Meta", color: "bg-blue-600", icon: "📘" },
  google: { label: "Google", color: "bg-green-600", icon: "🔍" },
  x: { label: "X", color: "bg-neutral-800", icon: "𝕏" },
};

const OBJECTIVE_LABELS: Record<string, string> = {
  awareness: "Brand Awareness",
  traffic: "Traffic",
  engagement: "Engagement",
  conversions: "Conversions",
  app_installs: "App Installs",
};

const STATUS_BADGES: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-700",
    icon: <Clock className="w-3 h-3" />,
  },
  active: {
    label: "Active",
    className: "bg-green-100 text-green-800",
    icon: <Play className="w-3 h-3" />,
  },
  paused: {
    label: "Paused",
    className: "bg-yellow-100 text-yellow-800",
    icon: <Pause className="w-3 h-3" />,
  },
  completed: {
    label: "Completed",
    className: "bg-blue-100 text-blue-800",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  archived: {
    label: "Archived",
    className: "bg-neutral-100 text-neutral-600",
    icon: <Archive className="w-3 h-3" />,
  },
};

// ─── Component ───

export default function AdsDashboard() {
  const [campaigns, setCampaigns] = useState<CampaignWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"campaigns" | "create">("campaigns");
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Load ───

  useEffect(() => {
    loadCampaigns();
  }, []);

  async function loadCampaigns() {
    setLoading(true);
    const result = await listCampaigns();
    if (result.success && result.data) {
      setCampaigns(result.data);
    }
    setLoading(false);
  }

  // ─── Handlers ───

  function handleCreateCampaign(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCampaign(formData);
      if (result.success) {
        setActiveTab("campaigns");
        await loadCampaigns();
      } else {
        setError(result.error ?? "Failed to create campaign");
      }
    });
  }

  function handleStatusChange(
    campaignId: string,
    status: "draft" | "active" | "paused" | "completed" | "archived"
  ) {
    startTransition(async () => {
      const result = await updateCampaignStatus(campaignId, status);
      if (result.success) await loadCampaigns();
    });
  }

  function handleDelete(campaignId: string) {
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteCampaign(campaignId);
      if (result.success) {
        if (selectedCampaign === campaignId) setSelectedCampaign(null);
        await loadCampaigns();
      }
    });
  }

  function handleCreateVariant(formData: FormData) {
    startTransition(async () => {
      const result = await createVariant(formData);
      if (result.success) {
        setShowVariantForm(false);
        await loadCampaigns();
      }
    });
  }

  // ─── Selected campaign ───

  const selected = campaigns.find((c) => c.id === selectedCampaign) ?? null;

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "campaigns"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab("create")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === "create"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Create Campaign Form */}
      {activeTab === "create" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create Campaign</h3>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <form action={handleCreateCampaign} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name
                </label>
                <input
                  name="name"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Summer Launch Campaign"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Platform
                </label>
                <select
                  name="platform"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="meta">Meta (Facebook / Instagram)</option>
                  <option value="google">Google Ads</option>
                  <option value="x">X Ads</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Objective
                </label>
                <select
                  name="objective"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="awareness">Brand Awareness</option>
                  <option value="traffic">Traffic</option>
                  <option value="engagement">Engagement</option>
                  <option value="conversions">Conversions</option>
                  <option value="app_installs">App Installs</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Daily Budget ($)
                </label>
                <input
                  name="budgetDaily"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="50.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Budget ($)
                </label>
                <input
                  name="budgetTotal"
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="1000.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  name="startDate"
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  name="endDate"
                  type="date"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Targeting (JSON)
              </label>
              <textarea
                name="targeting"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder='{"age_min": 25, "age_max": 55, "interests": ["family", "parenting"]}'
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Megaphone className="w-4 h-4" />
                )}
                Create Campaign
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaign List + Detail */}
      {activeTab === "campaigns" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Campaign List */}
          <div className="lg:col-span-1 space-y-3">
            {campaigns.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-12 text-center">
                <Megaphone className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm font-medium text-gray-500">
                  No campaigns yet
                </p>
                <button
                  onClick={() => setActiveTab("create")}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Create your first campaign
                </button>
              </div>
            ) : (
              campaigns.map((campaign) => {
                const platformInfo = PLATFORM_META[campaign.platform] ?? {
                  label: campaign.platform,
                  color: "bg-gray-500",
                  icon: "📢",
                };
                const statusInfo = STATUS_BADGES[campaign.campaignStatus] ?? {
                  label: campaign.campaignStatus,
                  className: "bg-gray-100 text-gray-600",
                  icon: <Clock className="w-3 h-3" />,
                };

                return (
                  <button
                    key={campaign.id}
                    onClick={() => setSelectedCampaign(campaign.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      selectedCampaign === campaign.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white ${platformInfo.color}`}
                          >
                            {platformInfo.icon} {platformInfo.label}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}
                          >
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="font-medium text-gray-900 truncate">
                          {campaign.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective} ·{" "}
                          {campaign.variants.length} variant
                          {campaign.variants.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Campaign Detail */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-16 text-center">
                <Target className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">
                  Select a campaign to view details
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Campaign Header */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {selected.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {OBJECTIVE_LABELS[selected.objective] ?? selected.objective} ·{" "}
                        {(PLATFORM_META[selected.platform] ?? { label: selected.platform }).label}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selected.campaignStatus === "draft" && (
                        <button
                          onClick={() => handleStatusChange(selected.id, "active")}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" /> Launch
                        </button>
                      )}
                      {selected.campaignStatus === "active" && (
                        <button
                          onClick={() => handleStatusChange(selected.id, "paused")}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700 disabled:opacity-50"
                        >
                          <Pause className="w-3.5 h-3.5" /> Pause
                        </button>
                      )}
                      {selected.campaignStatus === "paused" && (
                        <button
                          onClick={() => handleStatusChange(selected.id, "active")}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" /> Resume
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(selected.id)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Budget & Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <DollarSign className="w-3.5 h-3.5" /> Daily Budget
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {selected.budgetDaily != null
                          ? `$${Number(selected.budgetDaily).toFixed(2)}`
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <DollarSign className="w-3.5 h-3.5" /> Total Budget
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {selected.budgetTotal != null
                          ? `$${Number(selected.budgetTotal).toFixed(2)}`
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <Eye className="w-3.5 h-3.5" /> Impressions
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {selected.impressions?.toLocaleString() ?? "0"}
                      </p>
                    </div>
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <MousePointerClick className="w-3.5 h-3.5" /> Clicks
                      </div>
                      <p className="text-lg font-semibold text-gray-900">
                        {selected.clicks?.toLocaleString() ?? "0"}
                      </p>
                    </div>
                  </div>

                  {/* Date Range */}
                  {(selected.startDate || selected.endDate) && (
                    <div className="mt-4 text-sm text-gray-500">
                      {selected.startDate && (
                        <span>
                          Start:{" "}
                          {new Date(selected.startDate).toLocaleDateString()}
                        </span>
                      )}
                      {selected.startDate && selected.endDate && <span> · </span>}
                      {selected.endDate && (
                        <span>
                          End:{" "}
                          {new Date(selected.endDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Ad Variants */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Ad Variants ({selected.variants.length})
                    </h4>
                    <button
                      onClick={() => setShowVariantForm(!showVariantForm)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="w-4 h-4" /> Add Variant
                    </button>
                  </div>

                  {/* Variant Form */}
                  {showVariantForm && (
                    <form
                      action={handleCreateVariant}
                      className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3"
                    >
                      <input type="hidden" name="campaignId" value={selected.id} />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Headline
                        </label>
                        <input
                          name="headline"
                          required
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          placeholder="Catchy headline for this variant"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Body Copy
                        </label>
                        <textarea
                          name="body"
                          required
                          rows={3}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          placeholder="Ad body copy..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            CTA Text
                          </label>
                          <input
                            name="ctaText"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder="Learn More"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Landing URL
                          </label>
                          <input
                            name="landingUrl"
                            type="url"
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowVariantForm(false)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Add Variant
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Variant Cards */}
                  {selected.variants.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">
                      No variants yet. Add one to start A/B testing.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selected.variants.map((variant, idx) => (
                        <div
                          key={variant.id}
                          className={`rounded-lg border p-4 ${
                            variant.isWinner
                              ? "border-green-300 bg-green-50"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-400">
                                  Variant {String.fromCharCode(65 + idx)}
                                </span>
                                {variant.isWinner && (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                    <CheckCircle2 className="w-3 h-3" /> Winner
                                  </span>
                                )}
                              </div>
                              <p className="font-medium text-gray-900">
                                {variant.headline}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                            {variant.body}
                          </p>
                          {(variant.ctaText || variant.landingUrl) && (
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                              {variant.ctaText && (
                                <span className="rounded bg-blue-50 px-2 py-0.5 text-blue-700 font-medium">
                                  {variant.ctaText}
                                </span>
                              )}
                              {variant.landingUrl && (
                                <span className="truncate max-w-[200px]">
                                  {variant.landingUrl}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
