"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Radio,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  Eye,
  Zap,
  Filter,
  RefreshCw,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  Plus,
  Trash2,
  Search,
  Settings,
  Bell,
  Hash,
  Globe,
  Sparkles,
  Target,
  Users,
  Shield,
  Lightbulb,
  MessageCircle,
  Handshake,
  Star,
  X,
} from "lucide-react";
import {
  getSignalsFeed,
  getSignalStats,
  getListeningSources,
  getTrackedKeywords,
  getSignalAlerts,
  getTrendingTopics,
  updateSignalStatus,
  dismissSignal,
  generateReply,
  convertToContent,
  createListeningSource,
  createTrackedKeyword,
  createSignalAlert,
  toggleSource,
  deleteKeyword,
  toggleAlert,
  createEngagementAction,
} from "./actions";
import type {
  SignalFeedItem,
  SignalStats,
  SignalType,
  SignalStatus,
  SourcePlatform,
  TrendingTopic,
} from "@/lib/signals/types";
import {
  SIGNAL_TYPE_LABELS,
  SIGNAL_TYPE_COLORS,
  SIGNAL_STATUS_COLORS,
  SOURCE_PLATFORM_LABELS,
} from "@/lib/signals/types";

// ═══════════════════════════════════════════
// Signal Type Icons
// ═══════════════════════════════════════════

const SIGNAL_ICONS: Record<SignalType, typeof Radio> = {
  lead_opportunity: Target,
  viral_trend: TrendingUp,
  competitor_mention: Shield,
  negative_sentiment: ThumbsDown,
  brand_mention: Star,
  community_question: MessageCircle,
  partnership_opportunity: Handshake,
  influencer_opportunity: Users,
  content_idea: Lightbulb,
  reputation_risk: AlertTriangle,
};

// ═══════════════════════════════════════════
// Tab Types
// ═══════════════════════════════════════════

type Tab = "feed" | "trending" | "sources" | "keywords" | "alerts";

// ═══════════════════════════════════════════
// Main Dashboard
// ═══════════════════════════════════════════

