"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  Eye,
  MousePointerClick,
  DollarSign,
  Mail,
  Calendar,
  Plug,
  PenSquare,
  Send,
  Image,
  Search,
  Megaphone,
  ArrowRight,
  Loader2,
  Gauge,
} from "lucide-react";
import { getDashboardKPIs, getTopChannels } from "./dashboard-actions";
import type { DashboardKPIs, TopChannel } from "./dashboard-actions";

// ─── Platform Colors ───

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-500",
  facebook: "bg-blue-600",
  youtube: "bg-red-600",
  x: "bg-neutral-800 dark:bg-neutral-200",
  reddit: "bg-orange-500",
};

// ─── Component ───

export default function CommandCenter() {
  const [kpis, setKPIs] = useState<DashboardKPIs | null>(null);
  const [channels, setChannels] = useState<TopChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [kpiResult, channelResult] = await Promise.all([
        getDashboardKPIs(),
        getTopChannels(),
      ]);
      if (kpiResult.success && kpiResult.data) setKPIs(kpiResult.data);
      if (channelResult.success && channelResult.data) setChannels(channelResult.data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!kpis) return null;

  return (
    <div className="space-y-6">
      {/* Growth Score + Primary KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Growth Score — featured */}
        <div className="lg:col-span-1 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
            <Gauge className="w-4 h-4" />
            Growth Score
          </div>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-foreground">
              {kpis.growthScore}
            </span>
            <span className="text-lg text-muted-foreground mb-1">/100</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-success transition-all duration-1000"
              style={{ width: `${kpis.growthScore}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Based on content, reach, engagement, conversions, and platform diversity
          </p>
        </div>

        {/* KPI Grid */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard
            icon={<Eye className="w-4 h-4" />}
            label="Impressions"
            value={formatNumber(kpis.totalImpressions)}
          />
          <KPICard
            icon={<MousePointerClick className="w-4 h-4" />}
            label="Clicks"
            value={formatNumber(kpis.totalClicks)}
          />
          <KPICard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Engagement"
            value={`${kpis.engagementRate.toFixed(1)}%`}
          />
          <KPICard
            icon={<DollarSign className="w-4 h-4" />}
            label="Ad Spend"
            value={`$${formatNumber(kpis.adSpend)}`}
          />
          <KPICard
            icon={<PenSquare className="w-4 h-4" />}
            label="Content Created"
            value={String(kpis.contentCreated)}
          />
          <KPICard
            icon={<Send className="w-4 h-4" />}
            label="Posts Published"
            value={String(kpis.postsPublished)}
          />
          <KPICard
            icon={<Calendar className="w-4 h-4" />}
            label="Scheduled"
            value={String(kpis.postsScheduled)}
          />
          <KPICard
            icon={<Mail className="w-4 h-4" />}
            label="Subscribers"
            value={formatNumber(kpis.subscriberCount)}
          />
        </div>
      </div>

      {/* Middle Row: Top Channels + Connected Platforms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Channels */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Top Channels
          </h3>
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Publish content to see channel performance
            </p>
          ) : (
            <div className="space-y-3">
              {channels.map((channel) => (
                <div key={channel.platform} className="flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      PLATFORM_COLORS[channel.platform] ?? "bg-muted"
                    }`}
                  />
                  <span className="text-sm font-medium text-foreground capitalize flex-1">
                    {channel.platform}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {channel.posts} posts
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {formatNumber(channel.impressions)} reach
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status Overview */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            System Status
          </h3>
          <div className="space-y-3">
            <StatusRow
              label="Connected Platforms"
              value={`${kpis.connectedPlatforms}/5`}
              active={kpis.connectedPlatforms > 0}
            />
            <StatusRow
              label="Publishing Queue"
              value={`${kpis.postsScheduled} pending`}
              active={kpis.postsScheduled > 0}
            />
            <StatusRow
              label="Ad Campaigns"
              value={kpis.adSpend > 0 ? "Active" : "Inactive"}
              active={kpis.adSpend > 0}
            />
            <StatusRow
              label="Newsletter"
              value={
                kpis.subscriberCount > 0
                  ? `${kpis.subscriberCount} subs`
                  : "Not set up"
              }
              active={kpis.subscriberCount > 0}
            />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            href="/dashboard/content"
            icon={<PenSquare className="w-5 h-5" />}
            title="Create Content"
          />
          <QuickAction
            href="/dashboard/publisher"
            icon={<Send className="w-5 h-5" />}
            title="Schedule Post"
          />
          <QuickAction
            href="/dashboard/seo"
            icon={<Search className="w-5 h-5" />}
            title="SEO Tools"
          />
          <QuickAction
            href="/dashboard/ads"
            icon={<Megaphone className="w-5 h-5" />}
            title="Launch Campaign"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───

function KPICard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function StatusRow({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div
          className={`h-2 w-2 rounded-full ${
            active ? "bg-success" : "bg-muted-foreground/30"
          }`}
        />
        <span className="text-sm text-foreground">{label}</span>
      </div>
      <span className="text-xs text-muted-foreground">{value}</span>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  title,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
        {icon}
      </div>
      <span className="text-sm font-medium text-foreground flex-1">{title}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
    </Link>
  );
}

// ─── Helpers ───

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
