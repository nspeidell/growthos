"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart3,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  MousePointerClick,
  TrendingUp,
  Users,
  Loader2,
  Activity,
  Mail,
  ExternalLink,
  RefreshCw,
  ArrowUpRight,
  Bookmark,
} from "lucide-react";
import {
  getKPISummary,
  getTopPosts,
  getSubscriberStats,
  type KPISummary,
  type PostWithMetrics,
  type SubscriberStats,
} from "./actions";

// ─── Config ────────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook:  "Facebook",
  youtube:   "YouTube",
  x:         "X / Twitter",
  reddit:    "Reddit",
  linkedin:  "LinkedIn",
  tiktok:    "TikTok",
  threads:   "Threads",
  pinterest: "Pinterest",
  website:   "Website",
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-500",
  facebook:  "bg-blue-600",
  youtube:   "bg-red-500",
  x:         "bg-sky-500",
  reddit:    "bg-orange-500",
  linkedin:  "bg-blue-700",
  tiktok:    "bg-fuchsia-500",
  threads:   "bg-neutral-600",
  pinterest: "bg-red-600",
  website:   "bg-muted-foreground",
};

const SOURCE_LABELS: Record<string, string> = {
  waitlist:     "Waitlist",
  newsletter:   "Newsletter",
  lead_magnet:  "Lead Magnet",
  manual:       "Manual",
  import:       "Import",
};

