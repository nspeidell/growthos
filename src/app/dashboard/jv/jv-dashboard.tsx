"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  Users, Link2, BarChart3, DollarSign, Plus, Copy, Check, ExternalLink,
  QrCode, TrendingUp, MousePointerClick, Star, Archive, RefreshCw,
  ChevronDown, AlertCircle, CheckCircle, X, Globe, Handshake,
  Zap, Target, ShieldCheck,
} from "lucide-react";
import {
  listPartners, createPartner, archivePartner,
  listCampaigns, createCampaign,
  listTrackingLinks, createTrackingLink,
  getPartnerAnalytics, getWorkspaceJvSummary, computePartnerQualityScore,
  listPayouts, createPayout, markPayoutPaid,
  type PartnerAnalyticsSummary, type WorkspaceJvSummary,
} from "./actions";
import type { Partner, PartnerCampaign, TrackingLink, PartnerPayout } from "@/lib/db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n ?? 0);
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n ?? 0);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PARTNER_TYPE_LABELS: Record<string, string> = {
  influencer: "Influencer",
  podcast: "Podcast",
  creator: "Creator",
  affiliate: "Affiliate",
  family_org: "Family Org",
  church: "Church",
  community: "Community",
  media: "Media",
};

const PARTNER_TYPE_COLORS: Record<string, string> = {
  influencer: "bg-purple-500/10 text-purple-400",
  podcast: "bg-blue-500/10 text-blue-400",
  creator: "bg-pink-500/10 text-pink-400",
  affiliate: "bg-green-500/10 text-green-400",
  family_org: "bg-orange-500/10 text-orange-400",
  church: "bg-yellow-500/10 text-yellow-400",
  community: "bg-teal-500/10 text-teal-400",
  media: "bg-red-500/10 text-red-400",
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function QualityBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const color =
    pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums w-8 text-right">{pct.toFixed(0)}</span>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon, label, value, sub, color = "text-primary",
}: {
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

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };
  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 transition-colors ${className}`}
    >
      {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ─── Add Partner Modal ────────────────────────────────────────────────────────

function AddPartnerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", companyName: "", partnerType: "affiliate",
    websiteUrl: "", socialHandle: "", notes: "",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.set(k, v));
      const res = await createPartner(fd);
      if (!res.success) { setError(res.error); return; }
      onAdded();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" /> Add Partner
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
              <input value={form.name} onChange={set("name")} placeholder="Jane Smith"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
              <select value={form.partnerType} onChange={set("partnerType")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                {Object.entries(PARTNER_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input type="email" value={form.email} onChange={set("email")} placeholder="jane@example.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
              <input value={form.companyName} onChange={set("companyName")} placeholder="Acme Inc."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Website</label>
              <input value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="https://..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Social Handle</label>
              <input value={form.socialHandle} onChange={set("socialHandle")} placeholder="@handle"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
            <textarea value={form.notes} onChange={set("notes")} rows={3}
              placeholder="Audience demographics, content style, relationship notes..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
              Cancel
            </button>
            <button onClick={submit} disabled={pending || !form.name}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
              {pending ? "Adding…" : "Add Partner"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Generate Link Modal ───────────────────────────────────────────────────────

function GenerateLinkModal({
  partners,
  onClose,
  onCreated,
}: {
  partners: Partner[];
  onClose: () => void;
  onCreated: (link: TrackingLink & { shortUrl: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<PartnerCampaign[]>([]);
  const [form, setForm] = useState({
    partnerId: partners[0]?.id ?? "",
    campaignId: "",
    destinationUrl: "https://getreunionapp.com",
    utmSource: "",
    utmMedium: "referral",
    utmCampaign: "",
    utmContent: "",
    attributionWindowDays: "30",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Load campaigns for selected partner
  useEffect(() => {
    if (!form.partnerId) return;
    listCampaigns(form.partnerId).then(res => {
      if (res.success) setCampaigns(res.data);
    });
  }, [form.partnerId]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.set(k, v));
      const res = await createTrackingLink(fd);
      if (!res.success) { setError(res.error); return; }
      onCreated(res.data);
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" /> Generate Tracking Link
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Partner *</label>
            <select value={form.partnerId} onChange={set("partnerId")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
              {partners.map(p => (
                <option key={p.id} value={p.id}>{p.name}{p.companyName ? ` — ${p.companyName}` : ""}</option>
              ))}
            </select>
          </div>

          {campaigns.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Campaign (optional)</label>
              <select value={form.campaignId} onChange={set("campaignId")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">No campaign</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.id}>{c.campaignName}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Destination URL *</label>
            <input value={form.destinationUrl} onChange={set("destinationUrl")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">UTM Source</label>
              <input value={form.utmSource} onChange={set("utmSource")} placeholder="e.g. podcast_xyz"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">UTM Medium</label>
              <input value={form.utmMedium} onChange={set("utmMedium")} placeholder="referral"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">UTM Campaign</label>
              <input value={form.utmCampaign} onChange={set("utmCampaign")} placeholder="spring_launch"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Attribution Window</label>
              <select value={form.attributionWindowDays} onChange={set("attributionWindowDays")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
              Cancel
            </button>
            <button onClick={submit} disabled={pending || !form.partnerId || !form.destinationUrl}
              className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
              {pending ? "Generating…" : "Generate Link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Link Card ────────────────────────────────────────────────────────────────

function LinkCard({ link, partnerName }: { link: TrackingLink & { shortUrl?: string }; partnerName: string }) {
  const [showQr, setShowQr] = useState(false);
  // Reconstruct short URL from short_code if not provided
  const shortUrl = (link as TrackingLink & { shortUrl?: string }).shortUrl
    ?? `${typeof window !== "undefined" ? window.location.origin : ""}/r/${link.shortCode}`;

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(shortUrl)}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold text-primary">/{link.shortCode}</span>
            <span className="text-xs text-muted-foreground">→ {partnerName}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{link.destinationUrl}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => setShowQr(s => !s)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-muted hover:bg-muted/80 transition-colors">
            <QrCode className="h-3 w-3" />
          </button>
          <CopyButton text={shortUrl} />
          <a href={shortUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs bg-muted hover:bg-muted/80 transition-colors">
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MousePointerClick className="h-3 w-3" />
          {fmt(link.clickCount ?? 0)} clicks
        </span>
        <span>{fmt(link.uniqueClickCount ?? 0)} unique</span>
        {link.utmSource && <span>utm: {link.utmSource}</span>}
      </div>

      {/* QR Code Panel */}
      {showQr && (
        <div className="mt-3 pt-3 border-t border-border flex flex-col items-center gap-2">
          <img src={qrSrc} alt="QR code" className="rounded-lg" width={160} height={160} />
          <p className="text-xs text-muted-foreground">Scan to open tracking link</p>
          <a href={qrSrc} download={`qr-${link.shortCode}.png`}
            className="text-xs text-primary hover:underline">
            Download QR
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Analytics Drilldown ──────────────────────────────────────────────────────

function AnalyticsPanel({ partner }: { partner: Partner }) {
  const [data, setData] = useState<PartnerAnalyticsSummary | null>(null);
  const [computing, startCompute] = useTransition();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getPartnerAnalytics(partner.id).then(res => {
      if (res.success) setData(res.data);
      setLoading(false);
    });
  }, [partner.id]);

  useEffect(() => { load(); }, [load]);

  const recompute = () => {
    startCompute(async () => {
      await computePartnerQualityScore(partner.id);
      load();
    });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
      Loading analytics…
    </div>
  );

  if (!data) return (
    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
      Could not load analytics.
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Quality Score */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Partner Quality Score
          </h3>
          <button onClick={recompute} disabled={computing}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3 w-3 ${computing ? "animate-spin" : ""}`} />
            Recompute
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-4xl font-black tabular-nums" style={{
            color: (data.partner.qualityScore ?? 0) >= 70 ? "hsl(var(--primary))"
              : (data.partner.qualityScore ?? 0) >= 40 ? "#f59e0b" : "#ef4444"
          }}>
            {(data.partner.qualityScore ?? 0).toFixed(0)}
          </div>
          <div className="flex-1 text-xs text-muted-foreground">
            Score out of 100 based on retention, activation depth, referral propagation, conversion rate, and churn.
          </div>
        </div>
      </div>

      {/* 30-Day Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={MousePointerClick} label="Clicks (30d)" value={fmt(data.clicks30d)} color="text-blue-400" />
        <StatCard icon={Users} label="Conversions (30d)" value={fmt(data.conversions30d)} color="text-green-400" />
        <StatCard icon={TrendingUp} label="Conv. Rate" value={`${data.conversionRate}%`} color="text-purple-400" />
        <StatCard icon={DollarSign} label="Revenue (30d)" value={fmtMoney(data.revenue30d)} color="text-yellow-400" />
      </div>

      {/* Top Links */}
      {data.topLinks.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Top Performing Links</h3>
          <div className="space-y-2">
            {data.topLinks.map(link => (
              <div key={link.id} className="flex items-center justify-between text-sm">
                <span className="font-mono text-primary text-xs">/{link.shortCode}</span>
                <span className="text-xs text-muted-foreground truncate mx-3 flex-1">{link.destinationUrl}</span>
                <span className="text-xs font-medium tabular-nums">
                  {fmt(link.clickCount ?? 0)} <span className="text-muted-foreground font-normal">clicks</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Payout Row ───────────────────────────────────────────────────────────────

function PayoutRow({ payout, partnerName, onPaid }: {
  payout: PartnerPayout;
  partnerName: string;
  onPaid: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const markPaid = () => {
    startTransition(async () => {
      await markPayoutPaid(payout.id);
      onPaid();
    });
  };

  const statusColor = payout.status === "paid"
    ? "bg-green-500/10 text-green-400"
    : payout.status === "failed"
    ? "bg-red-500/10 text-red-400"
    : "bg-yellow-500/10 text-yellow-400";

  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <div className="text-sm font-medium">{partnerName}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {payout.payoutMethod ?? "—"} · {fmtDate(payout.createdAt)}
          {payout.note && ` · ${payout.note}`}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
          {payout.status}
        </span>
        <span className="text-sm font-bold tabular-nums">{fmtMoney(payout.amount)}</span>
        {payout.status === "pending" && (
          <button onClick={markPaid} disabled={pending}
            className="text-xs rounded-md px-2.5 py-1.5 bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50">
            {pending ? "…" : "Mark Paid"}
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Main Dashboard
// ═══════════════════════════════════════════

type Tab = "partners" | "links" | "analytics" | "payouts";

export default function JvDashboard() {
  const [tab, setTab] = useState<Tab>("partners");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [links, setLinks] = useState<(TrackingLink & { shortUrl?: string })[]>([]);
  const [payouts, setPayouts] = useState<PartnerPayout[]>([]);
  const [summary, setSummary] = useState<WorkspaceJvSummary | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [showGenerateLink, setShowGenerateLink] = useState(false);
  const [newLink, setNewLink] = useState<(TrackingLink & { shortUrl: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");

  const partnerMap = Object.fromEntries(partners.map(p => [p.id, p.name]));

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      listPartners("active"),
      listTrackingLinks(),
      getWorkspaceJvSummary(),
      listPayouts(),
    ]).then(([pRes, lRes, sRes, payRes]) => {
      if (pRes.success) setPartners(pRes.data);
      if (lRes.success) setLinks(lRes.data);
      if (sRes.success) setSummary(sRes.data);
      if (payRes.success) setPayouts(payRes.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-select first partner for analytics
  useEffect(() => {
    if (partners.length > 0 && !selectedPartnerId && partners[0]) {
      setSelectedPartnerId(partners[0].id);
    }
  }, [partners, selectedPartnerId]);

  const filteredPartners = filterType === "all"
    ? partners
    : partners.filter(p => p.partnerType === filterType);

  const selectedPartner = partners.find(p => p.id === selectedPartnerId);

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "partners", label: "Partner CRM", icon: Users },
    { id: "links", label: "Tracking Links", icon: Link2 },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "payouts", label: "Payouts", icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="h-6 w-6 text-primary" />
            JV Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Partnership attribution, tracking links, and payout management
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "partners" && (
            <button onClick={() => setShowAddPartner(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> Add Partner
            </button>
          )}
          {tab === "links" && (
            <button onClick={() => setShowGenerateLink(true)} disabled={partners.length === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              <Link2 className="h-4 w-4" /> Generate Link
            </button>
          )}
          <button onClick={loadAll}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Active Partners" value={String(summary.activePartners)} sub={`${summary.totalPartners} total`} color="text-primary" />
          <StatCard icon={MousePointerClick} label="Clicks (30d)" value={fmt(summary.totalClicks30d)} color="text-blue-400" />
          <StatCard icon={Target} label="Conversions (30d)" value={fmt(summary.totalConversions30d)} color="text-green-400" />
          <StatCard icon={DollarSign} label="Payout Owed" value={fmtMoney(summary.totalPayoutOwed)} sub={`${fmtMoney(summary.totalRevenue30d)} rev (30d)`} color="text-yellow-400" />
        </div>
      )}

      {/* New Link Toast */}
      {newLink && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-green-300">Link created!</div>
                <div className="font-mono text-sm mt-0.5">{newLink.shortUrl}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={newLink.shortUrl} />
              <button onClick={() => setNewLink(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Partners ──────────────────────────────── */}
      {tab === "partners" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {["all", ...Object.keys(PARTNER_TYPE_LABELS)].map(type => (
              <button key={type} onClick={() => setFilterType(type)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filterType === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}>
                {type === "all" ? "All" : PARTNER_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading…</div>
          ) : filteredPartners.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Handshake className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No partners yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add your first JV partner to start tracking referrals.</p>
              <button onClick={() => setShowAddPartner(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
                <Plus className="h-4 w-4" /> Add Partner
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Partner</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide w-40">Quality Score</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Clicks</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Signups</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Revenue</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Owed</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredPartners.map(partner => (
                    <tr key={partner.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{partner.name}</div>
                        {partner.companyName && <div className="text-xs text-muted-foreground">{partner.companyName}</div>}
                        {partner.socialHandle && <div className="text-xs text-muted-foreground">{partner.socialHandle}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={PARTNER_TYPE_LABELS[partner.partnerType] ?? partner.partnerType}
                          color={PARTNER_TYPE_COLORS[partner.partnerType] ?? "bg-muted text-muted-foreground"} />
                      </td>
                      <td className="px-4 py-3 w-40">
                        <QualityBar score={partner.qualityScore ?? 0} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(partner.totalClicks ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(partner.totalSignups ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(partner.totalRevenue ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-yellow-400">{fmtMoney(partner.payoutOwed ?? 0)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => { setSelectedPartnerId(partner.id); setTab("analytics"); }}
                            className="text-xs rounded-md px-2 py-1 bg-muted hover:bg-muted/80 transition-colors"
                            title="View analytics">
                            <BarChart3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={async () => { await archivePartner(partner.id); loadAll(); }}
                            className="text-xs rounded-md px-2 py-1 bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                            title="Archive">
                            <Archive className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Links ─────────────────────────────────── */}
      {tab === "links" && (
        <div className="space-y-4">
          {/* Partner Filter */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button onClick={() => setSelectedPartnerId(null)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                !selectedPartnerId ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}>
              All Partners
            </button>
            {partners.map(p => (
              <button key={p.id} onClick={() => setSelectedPartnerId(p.id)}
                className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedPartnerId === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}>
                {p.name}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading…</div>
          ) : links.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Link2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No tracking links yet</p>
              <p className="text-xs text-muted-foreground mt-1">Generate a link for a partner to start tracking referrals.</p>
              {partners.length > 0 && (
                <button onClick={() => setShowGenerateLink(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
                  <Plus className="h-4 w-4" /> Generate Link
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {links
                .filter(l => !selectedPartnerId || l.partnerId === selectedPartnerId)
                .map(link => (
                  <LinkCard
                    key={link.id}
                    link={link}
                    partnerName={partnerMap[link.partnerId] ?? "Unknown"}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Analytics ─────────────────────────────── */}
      {tab === "analytics" && (
        <div className="space-y-4">
          {/* Partner Selector */}
          {partners.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {partners.map(p => (
                <button key={p.id} onClick={() => setSelectedPartnerId(p.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    selectedPartnerId === p.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}>
                  {p.name}
                  <span className={`font-mono font-bold ${
                    (p.qualityScore ?? 0) >= 70 ? "text-green-400" :
                    (p.qualityScore ?? 0) >= 40 ? "text-yellow-400" : "text-red-400"
                  }`}>{(p.qualityScore ?? 0).toFixed(0)}</span>
                </button>
              ))}
            </div>
          )}

          {selectedPartner ? (
            <AnalyticsPanel partner={selectedPartner} />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">Select a partner to view analytics</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Payouts ───────────────────────────────── */}
      {tab === "payouts" && (
        <div className="space-y-4">
          {/* Owed Banner */}
          {summary && summary.totalPayoutOwed > 0 && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-yellow-400" />
                <div>
                  <div className="text-sm font-semibold text-yellow-300">
                    {fmtMoney(summary.totalPayoutOwed)} total owed to partners
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Review pending payouts below and mark them paid once sent.
                  </div>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading…</div>
          ) : payouts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <DollarSign className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium">No payouts recorded</p>
              <p className="text-xs text-muted-foreground mt-1">Payouts are recorded automatically as conversions accrue.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card px-4">
              {payouts.map(payout => (
                <PayoutRow
                  key={payout.id}
                  payout={payout}
                  partnerName={partnerMap[payout.partnerId] ?? "Unknown"}
                  onPaid={loadAll}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddPartner && (
        <AddPartnerModal
          onClose={() => setShowAddPartner(false)}
          onAdded={loadAll}
        />
      )}
      {showGenerateLink && (
        <GenerateLinkModal
          partners={partners}
          onClose={() => setShowGenerateLink(false)}
          onCreated={(link) => {
            setNewLink(link);
            setLinks(prev => [link, ...prev]);
            setShowGenerateLink(false);
            setTab("links");
          }}
        />
      )}
    </div>
  );
}
