"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Users, Target, TrendingUp, DollarSign, Plus, ExternalLink,
  Star, Instagram, Youtube, Search, Filter, ChevronDown,
  BarChart3, Megaphone, FileText, RefreshCw, Sparkles, X,
  CheckCircle, Clock, AlertCircle, Zap,
} from "lucide-react";
import {
  listInfluencers, addInfluencer, updateInfluencer, deleteInfluencer,
  generateInfluencerFitSummary, listCampaigns, createCampaign,
  updateCampaignStatus, listCampaignMembers, addCampaignMember,
  updateMemberStatus, listInfluencerContent, logInfluencerContent,
  getInfluencerStats,
  type Influencer, type InfluencerCampaign, type CampaignMember,
  type InfluencerContent, type InfluencerStats,
} from "./actions";

// ─── Helpers ───

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸",
  tiktok: "🎵",
  youtube: "▶️",
  x: "𝕏",
  pinterest: "📌",
  other: "🌐",
};

const STATUS_COLORS: Record<string, string> = {
  prospecting: "bg-muted text-muted-foreground",
  outreach: "bg-blue-500/10 text-blue-400",
  negotiating: "bg-yellow-500/10 text-yellow-400",
  active: "bg-green-500/10 text-green-400",
  completed: "bg-purple-500/10 text-purple-400",
  rejected: "bg-red-500/10 text-red-400",
  blacklisted: "bg-red-900/30 text-red-600",
  draft: "bg-muted text-muted-foreground",
  paused: "bg-yellow-500/10 text-yellow-400",
  cancelled: "bg-red-500/10 text-red-400",
  invited: "bg-blue-500/10 text-blue-400",
  accepted: "bg-green-500/10 text-green-400",
  declined: "bg-red-500/10 text-red-400",
  content_due: "bg-yellow-500/10 text-yellow-400",
  content_submitted: "bg-purple-500/10 text-purple-400",
  content_live: "bg-green-500/10 text-green-400",
  dropped: "bg-muted text-muted-foreground",
};

const TIER_COLORS: Record<string, string> = {
  nano: "bg-slate-500/10 text-slate-400",
  micro: "bg-blue-500/10 text-blue-400",
  mid: "bg-purple-500/10 text-purple-400",
  macro: "bg-orange-500/10 text-orange-400",
  mega: "bg-yellow-500/10 text-yellow-400",
};

