"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  BarChart3,
  ExternalLink,
  Users,
  FileText,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  X,
  Globe,
  CheckCircle2,
} from "lucide-react";
import {
  listCompetitors,
  createCompetitor,
  deleteCompetitor,
  addCompetitorPost,
  analyzeCompetitorPost,
  generateContentOpportunity,
  runGapAnalysis,
  type CompetitorWithPosts,
} from "./actions";
import type { CompetitorPost } from "@/lib/db/schema";

// ─── Config ────────────────────────────────────────────────────────────────────

const PLATFORM_OPTIONS = [
  "instagram",
  "facebook",
  "youtube",
  "x",
  "reddit",
  "linkedin",
  "tiktok",
  "website",
];

const PLATFORM_COLORS: Record<string, { badge: string; dot: string }> = {
  instagram: { badge: "bg-pink-500/10 text-pink-600 border-pink-500/20",    dot: "bg-pink-500" },
  facebook:  { badge: "bg-blue-500/10 text-blue-600 border-blue-500/20",   dot: "bg-blue-500" },
  youtube:   { badge: "bg-red-500/10 text-red-600 border-red-500/20",      dot: "bg-red-500" },
  x:         { badge: "bg-sky-500/10 text-sky-600 border-sky-500/20",      dot: "bg-sky-500" },
  reddit:    { badge: "bg-orange-500/10 text-orange-600 border-orange-500/20", dot: "bg-orange-500" },
  linkedin:  { badge: "bg-blue-600/10 text-blue-700 border-blue-600/20",   dot: "bg-blue-700" },
  tiktok:    { badge: "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20", dot: "bg-fuchsia-500" },
  website:   { badge: "bg-muted text-muted-foreground border-border",       dot: "bg-muted-foreground" },
};