export function SignalsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const s = await getSignalStats();
        setStats(s);
      } catch (error) {
        console.error("[SignalsDashboard] Failed to load stats", error);
      }
    });
  }, []);

  const tabs: { id: Tab; label: string; icon: typeof Radio }[] = [
    { id: "feed", label: "Live Feed", icon: Radio },
    { id: "trending", label: "Trending", icon: TrendingUp },
    { id: "sources", label: "Sources", icon: Globe },
    { id: "keywords", label: "Keywords", icon: Hash },
    { id: "alerts", label: "Alerts", icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header Stats Bar */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-emerald-400" />
            <h1 className="text-lg font-semibold tracking-tight">
              Signal Intelligence
            </h1>
            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-mono text-emerald-400">
              LIVE
            </span>
          </div>
        </div>

        {/* KPI Strip */}
        {stats && (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Total Signals"
              value={stats.totalSignals}
              color="text-blue-400"
            />
            <KpiCard
              label="New"
              value={stats.newSignals}
              color="text-emerald-400"
              pulse={stats.newSignals > 0}
            />
            <KpiCard
              label="High Priority"
              value={stats.highPriorityCount}
              color="text-amber-400"
            />
            <KpiCard
              label="Avg Sentiment"
              value={
                stats.avgSentiment >= 0
                  ? `+${stats.avgSentiment.toFixed(2)}`
                  : stats.avgSentiment.toFixed(2)
              }
              color={stats.avgSentiment >= 0 ? "text-emerald-400" : "text-red-400"}
            />
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="border-b border-zinc-800 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === "feed" && <SignalFeed />}
        {activeTab === "trending" && <TrendingPanel />}
        {activeTab === "sources" && <SourcesPanel />}
        {activeTab === "keywords" && <KeywordsPanel />}
        {activeTab === "alerts" && <AlertsPanel />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════

function KpiCard({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: string | number;
  color: string;
  pulse?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-mono font-bold ${color}`}>
        {pulse && (
          <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        )}
        {value}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════
// Signal Feed
// ═══════════════════════════════════════════

function SignalFeed() {
  const [signals, setSignals] = useState<SignalFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filterType, setFilterType] = useState<SignalType | "">("");
  const [filterStatus, setFilterStatus] = useState<SignalStatus | "">("");
  const [filterPlatform, setFilterPlatform] = useState<SourcePlatform | "">("");
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadSignals = () => {
    startTransition(async () => {
      try {
        const result = await getSignalsFeed({
          signalType: filterType || undefined,
          status: filterStatus || undefined,
          platform: filterPlatform || undefined,
          limit: 50,
        });
        setSignals(result.signals);
        setTotal(result.total);
      } catch (error) {
        console.error("[SignalFeed] Failed to load signals", error);
      }
    });
  };

  useEffect(() => {
    loadSignals();
  }, [filterType, filterStatus, filterPlatform]);

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as SignalType | "")}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
          >
            <option value="">All Types</option>
            {Object.entries(SIGNAL_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as SignalStatus | "")}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
          >
            <option value="">All Statuses</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="actioned">Actioned</option>
            <option value="dismissed">Dismissed</option>
            <option value="converted">Converted</option>
          </select>

          <select
            value={filterPlatform}
            onChange={(e) =>
              setFilterPlatform(e.target.value as SourcePlatform | "")
            }
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300"
          >
            <option value="">All Platforms</option>
            {Object.entries(SOURCE_PLATFORM_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={loadSignals}
          disabled={isPending}
          className="ml-auto flex items-center gap-2 rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          <RefreshCw
            className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`}
          />
          Refresh
        </button>

        <span className="text-xs text-zinc-500 font-mono">
          {total} signals
        </span>
      </div>

      {/* Signal List */}
      <div className="space-y-2">
        {signals.length === 0 && !isPending && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
            <Radio className="mx-auto h-8 w-8 text-zinc-600" />
            <p className="mt-3 text-zinc-400">No signals detected yet</p>
            <p className="mt-1 text-xs text-zinc-500">
              Add listening sources and keywords to start scanning
            </p>
          </div>
        )}

        {signals.map((signal) => (
          <SignalCard
            key={signal.id}
            signal={signal}
            expanded={expandedId === signal.id}
            onToggle={() =>
              setExpandedId(expandedId === signal.id ? null : signal.id)
            }
            onAction={loadSignals}
          />
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Signal Card
// ═══════════════════════════════════════════

function SignalCard({
  signal,
  expanded,
  onToggle,
  onAction,
}: {
  signal: SignalFeedItem;
  expanded: boolean;
  onToggle: () => void;
  onAction: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [replyDraft, setReplyDraft] = useState<string | null>(null);

  const Icon = SIGNAL_ICONS[signal.signalType] ?? Radio;
  const typeColor = SIGNAL_TYPE_COLORS[signal.signalType] ?? "#888";
  const statusColor = SIGNAL_STATUS_COLORS[signal.status] ?? "#888";

  const priorityBg =
    signal.priorityScore >= 80
      ? "border-l-amber-400"
      : signal.priorityScore >= 60
        ? "border-l-blue-400"
        : "border-l-zinc-600";

  const handleDismiss = () => {
    startTransition(async () => {
      await dismissSignal(signal.id);
      onAction();
    });
  };

  const handleReview = () => {
    startTransition(async () => {
      await updateSignalStatus(signal.id, "reviewed");
      onAction();
    });
  };

  const handleGenerateReply = () => {
    startTransition(async () => {
      const result = await generateReply(signal.id);
      if (result.draft) setReplyDraft(result.draft);
    });
  };

  const handleConvert = () => {
    startTransition(async () => {
      await convertToContent(signal.id);
      onAction();
    });
  };

  const timeAgo = getTimeAgo(signal.detectedAt);

  return (
    <div
      className={`rounded-lg border border-zinc-800 bg-zinc-900 border-l-4 ${priorityBg} transition-colors hover:bg-zinc-900/80`}
    >
      {/* Header row */}
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <div
          className="mt-0.5 rounded p-1.5"
          style={{ backgroundColor: `${typeColor}20` }}
        >
          <Icon className="h-4 w-4" style={{ color: typeColor }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="rounded px-1.5 py-0.5 text-xs font-mono font-bold"
              style={{
                backgroundColor: `${typeColor}20`,
                color: typeColor,
              }}
            >
              {SIGNAL_TYPE_LABELS[signal.signalType]}
            </span>
            <span className="text-xs font-mono text-zinc-500">
              {SOURCE_PLATFORM_LABELS[signal.sourcePlatform]}
            </span>
            {signal.sourceAuthor && (
              <span className="text-xs text-zinc-500">
                @{signal.sourceAuthor}
                {signal.sourceAuthorFollowers
                  ? ` (${formatNumber(signal.sourceAuthorFollowers)})`
                  : ""}
              </span>
            )}
            {signal.keywordMatched && (
              <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-xs text-purple-400 font-mono">
                #{signal.keywordMatched}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-zinc-200 line-clamp-2">
            {signal.aiSummary ?? signal.contentSnippet}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-lg font-mono font-bold text-zinc-300">
            {signal.priorityScore}
          </span>
          <span className="text-xs text-zinc-500">{timeAgo}</span>
          <span
            className="rounded px-1.5 py-0.5 text-xs font-mono"
            style={{
              backgroundColor: `${statusColor}20`,
              color: statusColor,
            }}
          >
            {signal.status}
          </span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
          <p className="text-sm text-zinc-300">{signal.contentSnippet}</p>

          {signal.aiSuggestedResponse && (
            <div className="rounded bg-zinc-800 p-3">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                AI Suggested Response
              </p>
              <p className="text-sm text-zinc-300">
                {signal.aiSuggestedResponse}
              </p>
            </div>
          )}

          {replyDraft && (
            <div className="rounded bg-emerald-950/30 border border-emerald-800/50 p-3">
              <p className="text-xs text-emerald-400 uppercase tracking-wider mb-1">
                Generated Reply Draft
              </p>
              <p className="text-sm text-zinc-300">{replyDraft}</p>
            </div>
          )}

          {/* Sentiment bar */}
          {signal.aiSentiment !== null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Sentiment:</span>
              <div className="h-2 w-32 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${((signal.aiSentiment + 1) / 2) * 100}%`,
                    backgroundColor:
                      signal.aiSentiment >= 0 ? "#22c55e" : "#ef4444",
                  }}
                />
              </div>
              <span
                className={`text-xs font-mono ${
                  signal.aiSentiment >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {signal.aiSentiment >= 0 ? "+" : ""}
                {signal.aiSentiment.toFixed(2)}
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {signal.sourceUrl && (
              <a
                href={signal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700"
              >
                <ExternalLink className="h-3 w-3" /> View Source
              </a>
            )}
            <button
              onClick={handleGenerateReply}
              disabled={isPending}
              className="flex items-center gap-1 rounded bg-blue-600/20 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-600/30"
            >
              <Sparkles className="h-3 w-3" /> Draft Reply
            </button>
            <button
              onClick={handleConvert}
              disabled={isPending}
              className="flex items-center gap-1 rounded bg-purple-600/20 px-3 py-1.5 text-xs text-purple-400 hover:bg-purple-600/30"
            >
              <ArrowRight className="h-3 w-3" /> Convert to Content
            </button>
            {signal.status === "new" && (
              <button
                onClick={handleReview}
                disabled={isPending}
                className="flex items-center gap-1 rounded bg-amber-600/20 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-600/30"
              >
                <Eye className="h-3 w-3" /> Mark Reviewed
              </button>
            )}
            <button
              onClick={handleDismiss}
              disabled={isPending}
              className="flex items-center gap-1 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700"
            >
              <X className="h-3 w-3" /> Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Trending Panel
// ═══════════════════════════════════════════

function TrendingPanel() {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      try {
        const t = await getTrendingTopics();
        setTopics(t);
      } catch (error) {
        console.error("[TrendingPanel] Failed to load trending topics", error);
      }
    });
  }, []);

  return (
    <div>
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
        Trending Topics (48h)
      </h2>

      {topics.length === 0 && !isPending && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-6 py-12 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-zinc-600" />
          <p className="mt-3 text-zinc-400">No trending topics yet</p>
          <p className="mt-1 text-xs text-zinc-500">
            Topics emerge as signals are collected
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
          <div
            key={topic.topic}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-200">
                #{topic.topic}
              </span>
              <span className="text-lg font-mono font-bold text-emerald-400">
                {topic.count}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span
                className={`text-xs font-mono ${
                  topic.avgSentiment >= 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {topic.avgSentiment >= 0 ? "+" : ""}
                {topic.avgSentiment.toFixed(2)} sentiment
              </span>
              <span className="text-xs text-zinc-500">
                {topic.platforms.map((p) => SOURCE_PLATFORM_LABELS[p]).join(", ")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Sources Panel
// ═══════════════════════════════════════════

function SourcesPanel() {
  const [sources, setSources] = useState<
    Array<{
      id: string;
      source_type: string;
      name: string;
      is_active: number;
      last_scanned_at: number | null;
      error_count: number;
      last_error: string | null;
    }>
  >([]);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("reddit");
  const [newConfig, setNewConfig] = useState("");

  const loadSources = () => {
    startTransition(async () => {
      try {
        const s = await getListeningSources();
        setSources(s);
      } catch (error) {
        console.error("[SourcesPanel] Failed to load sources", error);
      }
    });
  };

  useEffect(() => {
    loadSources();
  }, []);

  const handleAdd = () => {
    startTransition(async () => {
      try {
        const config = JSON.parse(newConfig || "{}") as Record<string, unknown>;
        await createListeningSource({
          name: newName,
          sourceType: newType,
          config,
        });
        setShowAdd(false);
        setNewName("");
        setNewConfig("");
        loadSources();
      } catch (error) {
        console.error("[SourcesPanel] Failed to create source (invalid config JSON?)", error);
      }
    });
  };

  const handleToggle = (id: string, active: boolean) => {
    startTransition(async () => {
      await toggleSource(id, !active);
      loadSources();
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Listening Sources
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500"
        >
          <Plus className="h-3 w-3" /> Add Source
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800 p-4 space-y-3">
          <input
            type="text"
            placeholder="Source name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            {Object.entries(SOURCE_PLATFORM_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <textarea
            placeholder='Config JSON (e.g., {"subreddits": ["startups", "SaaS"]})'
            value={newConfig}
            onChange={(e) => setNewConfig(e.target.value)}
            rows={3}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={isPending || !newName}
              className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
            >
              Save
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded bg-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {sources.map((source) => (
          <div
            key={source.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`h-2 w-2 rounded-full ${
                  source.is_active ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  {source.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {SOURCE_PLATFORM_LABELS[source.source_type as SourcePlatform] ??
                    source.source_type}
                  {source.last_scanned_at &&
                    ` — Last scan: ${getTimeAgo(new Date(source.last_scanned_at))}`}
                  {source.error_count > 0 && (
                    <span className="ml-2 text-red-400">
                      {source.error_count} errors
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleToggle(source.id, !!source.is_active)}
              className={`rounded px-3 py-1 text-xs ${
                source.is_active
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {source.is_active ? "Active" : "Paused"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Keywords Panel
// ═══════════════════════════════════════════

function KeywordsPanel() {
  const [keywords, setKeywords] = useState<
    Array<{
      id: string;
      keyword: string;
      keyword_type: string;
      is_active: number;
      match_count: number;
    }>
  >([]);
  const [isPending, startTransition] = useTransition();
  const [newKeyword, setNewKeyword] = useState("");
  const [newType, setNewType] = useState("brand");

  const loadKeywords = () => {
    startTransition(async () => {
      try {
        const k = await getTrackedKeywords();
        setKeywords(k);
      } catch (error) {
        console.error("[KeywordsPanel] Failed to load keywords", error);
      }
    });
  };

  useEffect(() => {
    loadKeywords();
  }, []);

  const handleAdd = () => {
    if (!newKeyword.trim()) return;
    startTransition(async () => {
      await createTrackedKeyword({ keyword: newKeyword, keywordType: newType });
      setNewKeyword("");
      loadKeywords();
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteKeyword(id);
      loadKeywords();
    });
  };

  const TYPE_COLORS: Record<string, string> = {
    brand: "text-blue-400 bg-blue-400/10",
    competitor: "text-red-400 bg-red-400/10",
    industry: "text-purple-400 bg-purple-400/10",
    opportunity: "text-emerald-400 bg-emerald-400/10",
    local: "text-amber-400 bg-amber-400/10",
  };

  return (
    <div>
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">
        Tracked Keywords
      </h2>

      {/* Add keyword */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="Add keyword..."
          value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
        >
          <option value="brand">Brand</option>
          <option value="competitor">Competitor</option>
          <option value="industry">Industry</option>
          <option value="opportunity">Opportunity</option>
          <option value="local">Local</option>
        </select>
        <button
          onClick={handleAdd}
          disabled={isPending || !newKeyword.trim()}
          className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
        >
          Add
        </button>
      </div>

      {/* Keywords list */}
      <div className="flex flex-wrap gap-2">
        {keywords.map((kw) => (
          <div
            key={kw.id}
            className={`flex items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 ${
              TYPE_COLORS[kw.keyword_type] ?? "text-zinc-400 bg-zinc-800"
            }`}
          >
            <span className="text-sm">{kw.keyword}</span>
            <span className="text-xs opacity-60 font-mono">
              {kw.match_count}
            </span>
            <button
              onClick={() => handleDelete(kw.id)}
              className="ml-1 rounded-full p-0.5 hover:bg-zinc-700"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Alerts Panel
// ═══════════════════════════════════════════

function AlertsPanel() {
  const [alerts, setAlerts] = useState<
    Array<{
      id: string;
      name: string;
      alert_type: string;
      notify_method: string;
      is_active: number;
      trigger_count: number;
      last_triggered_at: number | null;
    }>
  >([]);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAlertType, setNewAlertType] = useState("high_priority");

  const loadAlerts = () => {
    startTransition(async () => {
      try {
        const a = await getSignalAlerts();
        setAlerts(a);
      } catch (error) {
        console.error("[AlertsPanel] Failed to load alerts", error);
      }
    });
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const handleAdd = () => {
    startTransition(async () => {
      await createSignalAlert({
        name: newName,
        alertType: newAlertType,
        conditions: {},
        notifyMethod: "in_app",
      });
      setShowAdd(false);
      setNewName("");
      loadAlerts();
    });
  };

  const handleToggle = (id: string, active: boolean) => {
    startTransition(async () => {
      await toggleAlert(id, !active);
      loadAlerts();
    });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Signal Alerts
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500"
        >
          <Plus className="h-3 w-3" /> New Alert
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800 p-4 space-y-3">
          <input
            type="text"
            placeholder="Alert name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          />
          <select
            value={newAlertType}
            onChange={(e) => setNewAlertType(e.target.value)}
            className="w-full rounded border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="brand_mention">Brand Mention</option>
            <option value="high_priority">High Priority Signal</option>
            <option value="negative_sentiment">Negative Sentiment</option>
            <option value="viral_trend">Viral Trend</option>
            <option value="competitor_alert">Competitor Alert</option>
            <option value="lead_detected">Lead Detected</option>
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={isPending || !newName}
              className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
            >
              Create Alert
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="rounded bg-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Bell
                className={`h-4 w-4 ${
                  alert.is_active ? "text-amber-400" : "text-zinc-600"
                }`}
              />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  {alert.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {alert.alert_type.replace(/_/g, " ")} — {alert.notify_method}{" "}
                  — triggered {alert.trigger_count}x
                </p>
              </div>
            </div>
            <button
              onClick={() => handleToggle(alert.id, !!alert.is_active)}
              className={`rounded px-3 py-1 text-xs ${
                alert.is_active
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-zinc-700 text-zinc-400"
              }`}
            >
              {alert.is_active ? "Active" : "Off"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