function fmt(n: number, compact = true): string {
  if (!compact || n < 1000) return n.toLocaleString();
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

// ─── Stat Card ───

function StatCard({ icon: Icon, label, value, sub, color = "text-primary" }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

// ─── Add Influencer Modal ───

function AddInfluencerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "", handle: "", platform: "instagram" as const,
    profileUrl: "", followerCount: 0, avgEngagementRate: undefined as number | undefined,
    niche: "", tier: "micro" as const, contentStyle: "", status: "prospecting" as const,
    source: "manual" as "manual" | "social_cat" | "signal" | "referral",
    socialCatUrl: "", notes: "", tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await addInfluencer({
        ...form,
        avgEngagementRate: form.avgEngagementRate ? form.avgEngagementRate / 100 : undefined,
      });
      if (res.success) { onAdded(); onClose(); }
      else setError(res.error ?? "Failed to add influencer");
    });
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">Add Influencer</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name *</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Handle *</label>
              <input required value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value.replace("@", "") }))}
                placeholder="without @"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Platform *</label>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value as typeof form.platform }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {["instagram", "tiktok", "youtube", "x", "pinterest", "other"].map(p => (
                  <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tier</label>
              <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value as typeof form.tier }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {["nano", "micro", "mid", "macro", "mega"].map(t => (
                  <option key={t} value={t}>{t} {t === "nano" ? "(<5K)" : t === "micro" ? "(5K-50K)" : t === "mid" ? "(50K-500K)" : t === "macro" ? "(500K+)" : "(1M+)"}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Followers</label>
              <input type="number" min={0} value={form.followerCount}
                onChange={e => setForm(f => ({ ...f, followerCount: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Avg Engagement %</label>
              <input type="number" min={0} max={100} step={0.1}
                value={form.avgEngagementRate ?? ""}
                onChange={e => setForm(f => ({ ...f, avgEngagementRate: parseFloat(e.target.value) || undefined }))}
                placeholder="e.g. 4.5"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Niche</label>
              <input value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))}
                placeholder="fitness, food, travel..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Source</label>
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as typeof form.source }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                <option value="manual">Manual</option>
                <option value="social_cat">Social Cat</option>
                <option value="signal">Signal</option>
                <option value="referral">Referral</option>
              </select>
            </div>
          </div>

          {(form.source as string) === "social_cat" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Social Cat Profile URL</label>
              <input value={form.socialCatUrl} onChange={e => setForm(f => ({ ...f, socialCatUrl: e.target.value }))}
                placeholder="https://thesocialcat.com/..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Profile URL</label>
            <input value={form.profileUrl} onChange={e => setForm(f => ({ ...f, profileUrl: e.target.value }))}
              placeholder="https://instagram.com/..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tags</label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {form.tags.map(t => (
                <span key={t} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {t}
                  <button type="button" onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="Add tag, press Enter"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
              <button type="button" onClick={addTag}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <textarea rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none" />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {pending ? "Adding…" : "Add Influencer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Create Campaign Modal ───

function CreateCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "", description: "", goal: "",
    campaignType: "gifted" as const, budgetCents: 0,
    promoCode: "", status: "draft" as const,
  });
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await createCampaign(form);
      if (res.success) { onCreated(); onClose(); }
      else setError(res.error ?? "Failed to create campaign");
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">New Campaign</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Campaign Name *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Summer Launch — Micro Influencers"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
              <select value={form.campaignType} onChange={e => setForm(f => ({ ...f, campaignType: e.target.value as typeof form.campaignType }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                <option value="gifted">Gifted</option>
                <option value="paid">Paid</option>
                <option value="affiliate">Affiliate</option>
                <option value="ugc">UGC</option>
                <option value="ambassador">Ambassador</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Budget ($)</label>
              <input type="number" min={0} value={form.budgetCents / 100}
                onChange={e => setForm(f => ({ ...f, budgetCents: Math.round(parseFloat(e.target.value || "0") * 100) }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Goal / Brief</label>
            <textarea rows={3} value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))}
              placeholder="Drive awareness for our product launch..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none" />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Promo Code (optional)</label>
            <input value={form.promoCode} onChange={e => setForm(f => ({ ...f, promoCode: e.target.value }))}
              placeholder="LAUNCH20"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {pending ? "Creating…" : "Create Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Log Content Modal ───

function LogContentModal({
  influencers, campaigns, onClose, onLogged,
}: {
  influencers: Influencer[];
  campaigns: InfluencerCampaign[];
  onClose: () => void;
  onLogged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    influencerId: influencers[0]?.id ?? "",
    campaignId: "",
    platform: "instagram",
    postUrl: "",
    postType: "post" as const,
    publishedAt: undefined as number | undefined,
    reach: 0, impressions: 0, likes: 0, comments: 0,
    shares: 0, saves: 0, views: 0, clicks: 0,
    conversions: 0, revenueCents: 0,
  });
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await logInfluencerContent({
        ...form,
        campaignId: form.campaignId || undefined,
      });
      if (res.success) { onLogged(); onClose(); }
      else setError(res.error ?? "Failed to log content");
    });
  }

  const numField = (key: keyof typeof form, label: string) => (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      <input type="number" min={0} value={form[key] as number}
        onChange={e => setForm(f => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">Log Content</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Influencer *</label>
              <select required value={form.influencerId} onChange={e => setForm(f => ({ ...f, influencerId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {influencers.map(i => <option key={i.id} value={i.id}>@{i.handle}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Campaign</label>
              <select value={form.campaignId} onChange={e => setForm(f => ({ ...f, campaignId: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                <option value="">— None —</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Platform</label>
              <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {["instagram", "tiktok", "youtube", "x", "pinterest", "other"].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Post Type</label>
              <select value={form.postType} onChange={e => setForm(f => ({ ...f, postType: e.target.value as typeof form.postType }))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {["post", "reel", "story", "video", "short", "thread", "pin"].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Post URL</label>
            <input value={form.postUrl} onChange={e => setForm(f => ({ ...f, postUrl: e.target.value }))}
              placeholder="https://instagram.com/p/..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {numField("reach", "Reach")}
            {numField("impressions", "Impressions")}
            {numField("likes", "Likes")}
            {numField("comments", "Comments")}
            {numField("shares", "Shares")}
            {numField("saves", "Saves")}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {numField("views", "Views")}
            {numField("clicks", "Clicks")}
            {numField("conversions", "Conversions")}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Attributed Revenue ($)</label>
            <input type="number" min={0} step={0.01}
              value={form.revenueCents / 100}
              onChange={e => setForm(f => ({ ...f, revenueCents: Math.round(parseFloat(e.target.value || "0") * 100) }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {pending ? "Saving…" : "Log Content"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Influencer Card ───

function InfluencerCard({
  inf, onStatusChange, onGenerateSummary,
}: {
  inf: Influencer;
  onStatusChange: (id: string, status: string) => void;
  onGenerateSummary: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [summaryPending, setSummaryPending] = useState(false);

  async function handleSummary() {
    setSummaryPending(true);
    await onGenerateSummary(inf.id);
    setSummaryPending(false);
  }

  const engPct = inf.avgEngagementRate
    ? `${(inf.avgEngagementRate * 100).toFixed(1)}%`
    : "—";

  return (
    <div className="rounded-xl border border-border bg-card hover:border-border/80 transition-colors">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
              {PLATFORM_ICONS[inf.platform]}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground truncate">{inf.name}</span>
                {inf.source === "social_cat" && (
                  <span className="text-xs text-muted-foreground">🐱</span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>@{inf.handle}</span>
                {inf.profileUrl && (
                  <a href={inf.profileUrl} target="_blank" rel="noopener noreferrer"
                    className="ml-1 text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge label={inf.tier} color={TIER_COLORS[inf.tier] ?? "bg-muted text-muted-foreground"} />
            <select
              value={inf.status}
              onChange={e => onStatusChange(inf.id, e.target.value)}
              className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer ${STATUS_COLORS[inf.status] ?? "bg-muted text-muted-foreground"}`}
              style={{ background: "transparent" }}
              onClick={e => e.stopPropagation()}
            >
              {["prospecting", "outreach", "negotiating", "active", "completed", "rejected", "blacklisted"].map(s => (
                <option key={s} value={s} className="bg-card text-foreground">{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-sm font-semibold text-foreground">{fmt(inf.followerCount)}</div>
            <div className="text-xs text-muted-foreground">Followers</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{engPct}</div>
            <div className="text-xs text-muted-foreground">Eng. Rate</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{inf.niche ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Niche</div>
          </div>
        </div>

        {inf.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {inf.tags.map(t => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t}</span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Less" : "Details"}
          </button>
          <button onClick={handleSummary} disabled={summaryPending}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-50">
            <Sparkles className="h-3 w-3" />
            {summaryPending ? "Analyzing…" : "AI Brief"}
          </button>
          {inf.socialCatUrl && (
            <a href={inf.socialCatUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              🐱 Social Cat
            </a>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
          {inf.aiSummary && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
              <div className="flex items-center gap-1 text-xs text-primary font-medium mb-1">
                <Sparkles className="h-3 w-3" /> AI Fit Analysis
              </div>
              <p className="text-xs text-foreground leading-relaxed">{inf.aiSummary}</p>
            </div>
          )}
          {inf.notes && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Notes</div>
              <p className="text-xs text-foreground">{inf.notes}</p>
            </div>
          )}
          {inf.email && (
            <div className="text-xs text-muted-foreground">
              📧 <a href={`mailto:${inf.email}`} className="text-primary hover:underline">{inf.email}</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Campaign Card ───

function CampaignCard({ campaign, onStatusChange, influencers }: {
  campaign: InfluencerCampaign;
  onStatusChange: (id: string, status: string) => void;
  influencers: Influencer[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [selInfluencer, setSelInfluencer] = useState(influencers[0]?.id ?? "");
  const [pending, startTransition] = useTransition();

  async function loadMembers() {
    setLoadingMembers(true);
    const res = await listCampaignMembers(campaign.id);
    if (res.success) setMembers(res.data);
    setLoadingMembers(false);
  }

  function toggleExpand() {
    if (!expanded) loadMembers();
    setExpanded(!expanded);
  }

  function handleAddMember() {
    if (!selInfluencer) return;
    startTransition(async () => {
      const res = await addCampaignMember({
        campaignId: campaign.id,
        influencerId: selInfluencer,
        dealType: "gifted",
        feeCents: 0,
      });
      if (res.success) {
        setAddingMember(false);
        loadMembers();
      }
    });
  }

  function handleMemberStatus(memberId: string, status: string) {
    startTransition(async () => {
      await updateMemberStatus({ memberId, status: status as Parameters<typeof updateMemberStatus>[0]["status"] });
      loadMembers();
    });
  }

  const roi = campaign.spentCents > 0
    ? ((campaign.revenueCents - campaign.spentCents) / campaign.spentCents * 100).toFixed(0)
    : null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium text-foreground">{campaign.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {campaign.campaignType} · {campaign.memberCount} influencer{campaign.memberCount !== 1 ? "s" : ""}
            </div>
          </div>
          <select
            value={campaign.status}
            onChange={e => onStatusChange(campaign.id, e.target.value)}
            className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer ${STATUS_COLORS[campaign.status] ?? "bg-muted text-muted-foreground"}`}
            style={{ background: "transparent" }}
          >
            {["draft", "active", "paused", "completed", "cancelled"].map(s => (
              <option key={s} value={s} className="bg-card text-foreground">{s}</option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-sm font-semibold text-foreground">{fmtMoney(campaign.budgetCents)}</div>
            <div className="text-xs text-muted-foreground">Budget</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{fmtMoney(campaign.spentCents)}</div>
            <div className="text-xs text-muted-foreground">Spent</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-green-400">{fmtMoney(campaign.revenueCents)}</div>
            <div className="text-xs text-muted-foreground">Revenue</div>
          </div>
          <div>
            <div className={`text-sm font-semibold ${roi && parseInt(roi) > 0 ? "text-green-400" : "text-muted-foreground"}`}>
              {roi ? `${roi}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">ROI</div>
          </div>
        </div>

        {campaign.goal && (
          <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{campaign.goal}</p>
        )}

        <button onClick={toggleExpand}
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Hide" : "Manage"} influencers
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          {loadingMembers ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : members.length === 0 ? (
            <div className="text-xs text-muted-foreground">No influencers added yet.</div>
          ) : (
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
                  <div>
                    <span className="text-sm text-foreground font-medium">@{m.influencerHandle}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{fmt(m.followerCount)} followers</span>
                    {m.promoCode && (
                      <span className="ml-2 text-xs text-primary">{m.promoCode}</span>
                    )}
                  </div>
                  <select
                    value={m.status}
                    onChange={e => handleMemberStatus(m.id, e.target.value)}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer ${STATUS_COLORS[m.status] ?? "bg-muted text-muted-foreground"}`}
                    style={{ background: "transparent" }}
                  >
                    {["invited", "accepted", "declined", "content_due", "content_submitted", "content_live", "completed", "dropped"].map(s => (
                      <option key={s} value={s} className="bg-card text-foreground">{s}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {addingMember ? (
            <div className="flex items-center gap-2">
              <select value={selInfluencer} onChange={e => setSelInfluencer(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground">
                {influencers.map(i => <option key={i.id} value={i.id}>@{i.handle} — {fmt(i.followerCount)}</option>)}
              </select>
              <button onClick={handleAddMember} disabled={pending}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                Add
              </button>
              <button onClick={() => setAddingMember(false)}
                className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setAddingMember(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
              <Plus className="h-3 w-3" /> Add influencer to campaign
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───

type Tab = "influencers" | "campaigns" | "content" | "roi";

export default function InfluencerDashboard() {
  const [tab, setTab] = useState<Tab>("influencers");
  const [stats, setStats] = useState<InfluencerStats | null>(null);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [campaigns, setCampaigns] = useState<InfluencerCampaign[]>([]);
  const [content, setContent] = useState<InfluencerContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [, startTransition] = useTransition();

  const [showAddInfluencer, setShowAddInfluencer] = useState(false);
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showLogContent, setShowLogContent] = useState(false);

  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");
  const [search, setSearch] = useState("");

  async function loadAll() {
    setLoading(true);
    const [s, inf, camp, cont] = await Promise.all([
      getInfluencerStats(),
      listInfluencers(),
      listCampaigns(),
      listInfluencerContent(),
    ]);
    if (s.success) setStats(s.data);
    if (inf.success) setInfluencers(inf.data);
    if (camp.success) setCampaigns(camp.data);
    if (cont.success) setContent(cont.data);
    setLoading(false);
  }

  useEffect(() => { void loadAll(); }, []);

  async function handleStatusChange(id: string, status: string) {
    await updateInfluencer({ id, status } as Parameters<typeof updateInfluencer>[0]);
    void loadAll();
  }

  async function handleGenerateSummary(id: string) {
    await generateInfluencerFitSummary(id);
    const res = await listInfluencers();
    if (res.success) setInfluencers(res.data);
  }

  async function handleCampaignStatus(id: string, status: string) {
    await updateCampaignStatus(id, status);
    void loadAll();
  }

  const filteredInfluencers = influencers.filter(inf => {
    if (platformFilter && inf.platform !== platformFilter) return false;
    if (statusFilter && inf.status !== statusFilter) return false;
    if (tierFilter && inf.tier !== tierFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return inf.name.toLowerCase().includes(q) || inf.handle.toLowerCase().includes(q) || (inf.niche ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "influencers", label: "Influencers", icon: Users },
    { id: "campaigns", label: "Campaigns", icon: Megaphone },
    { id: "content", label: "Content", icon: FileText },
    { id: "roi", label: "ROI", icon: TrendingUp },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Influencers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Discover, manage, and measure influencer partnerships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="https://thesocialcat.com/our-creators" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            🐱 Browse Social Cat
          </a>
          <button onClick={() => setShowAddInfluencer(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            <Plus className="h-4 w-4" /> Add Influencer
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Users} label="Total Influencers" value={String(stats.totalInfluencers)}
            sub={`${stats.activeInfluencers} active`} />
          <StatCard icon={Megaphone} label="Campaigns" value={String(stats.totalCampaigns)}
            sub={`${stats.activeCampaigns} running`} color="text-blue-400" />
          <StatCard icon={Target} label="Total Reach" value={fmt(stats.totalReach)}
            sub={`${fmt(stats.totalEngagements)} engagements`} color="text-purple-400" />
          <StatCard icon={DollarSign} label="Revenue" value={fmtMoney(stats.totalRevenueCents)}
            sub={`${fmtMoney(stats.totalSpentCents)} spent`} color="text-green-400" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.id === "influencers" && <span className="rounded-full bg-muted px-1.5 text-xs">{influencers.length}</span>}
            {t.id === "campaigns" && <span className="rounded-full bg-muted px-1.5 text-xs">{campaigns.length}</span>}
          </button>
        ))}
      </div>

      {/* Tab: Influencers */}
      {tab === "influencers" && (
        <div>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search name, handle, niche…"
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm text-foreground" />
            </div>
            <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <option value="">All platforms</option>
              {["instagram", "tiktok", "youtube", "x", "pinterest"].map(p => (
                <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>
              ))}
            </select>
            <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <option value="">All tiers</option>
              {["nano", "micro", "mid", "macro", "mega"].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
              <option value="">All statuses</option>
              {["prospecting", "outreach", "negotiating", "active", "completed"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading influencers…</div>
          ) : filteredInfluencers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="font-medium text-foreground mb-1">No influencers yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Find creators on Social Cat then add them here to manage partnerships.
              </p>
              <button onClick={() => setShowAddInfluencer(true)}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                <Plus className="h-4 w-4" /> Add your first influencer
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredInfluencers.map(inf => (
                <InfluencerCard key={inf.id} inf={inf}
                  onStatusChange={handleStatusChange}
                  onGenerateSummary={handleGenerateSummary} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Campaigns */}
      {tab === "campaigns" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted-foreground">{campaigns.length} campaigns</div>
            <button onClick={() => setShowCreateCampaign(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
              <Plus className="h-4 w-4" /> New Campaign
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading campaigns…</div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Megaphone className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="font-medium text-foreground mb-1">No campaigns yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a campaign to group influencers and track results together.
              </p>
              <button onClick={() => setShowCreateCampaign(true)}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                <Plus className="h-4 w-4" /> Create campaign
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {campaigns.map(c => (
                <CampaignCard key={c.id} campaign={c} influencers={influencers}
                  onStatusChange={handleCampaignStatus} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Content */}
      {tab === "content" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted-foreground">{content.length} posts tracked</div>
            <button onClick={() => setShowLogContent(true)}
              disabled={influencers.length === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              <Plus className="h-4 w-4" /> Log Content
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Loading content…</div>
          ) : content.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="font-medium text-foreground mb-1">No content logged yet</h3>
              <p className="text-sm text-muted-foreground">
                Once influencers post, log the URLs and metrics here to track performance.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Influencer</th>
                    <th className="px-4 py-3 text-left">Campaign</th>
                    <th className="px-4 py-3 text-right">Reach</th>
                    <th className="px-4 py-3 text-right">Eng.</th>
                    <th className="px-4 py-3 text-right">Revenue</th>
                    <th className="px-4 py-3 text-left">Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {content.map(c => {
                    const engagements = c.likes + c.comments + c.shares + c.saves;
                    return (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">@{c.influencerHandle}</div>
                          <div className="text-xs text-muted-foreground">{PLATFORM_ICONS[c.platform]} {c.postType}</div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.campaignName ?? "—"}</td>
                        <td className="px-4 py-3 text-right">{fmt(c.reach)}</td>
                        <td className="px-4 py-3 text-right">
                          {fmt(engagements)}
                          {c.engagementRate && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({(c.engagementRate * 100).toFixed(1)}%)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-green-400">{fmtMoney(c.revenueCents)}</td>
                        <td className="px-4 py-3">
                          {c.postUrl ? (
                            <a href={c.postUrl} target="_blank" rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="h-3 w-3" /> View
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: ROI */}
      {tab === "roi" && (
        <div className="space-y-4">
          {stats && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard icon={DollarSign} label="Total Revenue" value={fmtMoney(stats.totalRevenueCents)} color="text-green-400" />
                <StatCard icon={Zap} label="Total Spent" value={fmtMoney(stats.totalSpentCents)} color="text-yellow-400" />
                <StatCard icon={TrendingUp} label="Net Profit"
                  value={fmtMoney(stats.totalRevenueCents - stats.totalSpentCents)}
                  color={stats.totalRevenueCents >= stats.totalSpentCents ? "text-green-400" : "text-red-400"} />
                <StatCard icon={BarChart3} label="Blended ROI"
                  value={stats.totalSpentCents > 0
                    ? `${(((stats.totalRevenueCents - stats.totalSpentCents) / stats.totalSpentCents) * 100).toFixed(0)}%`
                    : "—"}
                  color="text-primary" />
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-medium text-foreground mb-4">Campaign Performance</h3>
                {campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                ) : (
                  <div className="space-y-3">
                    {campaigns.map(c => {
                      const roi = c.spentCents > 0
                        ? ((c.revenueCents - c.spentCents) / c.spentCents * 100).toFixed(0)
                        : null;
                      const progress = c.budgetCents > 0 ? Math.min(c.spentCents / c.budgetCents, 1) : 0;
                      return (
                        <div key={c.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{c.name}</span>
                              <Badge label={c.status} color={STATUS_COLORS[c.status] ?? "bg-muted text-muted-foreground"} />
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-muted-foreground">{fmtMoney(c.spentCents)} / {fmtMoney(c.budgetCents)}</span>
                              <span className="text-green-400 font-medium">{fmtMoney(c.revenueCents)} revenue</span>
                              {roi && <span className={`font-bold ${parseInt(roi) > 0 ? "text-green-400" : "text-red-400"}`}>{roi}% ROI</span>}
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddInfluencer && (
        <AddInfluencerModal
          onClose={() => setShowAddInfluencer(false)}
          onAdded={loadAll}
        />
      )}
      {showCreateCampaign && (
        <CreateCampaignModal
          onClose={() => setShowCreateCampaign(false)}
          onCreated={loadAll}
        />
      )}
      {showLogContent && (
        <LogContentModal
          influencers={influencers}
          campaigns={campaigns}
          onClose={() => setShowLogContent(false)}
          onLogged={loadAll}
        />
      )}
    </div>
  );
}
