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
  Target,
  DollarSign,
  BarChart3,
  Eye,
  MousePointerClick,
  Sparkles,
  Trophy,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  listCampaigns,
  createCampaign,
  updateCampaignStatus,
  createVariant,
  deleteCampaign,
  markVariantWinner,
  generateAdCopy,
  type CampaignWithVariants,
  type GeneratedAdCopy,
} from "./actions";
import type { AdVariant } from "@/lib/db/schema";

// ─── Config ────────────────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  meta:   { label: "Meta",   badge: "bg-blue-500/10 text-blue-600 border-blue-500/20",   dot: "bg-blue-600" },
  google: { label: "Google", badge: "bg-green-500/10 text-green-600 border-green-500/20", dot: "bg-green-600" },
  x:      { label: "X",      badge: "bg-sky-500/10 text-sky-600 border-sky-500/20",       dot: "bg-sky-500" },
};

const OBJECTIVE_LABELS: Record<string, string> = {
  awareness:    "Brand Awareness",
  traffic:      "Traffic",
  engagement:   "Engagement",
  conversions:  "Conversions",
  app_installs: "App Installs",
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  draft:     { label: "Draft",     className: "bg-muted text-muted-foreground",           icon: <Clock className="h-3 w-3" /> },
  active:    { label: "Active",    className: "bg-green-500/10 text-green-600",           icon: <Play className="h-3 w-3" /> },
  paused:    { label: "Paused",    className: "bg-amber-500/10 text-amber-600",           icon: <Pause className="h-3 w-3" /> },
  completed: { label: "Completed", className: "bg-primary/10 text-primary",               icon: <CheckCircle2 className="h-3 w-3" /> },
  archived:  { label: "Archived",  className: "bg-muted/60 text-muted-foreground/60",     icon: <Archive className="h-3 w-3" /> },
};

const STATUS_FILTERS = ["all", "draft", "active", "paused", "completed", "archived"] as const;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function ctr(clicks: number | null | undefined, impressions: number | null | undefined): string {
  const c = clicks ?? 0;
  const i = impressions ?? 0;
  if (i === 0) return "—";
  return `${((c / i) * 100).toFixed(2)}%`;
}

function cpc(spend: number | null | undefined, clicks: number | null | undefined): string {
  const s = spend ?? 0;
  const c = clicks ?? 0;
  if (c === 0) return "—";
  return `$${(s / c).toFixed(2)}`;
}

// ─── Variant Card ─────────────────────────────────────────────────────────────