const DATE_RANGES = [
  { label: "7d",  days: 7  },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  icon,
  accent,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  accent?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent ?? "bg-muted"} text-foreground`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground tracking-tight">
          {typeof value === "number" ? fmt(value) : value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Engagement Bar ────────────────────────────────────────────────────────────

function EngagementBar({ rate, max }: { rate: number; max: number }) {
  const pct = max > 0 ? Math.min((rate / max) * 100, 100) : 0;
  const color =
    rate >= 5 ? "bg-green-500" :
    rate >= 2 ? "bg-primary" :
    "bg-amber-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-medium ${
        rate >= 5 ? "text-green-600" :
        rate >= 2 ? "text-primary" :
        "text-amber-600"
      }`}>
        {rate.toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [days, setDays] = useState(30);
  const [kpis, setKpis] = useState<KPISummary | null>(null);
  const [topPosts, setTopPosts] = useState<PostWithMetrics[]>([]);
  const [subStats, setSubStats] = useState<SubscriberStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (selectedDays: number, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    const [kpiRes, postsRes, subRes] = await Promise.all([
      getKPISummary(),
      getTopPosts(selectedDays),
      getSubscriberStats(selectedDays),
    ]);

    if (kpiRes.success)   setKpis(kpiRes.data);
    if (postsRes.success) setTopPosts(postsRes.data);
    if (subRes.success)   setSubStats(subRes.data);

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const totalEngagement =
    (kpis?.totalLikes ?? 0) +
    (kpis?.totalComments ?? 0) +
    (kpis?.totalShares ?? 0);

  // Max engagement rate across platforms for bar scaling
  const maxEngRate = Math.max(
    ...Object.entries(kpis?.platformBreakdown ?? {}).map(([, m]) =>
      m.reach > 0 ? ((m.likes + m.comments + m.shares) / m.reach) * 100 : 0
    ),
    0.01
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasData = (kpis?.postCount ?? 0) > 0;

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Performance across all connected platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {DATE_RANGES.map(({ label, days: d }) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => load(days, true)}
            disabled={refreshing}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Primary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Impressions"   value={kpis?.totalImpressions ?? 0}  icon={<Eye className="h-4 w-4" />}              accent="bg-blue-500/10 text-blue-600" />
        <KPICard label="Reach"         value={kpis?.totalReach ?? 0}         icon={<Users className="h-4 w-4" />}            accent="bg-purple-500/10 text-purple-600" />
        <KPICard label="Engagement"    value={totalEngagement}               icon={<Heart className="h-4 w-4" />}            accent="bg-pink-500/10 text-pink-600" />
        <KPICard label="Clicks"        value={kpis?.totalClicks ?? 0}        icon={<MousePointerClick className="h-4 w-4" />} accent="bg-amber-500/10 text-amber-600" />
        <KPICard label="Posts Published" value={kpis?.postCount ?? 0}        icon={<Activity className="h-4 w-4" />}         accent="bg-green-500/10 text-green-600" />
        <KPICard
          label="Avg Eng. Rate"
          value={`${(kpis?.avgEngagementRate ?? 0).toFixed(1)}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent="bg-primary/10 text-primary"
        />
      </div>

      {/* Secondary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Heart className="h-3.5 w-3.5" /> Likes</p>
          <p className="text-xl font-semibold text-foreground mt-0.5">{fmt(kpis?.totalLikes ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><MessageCircle className="h-3.5 w-3.5" /> Comments</p>
          <p className="text-xl font-semibold text-foreground mt-0.5">{fmt(kpis?.totalComments ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Share2 className="h-3.5 w-3.5" /> Shares</p>
          <p className="text-xl font-semibold text-foreground mt-0.5">{fmt(kpis?.totalShares ?? 0)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Bookmark className="h-3.5 w-3.5" /> Saves</p>
          <p className="text-xl font-semibold text-foreground mt-0.5">{fmt(kpis?.totalConversions ?? 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Platform Breakdown */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            Platform Breakdown
          </h2>

          {!hasData || Object.keys(kpis?.platformBreakdown ?? {}).length === 0 ? (
            <div className="py-10 text-center">
              <BarChart3 className="mx-auto h-7 w-7 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">No platform data yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Platform</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Impressions</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Reach</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Engagement</th>
                    <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Clicks</th>
                    <th className="py-2 px-2 text-xs font-medium text-muted-foreground">Eng. Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(kpis!.platformBreakdown).map(([platform, m]) => {
                    const eng = m.likes + m.comments + m.shares;
                    const rate = m.reach > 0 ? (eng / m.reach) * 100 : 0;
                    const dot = PLATFORM_COLORS[platform] ?? "bg-muted-foreground";

                    return (
                      <tr key={platform} className="border-b border-border/50 hover:bg-accent/30 last:border-0">
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${dot}`} />
                            <span className="font-medium text-foreground text-xs">
                              {PLATFORM_LABELS[platform] ?? platform}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right text-xs text-muted-foreground">{fmt(m.impressions)}</td>
                        <td className="py-2.5 px-2 text-right text-xs text-muted-foreground">{fmt(m.reach)}</td>
                        <td className="py-2.5 px-2 text-right text-xs text-muted-foreground">{fmt(eng)}</td>
                        <td className="py-2.5 px-2 text-right text-xs text-muted-foreground">{fmt(m.clicks)}</td>
                        <td className="py-2.5 px-2">
                          <EngagementBar rate={rate} max={maxEngRate} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Subscriber Stats */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            Subscribers
          </h2>

          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-foreground">{fmt(subStats?.active ?? 0)}</p>
                <p className="text-xs text-muted-foreground">active subscribers</p>
              </div>
              {(subStats?.newThisPeriod ?? 0) > 0 && (
                <div className="flex items-center gap-1 text-green-600 text-xs font-medium">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  +{subStats!.newThisPeriod} this period
                </div>
              )}
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">By Source</p>
              {subStats && Object.keys(subStats.bySource).length > 0 ? (
                Object.entries(subStats.bySource)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, n]) => {
                    const total = subStats.total || 1;
                    const pct = Math.round((n / total) * 100);
                    return (
                      <div key={source} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-foreground">{SOURCE_LABELS[source] ?? source}</span>
                          <span className="text-muted-foreground">{n} ({pct}%)</span>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
              ) : (
                <p className="text-xs text-muted-foreground">No subscriber data yet.</p>
              )}
            </div>

            {subStats && subStats.unsubscribed > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {subStats.unsubscribed} unsubscribed
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Top Posts */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Top Posts by Engagement
          <span className="ml-auto text-[11px] font-normal text-muted-foreground">last {days} days</span>
        </h2>

        {topPosts.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">
              No published posts yet. Metrics will appear here once posts are live.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {topPosts.map(({ post, metrics }, i) => {
              const engRate = metrics?.engagementRate
                ? parseFloat(metrics.engagementRate)
                : null;
              const dot = PLATFORM_COLORS[post.platform] ?? "bg-muted-foreground";

              return (
                <div key={post.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  {/* Rank */}
                  <span className="text-sm font-bold text-muted-foreground/40 w-5 shrink-0 text-right">
                    {i + 1}
                  </span>

                  {/* Platform dot */}
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${dot}`} />

                  {/* Post info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs text-muted-foreground">
                        {PLATFORM_LABELS[post.platform] ?? post.platform}
                      </span>
                      {post.publishedAt && (
                        <span className="text-xs text-muted-foreground/60">
                          · {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                      {post.platformPostUrl && (
                        <a
                          href={post.platformPostUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    {post.platformPostUrl && (
                      <p className="text-xs text-muted-foreground truncate">{post.platformPostUrl}</p>
                    )}
                  </div>

                  {/* Metrics */}
                  {metrics ? (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                      <span className="flex items-center gap-1" title="Impressions">
                        <Eye className="h-3 w-3" />
                        {fmt(metrics.impressions ?? 0)}
                      </span>
                      <span className="flex items-center gap-1" title="Likes">
                        <Heart className="h-3 w-3" />
                        {fmt(metrics.likes ?? 0)}
                      </span>
                      <span className="flex items-center gap-1" title="Comments">
                        <MessageCircle className="h-3 w-3" />
                        {fmt(metrics.comments ?? 0)}
                      </span>
                      <span className="flex items-center gap-1" title="Shares">
                        <Share2 className="h-3 w-3" />
                        {fmt(metrics.shares ?? 0)}
                      </span>
                      {engRate !== null && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          engRate >= 5 ? "bg-green-500/10 text-green-600" :
                          engRate >= 2 ? "bg-primary/10 text-primary" :
                          "bg-amber-500/10 text-amber-600"
                        }`}>
                          {engRate.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/60 shrink-0">Metrics pending</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Last updated */}
      {kpis?.updatedAt && (
        <p className="text-center text-[11px] text-muted-foreground/60">
          Data last computed {new Date(kpis.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