// ─── Simple Markdown Renderer ──────────────────────────────────────────────────

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1.5 text-xs text-foreground leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return <p key={i} className="font-semibold text-foreground mt-2">{line.slice(3)}</p>;
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return <p key={i} className="font-semibold text-foreground">{line.slice(2, -2)}</p>;
        }
        if (/^\*\*.*\*\*/.test(line)) {
          const parts = line.split(/\*\*(.*?)\*\*/g);
          return (
            <p key={i}>
              {parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p)}
            </p>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          return (
            <div key={i} className="flex gap-1.5">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (line.match(/^\d+\./)) {
          return <p key={i} className="pl-2">{line}</p>;
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

// ─── Opportunity Card ──────────────────────────────────────────────────────────

interface OpportunityData {
  hook: string;
  angle: string;
  format: string;
  outline: string[];
  cta: string;
  differentiator: string;
}

function OpportunityCard({ json, onClose }: { json: string; onClose: () => void }) {
  let data: OpportunityData;
  try {
    data = JSON.parse(json) as OpportunityData;
  } catch {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary flex items-center gap-1">
          <Lightbulb className="h-3.5 w-3.5" />
          Content Opportunity
        </p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="rounded-md bg-background border border-border px-2.5 py-1.5">
          <span className="text-muted-foreground">Hook: </span>
          <span className="font-medium text-foreground">&ldquo;{data.hook}&rdquo;</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-md bg-background border border-border px-2.5 py-1.5">
            <span className="text-muted-foreground block text-[10px] uppercase tracking-wide">Angle</span>
            <span className="text-foreground">{data.angle}</span>
          </div>
          <div className="rounded-md bg-background border border-border px-2.5 py-1.5">
            <span className="text-muted-foreground block text-[10px] uppercase tracking-wide">Format</span>
            <span className="text-foreground">{data.format}</span>
          </div>
        </div>
        {data.outline && data.outline.length > 0 && (
          <div className="rounded-md bg-background border border-border px-2.5 py-1.5">
            <span className="text-muted-foreground block text-[10px] uppercase tracking-wide mb-1">Outline</span>
            {data.outline.map((pt, i) => (
              <div key={i} className="flex gap-1.5 text-foreground">
                <span className="text-muted-foreground">{i + 1}.</span>
                <span>{pt}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-md bg-background border border-border px-2.5 py-1.5">
            <span className="text-muted-foreground block text-[10px] uppercase tracking-wide">CTA</span>
            <span className="text-foreground">{data.cta}</span>
          </div>
          <div className="rounded-md bg-background border border-border px-2.5 py-1.5">
            <span className="text-muted-foreground block text-[10px] uppercase tracking-wide">Edge</span>
            <span className="text-foreground">{data.differentiator}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  isPending,
  onAnalyze,
  onOpportunity,
}: {
  post: CompetitorPost;
  isPending: boolean;
  onAnalyze: (id: string) => void;
  onOpportunity: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [opportunityJson, setOpportunityJson] = useState<string | null>(null);
  const [oppLoading, setOppLoading] = useState(false);

  async function handleOpportunity() {
    setOppLoading(true);
    const result = await generateContentOpportunity(post.id);
    setOppLoading(false);
    if (result.success) {
      setOpportunityJson(result.data.opportunity);
    }
  }

  let metrics: Record<string, number> | null = null;
  if (post.metrics) {
    try { metrics = JSON.parse(post.metrics) as Record<string, number>; } catch { /* ignore */ }
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      {/* Content */}
      <div>
        <p className={`text-sm text-foreground ${expanded ? "" : "line-clamp-3"}`}>
          {post.content}
        </p>
        {(post.content?.length ?? 0) > 180 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show more</>}
          </button>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {post.postDate && (
            <span>{new Date(post.postDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          )}
          {metrics && (
            <span className="flex items-center gap-1.5">
              {Object.entries(metrics).map(([k, v]) => (
                <span key={k}>{v.toLocaleString()} {k}</span>
              ))}
            </span>
          )}
          {post.postUrl && (
            <a
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View post
            </a>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {post.aiAnalysis ? (
            <>
              <button
                onClick={() => setShowAnalysis((v) => !v)}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                {showAnalysis ? "Hide analysis" : "Show analysis"}
              </button>
              {oppLoading ? (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground px-2 py-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                </span>
              ) : opportunityJson ? (
                <button
                  onClick={() => setOpportunityJson(null)}
                  className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] text-primary"
                >
                  <Lightbulb className="h-3 w-3" />
                  Hide opp.
                </button>
              ) : (
                <button
                  onClick={handleOpportunity}
                  className="flex items-center gap-1 rounded-md border border-primary/30 px-2 py-1 text-[11px] text-primary hover:bg-primary/5"
                >
                  <Lightbulb className="h-3 w-3" />
                  Opportunity
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => onAnalyze(post.id)}
              disabled={isPending}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Analyze
            </button>
          )}
        </div>
      </div>

      {/* Analysis */}
      {showAnalysis && post.aiAnalysis && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <SimpleMarkdown text={post.aiAnalysis} />
        </div>
      )}

      {/* Opportunity */}
      {opportunityJson && (
        <OpportunityCard json={opportunityJson} onClose={() => setOpportunityJson(null)} />
      )}
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function CompetitorDashboard() {
  const [comps, setComps] = useState<CompetitorWithPosts[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddPost, setShowAddPost] = useState(false);
  const [gapInsights, setGapInsights] = useState<string | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const result = await listCompetitors();
    if (result.success) setComps(result.data);
    setLoading(false);
  }

  const selected = comps.find((c) => c.id === selectedId) ?? null;

  // Stats
  const totalPosts = comps.reduce((sum, c) => sum + c.postCount, 0);
  const totalAnalyzed = comps.reduce(
    (sum, c) => sum + c.posts.filter((p) => p.aiAnalysis).length,
    0
  );

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await createCompetitor(fd);
      if (result.success) {
        setComps([{ ...result.data, posts: [], postCount: 0 }, ...comps]);
        setShowAdd(false);
        form.reset();
      } else if (!result.success) {
        setError(result.error ?? "Failed to add competitor");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this competitor and all tracked posts?")) return;
    startTransition(async () => {
      const result = await deleteCompetitor(id);
      if (result.success) {
        setComps(comps.filter((c) => c.id !== id));
        if (selectedId === id) setSelectedId(null);
      }
    });
  }

  function handleAddPost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const result = await addCompetitorPost(fd);
      if (result.success) {
        const refreshed = await listCompetitors();
        if (refreshed.success) setComps(refreshed.data);
        setShowAddPost(false);
        form.reset();
      } else if (!result.success) {
        setError(result.error ?? "Failed to add post");
      }
    });
  }

  function handleAnalyze(postId: string) {
    startTransition(async () => {
      await analyzeCompetitorPost(postId);
      const refreshed = await listCompetitors();
      if (refreshed.success) setComps(refreshed.data);
    });
  }

  async function handleGapAnalysis() {
    setGapLoading(true);
    setGapInsights(null);
    const result = await runGapAnalysis();
    if (result.success) setGapInsights(result.data.insights);
    setGapLoading(false);
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
          <h1 className="text-2xl font-bold text-foreground">Competitor Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track competitors, analyze content, and find gaps
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGapAnalysis}
            disabled={gapLoading || comps.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
          >
            {gapLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <BarChart3 className="h-4 w-4" />
            )}
            Gap Analysis
          </button>
          <button
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add Competitor
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {comps.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Competitors", value: comps.length, icon: <Users className="h-4 w-4" /> },
            { label: "Posts Tracked", value: totalPosts, icon: <FileText className="h-4 w-4" /> },
            { label: "Analyzed",      value: totalAnalyzed, icon: <Sparkles className="h-4 w-4" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {icon}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{value}</p>
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

      {/* Gap Analysis Results */}
      {gapInsights && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4 text-primary" />
              Gap Analysis
            </h3>
            <button
              onClick={() => setGapInsights(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <SimpleMarkdown text={gapInsights} />
        </div>
      )}

      {/* Add Competitor Form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3"
        >
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Competitor</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              name="name"
              placeholder="Competitor name *"
              required
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <select
              name="platform"
              required
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Platform *</option>
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
            <input
              name="handle"
              placeholder="@handle"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              name="url"
              placeholder="Website / profile URL"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <input
              name="niche"
              placeholder="Niche (e.g. family reunions, photo sharing)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <textarea
            name="notes"
            placeholder="Notes about this competitor..."
            rows={2}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring resize-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Competitor
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Empty state */}
      {comps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h3 className="mt-4 text-base font-medium text-foreground">No competitors tracked</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Add competitors to start tracking their content strategy
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add your first competitor
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Competitor List */}
          <div className="space-y-2">
            {comps.map((comp) => {
              const pc = PLATFORM_COLORS[comp.platform] ?? PLATFORM_COLORS.website!;
              const analyzedCount = comp.posts.filter((p) => p.aiAnalysis).length;
              return (
                <button
                  key={comp.id}
                  onClick={() => { setSelectedId(comp.id); setShowAddPost(false); }}
                  className={`w-full text-left rounded-xl border p-3 transition-all ${
                    selectedId === comp.id
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-border/80 hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{comp.name}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${pc.badge}`}>
                          {comp.platform}
                        </span>
                        {comp.handle && (
                          <span className="text-[11px] text-muted-foreground">@{comp.handle}</span>
                        )}
                      </div>
                      {comp.niche && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{comp.niche}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(comp.id); }}
                        className="rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {comp.postCount} posts · {analyzedCount} analyzed
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="rounded-xl border border-border bg-card p-4 space-y-4">

                {/* Competitor header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-sm text-muted-foreground">
                      {(() => {
                        const pc = PLATFORM_COLORS[selected.platform] ?? PLATFORM_COLORS.website!;
                        return (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${pc.badge}`}>
                            {selected.platform}
                          </span>
                        );
                      })()}
                      {selected.handle && <span>@{selected.handle}</span>}
                      {selected.niche && <span>· {selected.niche}</span>}
                      {selected.url && (
                        <a
                          href={selected.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline"
                        >
                          <Globe className="h-3 w-3" />
                          Website
                        </a>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAddPost((v) => !v)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Post
                  </button>
                </div>

                {selected.notes && (
                  <div className="rounded-lg bg-muted/50 border border-border px-3 py-2.5 text-sm text-muted-foreground">
                    {selected.notes}
                  </div>
                )}

                {/* Add Post Form */}
                {showAddPost && (
                  <form
                    onSubmit={handleAddPost}
                    className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5"
                  >
                    <p className="text-xs font-semibold text-primary uppercase tracking-wide">Add Post</p>
                    <input type="hidden" name="competitorId" value={selected.id} />
                    <input
                      name="postUrl"
                      placeholder="Post URL (optional)"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                    />
                    <textarea
                      name="content"
                      placeholder="Paste the post content here... *"
                      required
                      rows={4}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring resize-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Post date</label>
                        <input
                          name="postDate"
                          type="date"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Metrics (JSON)</label>
                        <input
                          name="metrics"
                          placeholder='{"likes": 1200, "comments": 45}'
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                        Add Post
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddPost(false)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {/* Posts */}
                <div className="space-y-3">
                  {selected.posts.length === 0 ? (
                    <div className="py-10 text-center">
                      <FileText className="mx-auto h-7 w-7 text-muted-foreground/40" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        No posts tracked yet.
                      </p>
                      <button
                        onClick={() => setShowAddPost(true)}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        Add a post manually →
                      </button>
                    </div>
                  ) : (
                    selected.posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        isPending={isPending}
                        onAnalyze={handleAnalyze}
                        onOpportunity={() => {}}
                      />
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                Select a competitor to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