function VariantCard({
  variant,
  idx,
  campaignId,
  isPending,
  onMarkWinner,
}: {
  variant: AdVariant;
  idx: number;
  campaignId: string;
  isPending: boolean;
  onMarkWinner: (variantId: string, campaignId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = String.fromCharCode(65 + idx); // A, B, C...

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      variant.isWinner
        ? "border-green-500/30 bg-green-500/5"
        : "border-border bg-background"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-bold text-muted-foreground bg-muted rounded px-1.5 py-0.5">
            Variant {label}
          </span>
          {variant.isWinner && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600">
              <Trophy className="h-3 w-3" /> Winner
            </span>
          )}
        </div>
        {!variant.isWinner && (
          <button
            onClick={() => onMarkWinner(variant.id, campaignId)}
            disabled={isPending}
            title="Mark as winner"
            className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-green-500/40 hover:text-green-600 disabled:opacity-50"
          >
            <Trophy className="h-3 w-3" />
          </button>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-foreground">{variant.headline}</p>
        <p className={`text-xs text-muted-foreground mt-0.5 ${expanded ? "" : "line-clamp-2"}`}>
          {variant.body}
        </p>
        {variant.body.length > 120 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-0.5 flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? <><ChevronUp className="h-3 w-3" />Less</> : <><ChevronDown className="h-3 w-3" />More</>}
          </button>
        )}
      </div>

      {(variant.ctaText || variant.landingUrl) && (
        <div className="flex items-center gap-2 flex-wrap">
          {variant.ctaText && (
            <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
              {variant.ctaText}
            </span>
          )}
          {variant.landingUrl && (
            <a
              href={variant.landingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary truncate max-w-[180px]"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              {variant.landingUrl.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AI Copy Panel ─────────────────────────────────────────────────────────────

function AICopyPanel({
  campaignId,
  onAddVariant,
}: {
  campaignId: string;
  onAddVariant: (fd: FormData) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [copies, setCopies] = useState<GeneratedAdCopy[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    const result = await generateAdCopy(campaignId);
    setLoading(false);
    if (result.success) setCopies(result.data);
    else if (!result.success) setError(result.error ?? "Generation failed");
  }

  function addVariant(copy: GeneratedAdCopy) {
    const fd = new FormData();
    fd.set("campaignId", campaignId);
    fd.set("headline", copy.headline);
    fd.set("body", copy.body);
    fd.set("ctaText", copy.ctaText);
    onAddVariant(fd);
    setCopies((prev) => prev.filter((c) => c !== copy));
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          AI Copy Generator
        </p>
        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {copies.length > 0 ? "Regenerate" : "Generate 3 Variants"}
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {copies.length > 0 && (
        <div className="space-y-2">
          {copies.map((copy, i) => (
            <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{copy.headline}</p>
                <button
                  onClick={() => addVariant(copy)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{copy.body}</p>
              <span className="inline-block rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary">
                {copy.ctaText}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function AdsDashboard() {
  const [campaigns, setCampaigns] = useState<CampaignWithVariants[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<typeof STATUS_FILTERS[number]>("all");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [showAICopy, setShowAICopy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const result = await listCampaigns();
    if (result.success) setCampaigns(result.data);
    setLoading(false);
  }

  const selected = campaigns.find((c) => c.id === selectedId) ?? null;

  const filtered = statusFilter === "all"
    ? campaigns
    : campaigns.filter((c) => c.campaignStatus === statusFilter);

  // Stats
  const activeCampaigns = campaigns.filter((c) => c.campaignStatus === "active").length;
  const totalSpend = campaigns.reduce((s, c) => s + (c.spend ?? 0), 0);
  const totalImpressions = campaigns.reduce((s, c) => s + (c.impressions ?? 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await createCampaign(fd);
      if (result.success) {
        setShowCreateForm(false);
        form.reset();
        await load();
        setSelectedId(result.data.id);
      } else if (!result.success) {
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
      if (result.success) await load();
    });
  }

  function handleDelete(campaignId: string) {
    if (!confirm("Delete this campaign and all its variants?")) return;
    startTransition(async () => {
      const result = await deleteCampaign(campaignId);
      if (result.success) {
        if (selectedId === campaignId) setSelectedId(null);
        await load();
      }
    });
  }

  function handleAddVariant(fd: FormData) {
    startTransition(async () => {
      const result = await createVariant(fd);
      if (result.success) {
        setShowVariantForm(false);
        await load();
      }
    });
  }

  function handleMarkWinner(variantId: string, campaignId: string) {
    startTransition(async () => {
      const result = await markVariantWinner(variantId, campaignId);
      if (result.success) await load();
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ads Manager</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage campaigns across Meta, Google, and X
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      {/* Stats bar */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Campaigns", value: campaigns.length,   icon: <Megaphone className="h-4 w-4" /> },
            { label: "Active",          value: activeCampaigns,    icon: <Play className="h-4 w-4 text-green-600" /> },
            { label: "Total Spend",     value: `$${totalSpend.toLocaleString()}`, icon: <DollarSign className="h-4 w-4" /> },
            { label: "Impressions",     value: fmt(totalImpressions), icon: <Eye className="h-4 w-4" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                {icon}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground leading-tight">
                  {typeof value === "number" ? value.toLocaleString() : value}
                </p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Create Campaign Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4"
        >
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Campaign</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Campaign Name *</label>
              <input name="name" required placeholder="e.g. Summer Launch" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Platform *</label>
              <select name="platform" required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring">
                <option value="meta">Meta (Facebook / Instagram)</option>
                <option value="google">Google Ads</option>
                <option value="x">X Ads</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Objective *</label>
              <select name="objective" required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring">
                <option value="awareness">Brand Awareness</option>
                <option value="traffic">Traffic</option>
                <option value="engagement">Engagement</option>
                <option value="conversions">Conversions</option>
                <option value="app_installs">App Installs</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Daily Budget ($)</label>
              <input name="budgetDaily" type="number" step="0.01" min="0" placeholder="50.00" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Total Budget ($)</label>
              <input name="budgetTotal" type="number" step="0.01" min="0" placeholder="1000.00" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Start Date</label>
              <input name="startDate" type="date" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">End Date</label>
              <input name="endDate" type="date" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Audience Targeting (JSON, optional)</label>
            <textarea name="targeting" rows={2} placeholder='{"age_min": 25, "age_max": 55, "interests": ["family"]}' className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring resize-none" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Create Campaign
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Status filter chips */}
      {campaigns.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => {
            const count = s === "all" ? campaigns.length : campaigns.filter((c) => c.campaignStatus === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <span className={`rounded-full px-1 text-[10px] ${statusFilter === s ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Megaphone className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-4 text-base font-medium text-foreground">No campaigns yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create your first ad campaign to get started</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Create Campaign
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Campaign List */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No campaigns with this status.</p>
            ) : filtered.map((campaign) => {
              const pc = PLATFORM_CONFIG[campaign.platform] ?? PLATFORM_CONFIG.meta!;
              const sc = STATUS_CONFIG[campaign.campaignStatus] ?? STATUS_CONFIG.draft!;
              return (
                <button
                  key={campaign.id}
                  onClick={() => { setSelectedId(campaign.id); setShowVariantForm(false); setShowAICopy(false); }}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${
                    selectedId === campaign.id
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${pc.badge}`}>
                          {pc.label}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${sc.className}`}>
                          {sc.icon}{sc.label}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{campaign.name}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {OBJECTIVE_LABELS[campaign.objective] ?? campaign.objective} · {campaign.variants.length} variant{campaign.variants.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {campaign.budgetDaily != null && (
                      <span className="text-[11px] text-muted-foreground shrink-0">${Number(campaign.budgetDaily).toFixed(0)}/day</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Campaign Detail */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                <div className="text-center">
                  <Target className="mx-auto h-7 w-7 text-muted-foreground/40 mb-2" />
                  Select a campaign to view details
                </div>
              </div>
            ) : (
              <div className="space-y-4">

                {/* Campaign header */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {(PLATFORM_CONFIG[selected.platform] ?? PLATFORM_CONFIG.meta!).label} · {OBJECTIVE_LABELS[selected.objective] ?? selected.objective}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {selected.campaignStatus === "draft" && (
                        <button
                          onClick={() => handleStatusChange(selected.id, "active")}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" /> Launch
                        </button>
                      )}
                      {selected.campaignStatus === "active" && (
                        <button
                          onClick={() => handleStatusChange(selected.id, "paused")}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          <Pause className="h-3.5 w-3.5" /> Pause
                        </button>
                      )}
                      {selected.campaignStatus === "paused" && (
                        <button
                          onClick={() => handleStatusChange(selected.id, "active")}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Play className="h-3.5 w-3.5" /> Resume
                        </button>
                      )}
                      {selected.campaignStatus !== "archived" && selected.campaignStatus !== "completed" && (
                        <button
                          onClick={() => handleStatusChange(selected.id, "archived")}
                          disabled={isPending}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(selected.id)}
                        disabled={isPending}
                        className="rounded-lg border border-destructive/20 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* KPI grid */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {[
                      { label: "Spend",        value: selected.spend != null ? `$${Number(selected.spend).toLocaleString()}` : "—", icon: <DollarSign className="h-3.5 w-3.5" /> },
                      { label: "Impressions",  value: fmt(selected.impressions), icon: <Eye className="h-3.5 w-3.5" /> },
                      { label: "Clicks",       value: fmt(selected.clicks),      icon: <MousePointerClick className="h-3.5 w-3.5" /> },
                      { label: "CTR",          value: ctr(selected.clicks, selected.impressions), icon: <BarChart3 className="h-3.5 w-3.5" /> },
                      { label: "Conversions",  value: fmt(selected.conversions), icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
                      { label: "CPC",          value: cpc(selected.spend, selected.clicks),       icon: <DollarSign className="h-3.5 w-3.5" /> },
                    ].map(({ label, value, icon }) => (
                      <div key={label} className="rounded-lg bg-muted/40 px-2.5 py-2">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">{icon}{label}</div>
                        <p className="text-sm font-semibold text-foreground">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Date range */}
                  {(selected.startDate || selected.endDate) && (
                    <p className="text-xs text-muted-foreground">
                      {selected.startDate && <>Start: {new Date(selected.startDate).toLocaleDateString()}</>}
                      {selected.startDate && selected.endDate && <> · </>}
                      {selected.endDate && <>End: {new Date(selected.endDate).toLocaleDateString()}</>}
                    </p>
                  )}
                </div>

                {/* Ad Variants */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      Ad Variants
                      <span className="text-muted-foreground font-normal">({selected.variants.length})</span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowAICopy((v) => !v); setShowVariantForm(false); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/5"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> AI Generate
                      </button>
                      <button
                        onClick={() => { setShowVariantForm((v) => !v); setShowAICopy(false); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Variant
                      </button>
                    </div>
                  </div>

                  {/* AI Copy Panel */}
                  {showAICopy && (
                    <AICopyPanel campaignId={selected.id} onAddVariant={(fd) => { handleAddVariant(fd); setShowAICopy(false); }} />
                  )}

                  {/* Manual Variant Form */}
                  {showVariantForm && (
                    <form
                      onSubmit={(e) => { e.preventDefault(); handleAddVariant(new FormData(e.currentTarget)); e.currentTarget.reset(); }}
                      className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5"
                    >
                      <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Variant</p>
                      <input type="hidden" name="campaignId" value={selected.id} />
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Headline *</label>
                        <input name="headline" required placeholder="Compelling headline..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Body Copy *</label>
                        <textarea name="body" required rows={3} placeholder="Ad body copy..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring resize-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">CTA Text</label>
                          <input name="ctaText" placeholder="Learn More" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Landing URL</label>
                          <input name="landingUrl" type="url" placeholder="https://..." className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Add
                        </button>
                        <button type="button" onClick={() => setShowVariantForm(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Variant cards */}
                  {selected.variants.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-sm text-muted-foreground">No variants yet.</p>
                      <button onClick={() => setShowAICopy(true)} className="mt-1 text-xs text-primary hover:underline">
                        Generate with AI →
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selected.variants.map((variant, idx) => (
                        <VariantCard
                          key={variant.id}
                          variant={variant}
                          idx={idx}
                          campaignId={selected.id}
                          isPending={isPending}
                          onMarkWinner={handleMarkWinner}
                        />
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
