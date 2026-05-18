"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  Radio,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  Eye,
  Filter,
  RefreshCw,
  ExternalLink,
  ThumbsDown,
  ArrowRight,
  Plus,
  Trash2,
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
  Copy,
  Check,
  CheckCircle2,
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
  deleteSource,
  deleteKeyword,
  toggleAlert,
  deleteAlert,
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
  SOURCE_PLATFORM_LABELS,
} from "@/lib/signals/types";

// ─── Signal Type Icons ────────────────────────────────────────────────────────

const SIGNAL_ICONS: Record<SignalType, typeof Radio> = {
  lead_opportunity:       Target,
  viral_trend:            TrendingUp,
  competitor_mention:     Shield,
  negative_sentiment:     ThumbsDown,
  brand_mention:          Star,
  community_question:     MessageCircle,
  partnership_opportunity: Handshake,
  influencer_opportunity: Users,
  content_idea:           Lightbulb,
  reputation_risk:        AlertTriangle,
};

// ─── Priority Config ──────────────────────────────────────────────────────────

function priorityConfig(score: number) {
  if (score >= 80) return { bar: "bg-destructive",        text: "text-destructive",        label: "Critical" };
  if (score >= 60) return { bar: "bg-amber-500",          text: "text-amber-500",          label: "High" };
  if (score >= 40) return { bar: "bg-primary",            text: "text-primary",            label: "Medium" };
  return              { bar: "bg-muted-foreground/40",  text: "text-muted-foreground",   label: "Low" };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent" title="Copy">
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ─── Tab Types ────────────────────────────────────────────────────────────────

type Tab = "feed" | "trending" | "sources" | "keywords" | "alerts";

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function SignalsDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [stats, setStats] = useState<SignalStats | null>(null);
  const [, startTransition] = useTransition();

  const loadStats = useCallback(() => {
    startTransition(async () => {
      try {
        const s = await getSignalStats();
        setStats(s);
      } catch { /* silent */ }
    });
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const tabs: { id: Tab; label: string; icon: typeof Radio }[] = [
    { id: "feed",     label: "Live Feed",  icon: Radio },
    { id: "trending", label: "Trending",   icon: TrendingUp },
    { id: "sources",  label: "Sources",    icon: Globe },
    { id: "keywords", label: "Keywords",   icon: Hash },
    { id: "alerts",   label: "Alerts",     icon: Bell },
  ];

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
            <Radio className="h-4 w-4 text-green-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-foreground">Signal Intelligence</h1>
              <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-mono font-bold text-green-600 tracking-widest animate-pulse">
                LIVE
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Real-time brand monitoring across all platforms</p>
          </div>
        </div>

        {/* KPI Strip */}
        {stats && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Total",         value: stats.totalSignals,     color: "text-foreground" },
              { label: "New",           value: stats.newSignals,        color: "text-green-600",    pulse: stats.newSignals > 0 },
              { label: "High Priority", value: stats.highPriorityCount, color: "text-amber-500" },
              { label: "Avg Sentiment",
                value: stats.avgSentiment >= 0
                  ? `+${stats.avgSentiment.toFixed(2)}`
                  : stats.avgSentiment.toFixed(2),
                color: stats.avgSentiment >= 0 ? "text-green-600" : "text-destructive" },
            ].map(({ label, value, color, pulse }) => (
              <div key={label} className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                <p className={`mt-0.5 text-xl font-mono font-bold ${color}`}>
                  {pulse && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />}
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab Bar */}
      <div className="border-b border-border mt-4 flex gap-0 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="pt-4">
        {activeTab === "feed"     && <SignalFeed />}
        {activeTab === "trending" && <TrendingPanel />}
        {activeTab === "sources"  && <SourcesPanel />}
        {activeTab === "keywords" && <KeywordsPanel />}
        {activeTab === "alerts"   && <AlertsPanel />}
      </div>
    </div>
  );
}

// ─── Signal Feed ──────────────────────────────────────────────────────────────

function SignalFeed() {
  const [signals, setSignals] = useState<SignalFeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filterType, setFilterType] = useState<SignalType | "">("");
  const [filterStatus, setFilterStatus] = useState<SignalStatus | "">("");
  const [filterPlatform, setFilterPlatform] = useState<SourcePlatform | "">("");
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadSignals = useCallback(() => {
    startTransition(async () => {
      try {
        const result = await getSignalsFeed({
          signalType:  filterType    || undefined,
          status:      filterStatus  || undefined,
          platform:    filterPlatform || undefined,
          limit: 50,
        });
        setSignals(result.signals);
        setTotal(result.total);
      } catch { /* silent */ }
    });
  }, [filterType, filterStatus, filterPlatform]);

  useEffect(() => { loadSignals(); }, [loadSignals]);

  const selectClass = "rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value as SignalType | "")} className={selectClass}>
          <option value="">All Types</option>
          {Object.entries(SIGNAL_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as SignalStatus | "")} className={selectClass}>
          <option value="">All Statuses</option>
          {["new","reviewed","actioned","dismissed","converted"].map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
        </select>
        <select value={filterPlatform} onChange={(e) => setFilterPlatform(e.target.value as SourcePlatform | "")} className={selectClass}>
          <option value="">All Platforms</option>
          {Object.entries(SOURCE_PLATFORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button
          onClick={loadSignals}
          disabled={isPending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <span className="text-xs font-mono text-muted-foreground">{total} signals</span>
      </div>

      {/* Signal List */}
      {signals.length === 0 && !isPending ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Radio className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">No signals detected yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Add listening sources and keywords to start scanning</p>
        </div>
      ) : (
        <div className="space-y-2">
          {signals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              expanded={expandedId === signal.id}
              onToggle={() => setExpandedId(expandedId === signal.id ? null : signal.id)}
              onAction={loadSignals}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────────

function SignalCard({
  signal, expanded, onToggle, onAction,
}: {
  signal: SignalFeedItem;
  expanded: boolean;
  onToggle: () => void;
  onAction: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [replyDraft, setReplyDraft] = useState<string | null>(null);

  const Icon     = SIGNAL_ICONS[signal.signalType] ?? Radio;
  const typeColor = SIGNAL_TYPE_COLORS[signal.signalType] ?? "#888";
  const pc       = priorityConfig(signal.priorityScore);

  const borderLeft =
    signal.priorityScore >= 80 ? "border-l-destructive" :
    signal.priorityScore >= 60 ? "border-l-amber-500" :
    signal.priorityScore >= 40 ? "border-l-primary" :
    "border-l-border";

  function handleDismiss() {
    startTransition(async () => { await dismissSignal(signal.id); onAction(); });
  }
  function handleReview() {
    startTransition(async () => { await updateSignalStatus(signal.id, "reviewed"); onAction(); });
  }
  function handleGenerateReply() {
    startTransition(async () => {
      const result = await generateReply(signal.id);
      if (result.draft) setReplyDraft(result.draft);
    });
  }
  function handleConvert() {
    startTransition(async () => { await convertToContent(signal.id); onAction(); });
  }

  return (
    <div className={`rounded-xl border border-border border-l-4 ${borderLeft} bg-card transition-colors hover:bg-accent/20`}>
      {/* Header */}
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <div className="mt-0.5 rounded-lg p-1.5 shrink-0" style={{ backgroundColor: `${typeColor}18` }}>
          <Icon className="h-4 w-4" style={{ color: typeColor }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="rounded-full px-2 py-0.5 text-[10px] font-mono font-bold"
              style={{ backgroundColor: `${typeColor}18`, color: typeColor }}>
              {SIGNAL_TYPE_LABELS[signal.signalType]}
            </span>
            <span className="text-[11px] text-muted-foreground">{SOURCE_PLATFORM_LABELS[signal.sourcePlatform]}</span>
            {signal.sourceAuthor && (
              <span className="text-[11px] text-muted-foreground">
                @{signal.sourceAuthor}{signal.sourceAuthorFollowers ? ` (${fmtNum(signal.sourceAuthorFollowers)})` : ""}
              </span>
            )}
            {signal.keywordMatched && (
              <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono text-purple-600">
                #{signal.keywordMatched}
              </span>
            )}
          </div>
          <p className="text-sm text-foreground line-clamp-2">
            {signal.aiSummary ?? signal.contentSnippet}
          </p>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1">
            <span className={`text-lg font-mono font-bold ${pc.text}`}>{signal.priorityScore}</span>
          </div>
          <span className="text-[11px] text-muted-foreground">{timeAgo(signal.detectedAt)}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            signal.status === "new"       ? "bg-green-500/10 text-green-600" :
            signal.status === "actioned"  ? "bg-primary/10 text-primary" :
            signal.status === "converted" ? "bg-purple-500/10 text-purple-600" :
            signal.status === "dismissed" ? "bg-muted text-muted-foreground/60" :
            "bg-muted text-muted-foreground"
          }`}>{signal.status}</span>
        </div>
      </button>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          <p className="text-sm text-foreground">{signal.contentSnippet}</p>

          {/* Priority bar */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-16">Priority</span>
            <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${pc.bar}`} style={{ width: `${signal.priorityScore}%` }} />
            </div>
            <span className={`text-[11px] font-mono font-bold ${pc.text}`}>{signal.priorityScore}/100</span>
          </div>

          {/* Sentiment */}
          {signal.aiSentiment !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground w-16">Sentiment</span>
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${((signal.aiSentiment + 1) / 2) * 100}%`,
                    backgroundColor: signal.aiSentiment >= 0 ? "#22c55e" : "#ef4444",
                  }}
                />
              </div>
              <span className={`text-[11px] font-mono ${signal.aiSentiment >= 0 ? "text-green-600" : "text-destructive"}`}>
                {signal.aiSentiment >= 0 ? "+" : ""}{signal.aiSentiment.toFixed(2)}
              </span>
            </div>
          )}

          {/* AI Suggested Response */}
          {signal.aiSuggestedResponse && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Suggested Response</p>
                <CopyButton text={signal.aiSuggestedResponse} />
              </div>
              <p className="text-sm text-foreground">{signal.aiSuggestedResponse}</p>
            </div>
          )}

          {/* Generated Reply Draft */}
          {replyDraft && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] font-medium text-green-600 uppercase tracking-wider">Generated Reply Draft</p>
                <CopyButton text={replyDraft} />
              </div>
              <p className="text-sm text-foreground">{replyDraft}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {signal.sourceUrl && (
              <a href={signal.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent">
                <ExternalLink className="h-3 w-3" /> View Source
              </a>
            )}
            <button onClick={handleGenerateReply} disabled={isPending}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-primary hover:bg-primary/10 disabled:opacity-50">
              {isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Draft Reply
            </button>
            <button onClick={handleConvert} disabled={isPending}
              className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/5 px-2.5 py-1.5 text-xs text-purple-600 hover:bg-purple-500/10 disabled:opacity-50">
              <ArrowRight className="h-3 w-3" /> Convert to Content
            </button>
            {signal.status === "new" && (
              <button onClick={handleReview} disabled={isPending}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50">
                <Eye className="h-3 w-3" /> Mark Reviewed
              </button>
            )}
            {signal.status !== "dismissed" && (
              <button onClick={handleDismiss} disabled={isPending}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/40 disabled:opacity-50">
                <X className="h-3 w-3" /> Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Trending Panel ───────────────────────────────────────────────────────────

function TrendingPanel() {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      try { setTopics(await getTrendingTopics()); } catch { /* silent */ }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxCount = Math.max(...topics.map((t) => t.count), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Trending Topics <span className="font-normal text-muted-foreground">(48h)</span></h2>
        <button onClick={load} disabled={isPending} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
        </button>
      </div>

      {topics.length === 0 && !isPending ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">No trending topics yet</p>
          <p className="mt-1 text-xs text-muted-foreground/60">Topics emerge as signals are collected</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <div key={topic.topic} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">#{topic.topic}</span>
                <span className="text-xl font-mono font-bold text-green-600">{topic.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${(topic.count / maxCount) * 100}%` }} />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className={topic.avgSentiment >= 0 ? "text-green-600" : "text-destructive"}>
                  {topic.avgSentiment >= 0 ? "+" : ""}{topic.avgSentiment.toFixed(2)} sentiment
                </span>
                <span className="text-muted-foreground">
                  {topic.platforms.map((p) => SOURCE_PLATFORM_LABELS[p]).join(", ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sources Panel ────────────────────────────────────────────────────────────

function SourcesPanel() {
  const [sources, setSources] = useState<Array<{
    id: string; source_type: string; name: string;
    is_active: number; last_scanned_at: number | null;
    error_count: number; last_error: string | null;
  }>>([]);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("reddit");
  const [newConfig, setNewConfig] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      try { setSources(await getListeningSources()); } catch { /* silent */ }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAdd() {
    setAddError(null);
    let config: Record<string, unknown> = {};
    try { config = JSON.parse(newConfig || "{}") as Record<string, unknown>; }
    catch { setAddError("Invalid JSON in config"); return; }
    startTransition(async () => {
      const result = await createListeningSource({ name: newName, sourceType: newType, config });
      if (result.success) { setShowAdd(false); setNewName(""); setNewConfig(""); load(); }
      else setAddError(result.error ?? "Failed to create source");
    });
  }

  const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Listening Sources</h2>
        <button onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" /> Add Source
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Source</p>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
          <input placeholder="Source name *" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} />
          <select value={newType} onChange={(e) => setNewType(e.target.value)} className={inputClass}>
            {Object.entries(SOURCE_PLATFORM_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <textarea
            placeholder={'Config JSON (e.g., {"subreddits": ["startups"]})'}
            value={newConfig} onChange={(e) => setNewConfig(e.target.value)}
            rows={2} className={`${inputClass} font-mono resize-none`}
          />
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={isPending || !newName}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              Save Source
            </button>
            <button onClick={() => { setShowAdd(false); setAddError(null); }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {sources.length === 0 && !isPending ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <Globe className="mx-auto h-7 w-7 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No sources configured</p>
          <button onClick={() => setShowAdd(true)} className="mt-1 text-xs text-primary hover:underline">Add your first source →</button>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-2 w-2 rounded-full shrink-0 ${source.is_active ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{source.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {SOURCE_PLATFORM_LABELS[source.source_type as SourcePlatform] ?? source.source_type}
                    {source.last_scanned_at ? ` · Last scan ${timeAgo(new Date(source.last_scanned_at))}` : ""}
                    {source.error_count > 0 && <span className="ml-1 text-destructive">{source.error_count} errors</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startTransition(async () => { await toggleSource(source.id, !source.is_active); load(); })}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${source.is_active ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
                  {source.is_active ? "Active" : "Paused"}
                </button>
                <button onClick={() => startTransition(async () => { await deleteSource(source.id); load(); })}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Keywords Panel ───────────────────────────────────────────────────────────

function KeywordsPanel() {
  const [keywords, setKeywords] = useState<Array<{
    id: string; keyword: string; keyword_type: string;
    is_active: number; match_count: number;
  }>>([]);
  const [isPending, startTransition] = useTransition();
  const [newKeyword, setNewKeyword] = useState("");
  const [newType, setNewType] = useState("brand");

  const load = useCallback(() => {
    startTransition(async () => {
      try { setKeywords(await getTrackedKeywords()); } catch { /* silent */ }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAdd() {
    if (!newKeyword.trim()) return;
    startTransition(async () => {
      await createTrackedKeyword({ keyword: newKeyword.trim(), keywordType: newType });
      setNewKeyword("");
      load();
    });
  }

  const TYPE_CONFIG: Record<string, { badge: string; dot: string }> = {
    brand:       { badge: "bg-blue-500/10 text-blue-600 border-blue-500/20",       dot: "bg-blue-500" },
    competitor:  { badge: "bg-destructive/10 text-destructive border-destructive/20", dot: "bg-destructive" },
    industry:    { badge: "bg-purple-500/10 text-purple-600 border-purple-500/20", dot: "bg-purple-500" },
    opportunity: { badge: "bg-green-500/10 text-green-600 border-green-500/20",    dot: "bg-green-500" },
    local:       { badge: "bg-amber-500/10 text-amber-600 border-amber-500/20",    dot: "bg-amber-500" },
  };

  const maxMatches = Math.max(...keywords.map((k) => k.match_count), 1);

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Tracked Keywords</h2>

      {/* Add keyword */}
      <div className="flex gap-2">
        <input
          type="text" placeholder="Add keyword..." value={newKeyword}
          onChange={(e) => setNewKeyword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
        />
        <select value={newType} onChange={(e) => setNewType(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring">
          {Object.keys(TYPE_CONFIG).map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
        </select>
        <button onClick={handleAdd} disabled={isPending || !newKeyword.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {/* Keywords list */}
      {keywords.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center">
          <Hash className="mx-auto h-7 w-7 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No keywords tracked</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {keywords.map((kw) => {
            const tc = TYPE_CONFIG[kw.keyword_type] ?? TYPE_CONFIG.brand!;
            const pct = Math.round((kw.match_count / maxMatches) * 100);
            return (
              <div key={kw.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shrink-0 ${tc.badge}`}>
                  {kw.keyword_type}
                </span>
                <span className="text-sm font-medium text-foreground flex-1 truncate">{kw.keyword}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${tc.dot}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{kw.match_count}</span>
                  <button onClick={() => startTransition(async () => { await deleteKeyword(kw.id); load(); })}
                    className="rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Alerts Panel ─────────────────────────────────────────────────────────────

function AlertsPanel() {
  const [alerts, setAlerts] = useState<Array<{
    id: string; name: string; alert_type: string;
    notify_method: string; is_active: number;
    trigger_count: number; last_triggered_at: number | null;
  }>>([]);
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAlertType, setNewAlertType] = useState("high_priority");

  const load = useCallback(() => {
    startTransition(async () => {
      try { setAlerts(await getSignalAlerts()); } catch { /* silent */ }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleAdd() {
    if (!newName.trim()) return;
    startTransition(async () => {
      await createSignalAlert({ name: newName, alertType: newAlertType, conditions: {}, notifyMethod: "in_app" });
      setShowAdd(false); setNewName(""); load();
    });
  }

  const ALERT_TYPES = [
    { value: "brand_mention",      label: "Brand Mention" },
    { value: "high_priority",      label: "High Priority Signal" },
    { value: "negative_sentiment", label: "Negative Sentiment" },
    { value: "viral_trend",        label: "Viral Trend" },
    { value: "competitor_alert",   label: "Competitor Alert" },
    { value: "lead_detected",      label: "Lead Detected" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Signal Alerts</h2>
        <button onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-3.5 w-3.5" /> New Alert
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Alert</p>
          <input placeholder="Alert name *" value={newName} onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
          <select value={newAlertType} onChange={(e) => setNewAlertType(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring">
            {ALERT_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={isPending || !newName.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              Create Alert
            </button>
            <button onClick={() => setShowAdd(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}

      {alerts.length === 0 && !isPending ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <Bell className="mx-auto h-7 w-7 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">No alerts configured</p>
          <button onClick={() => setShowAdd(true)} className="mt-1 text-xs text-primary hover:underline">Create your first alert →</button>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <Bell className={`h-4 w-4 shrink-0 ${alert.is_active ? "text-amber-500" : "text-muted-foreground/40"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{alert.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {alert.alert_type.replace(/_/g, " ")} · {alert.notify_method} · triggered {alert.trigger_count}×
                    {alert.last_triggered_at ? ` · Last: ${timeAgo(new Date(alert.last_triggered_at))}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => startTransition(async () => { await toggleAlert(alert.id, !alert.is_active); load(); })}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${alert.is_active ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                  {alert.is_active ? "Active" : "Off"}
                </button>
                <button onClick={() => startTransition(async () => { await deleteAlert(alert.id); load(); })}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
