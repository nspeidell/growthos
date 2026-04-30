"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import {
  getKPISummary,
  getPostsWithMetrics,
  type KPISummary,
  type PostWithMetrics,
} from "./actions";

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  x: "X",
  reddit: "Reddit",
};

export default function AnalyticsDashboard() {
  const [kpis, setKpis] = useState<KPISummary | null>(null);
  const [posts, setPosts] = useState<PostWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [kpiResult, postResult] = await Promise.all([
        getKPISummary(),
        getPostsWithMetrics(),
      ]);
      if (kpiResult.success) setKpis(kpiResult.data);
      if (postResult.success) setPosts(postResult.data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const totalEngagement =
    (kpis?.totalLikes ?? 0) +
    (kpis?.totalComments ?? 0) +
    (kpis?.totalShares ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Analytics</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Performance metrics across all connected platforms (last 30 days)
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Impressions"
          value={kpis?.totalImpressions ?? 0}
          icon={<Eye className="w-4 h-4" />}
        />
        <KPICard
          label="Reach"
          value={kpis?.totalReach ?? 0}
          icon={<Users className="w-4 h-4" />}
        />
        <KPICard
          label="Engagement"
          value={totalEngagement}
          icon={<Heart className="w-4 h-4" />}
        />
        <KPICard
          label="Clicks"
          value={kpis?.totalClicks ?? 0}
          icon={<MousePointerClick className="w-4 h-4" />}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniKPI
          label="Posts Published"
          value={kpis?.postCount ?? 0}
        />
        <MiniKPI
          label="Avg Engagement Rate"
          value={`${(kpis?.avgEngagementRate ?? 0).toFixed(1)}%`}
        />
        <MiniKPI
          label="Likes"
          value={kpis?.totalLikes ?? 0}
        />
        <MiniKPI
          label="Comments"
          value={kpis?.totalComments ?? 0}
        />
        <MiniKPI
          label="Shares"
          value={kpis?.totalShares ?? 0}
        />
      </div>

      {/* Platform Breakdown */}
      {kpis?.platformBreakdown &&
        Object.keys(kpis.platformBreakdown).length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Platform Comparison
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="text-left py-2 px-3 font-medium text-neutral-600">
                      Platform
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-neutral-600">
                      Impressions
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-neutral-600">
                      Reach
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-neutral-600">
                      Engagement
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-neutral-600">
                      Clicks
                    </th>
                    <th className="text-right py-2 px-3 font-medium text-neutral-600">
                      Eng. Rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(kpis.platformBreakdown).map(
                    ([platform, m]) => {
                      const eng = m.likes + m.comments + m.shares;
                      const rate =
                        m.reach > 0
                          ? ((eng / m.reach) * 100).toFixed(1)
                          : "0.0";

                      return (
                        <tr
                          key={platform}
                          className="border-b border-neutral-50 hover:bg-neutral-50"
                        >
                          <td className="py-2 px-3 font-medium text-neutral-900">
                            {PLATFORM_LABELS[platform] ?? platform}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-700">
                            {m.impressions.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-700">
                            {m.reach.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-700">
                            {eng.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right text-neutral-700">
                            {m.clicks.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="px-2 py-0.5 rounded bg-brand-100 text-brand-800 text-xs font-medium">
                              {rate}%
                            </span>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* Top Posts */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-neutral-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Recent Published Posts
        </h2>

        {posts.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm text-neutral-500">
              No published posts yet. Metrics will appear here once posts are
              live.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map(({ post, metrics }) => (
              <div
                key={post.id}
                className="flex items-center justify-between border-b border-neutral-50 pb-3 last:border-0"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
                      {PLATFORM_LABELS[post.platform] ?? post.platform}
                    </span>
                    {post.publishedAt && (
                      <span className="text-xs text-neutral-400">
                        {new Date(post.publishedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {post.platformPostUrl && (
                    <a
                      href={post.platformPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-600 hover:text-brand-700 truncate block"
                    >
                      {post.platformPostUrl}
                    </a>
                  )}
                </div>

                {metrics ? (
                  <div className="flex items-center gap-4 text-xs text-neutral-600 flex-shrink-0">
                    <span className="flex items-center gap-1" title="Impressions">
                      <Eye className="w-3 h-3" />
                      {(metrics.impressions ?? 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1" title="Likes">
                      <Heart className="w-3 h-3" />
                      {(metrics.likes ?? 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1" title="Comments">
                      <MessageCircle className="w-3 h-3" />
                      {(metrics.comments ?? 0).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1" title="Shares">
                      <Share2 className="w-3 h-3" />
                      {(metrics.shares ?? 0).toLocaleString()}
                    </span>
                    {metrics.engagementRate && (
                      <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-medium">
                        {metrics.engagementRate}%
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-neutral-400">
                    Metrics pending
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ───

function KPICard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-2 text-neutral-500 text-xs mb-1">
        {icon}
        {label}
      </div>
      <p className="text-2xl font-bold text-neutral-900">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

function MiniKPI({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-lg font-semibold text-neutral-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}
