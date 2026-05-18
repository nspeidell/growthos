"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Search,
  Plus,
  TrendingUp,
  FileText,
  Sparkles,
  Trash2,
  Loader2,
  Globe,
  Target,
  Bot,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertTriangle,
  Info,
  BookOpen,
  HelpCircle,
  ArrowRight,
  ToggleLeft,
} from "lucide-react";
import {
  listKeywords,
  createKeyword,
  deleteKeyword,
  updateKeyword,
  suggestKeywords,
  createKeywordFromSuggestion,
  listPages,
  createPage,
  publishPage,
  deletePage,
  generatePageWithAI,
} from "./actions";
import type { Keyword, Page } from "@/lib/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "keywords" | "pages" | "aeo";

interface AEOSuggestion {
  dimension: string;
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
}
interface AEOResult {
  score: number;
  suggestions: AEOSuggestion[];
  extractedQuestions: string[];
  faqCandidates: Array<{ question: string; answer: string }>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const INTENT_COLORS: Record<string, string> = {
  informational: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  navigational:  "bg-purple-500/10 text-purple-600 border-purple-500/20",
  transactional: "bg-green-500/10 text-green-600 border-green-500/20",
  commercial:    "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   "bg-red-500/10 text-red-600",
  medium: "bg-amber-500/10 text-amber-600",
  low:    "bg-muted text-muted-foreground",
};

const KW_STATUS_ORDER: Keyword["status"][] = ["research", "targeting", "ranking", "archived"];
const KW_STATUS_COLORS: Record<string, string> = {
  research:  "bg-muted text-muted-foreground",
  targeting: "bg-primary/10 text-primary",
  ranking:   "bg-green-500/10 text-green-600",
  archived:  "bg-muted/40 text-muted-foreground/60",
};

const PAGE_STATUS_COLORS: Record<string, string> = {
  draft:     "bg-amber-500/10 text-amber-600",
  published: "bg-green-500/10 text-green-600",
  archived:  "bg-muted text-muted-foreground",
};

const SEVERITY_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  high:   { icon: <AlertTriangle className="w-4 h-4" />, color: "text-destructive" },
  medium: { icon: <AlertTriangle className="w-4 h-4" />, color: "text-amber-500" },
  low:    { icon: <Info className="w-4 h-4" />,          color: "text-muted-foreground" },
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function SeoDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("keywords");
  const [keywordsList, setKeywords] = useState<Keyword[]>([]);
  const [pagesList, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [kwResult, pgResult] = await Promise.all([listKeywords(), listPages()]);
      if (kwResult.success && kwResult.data) setKeywords(kwResult.data);
      if (pgResult.success && pgResult.data) setPages(pgResult.data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs = [
    { key: "keywords" as Tab, label: "Keywords",  icon: Search   },
    { key: "pages"    as Tab, label: "Pages",     icon: FileText },
    { key: "aeo"      as Tab, label: "AEO",       icon: Bot      },
  ];

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Keywords",   value: keywordsList.length,                                                      icon: <Target className="w-4 h-4" />    },
          { label: "Targeting",  value: keywordsList.filter((k) => k.status === "targeting").length,              icon: <TrendingUp className="w-4 h-4" /> },
          { label: "Pages",      value: pagesList.length,                                                         icon: <FileText className="w-4 h-4" />  },
          { label: "Published",  value: pagesList.filter((p) => p.pageStatus === "published").length,             icon: <Globe className="w-4 h-4" />     },
        ].map(({ label, value, icon }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
              {icon}
              <span className="text-xs">{label}</span>
            </div>
            <p className="text-xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-px rounded-lg border border-border overflow-hidden">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "keywords" && (
        <KeywordsTab
          keywords={keywordsList}
          setKeywords={setKeywords}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
      {activeTab === "pages" && (
        <PagesTab
          pages={pagesList}
          setPages={setPages}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
      {activeTab === "aeo" && <AEOTab pages={pagesList} />}
    </div>
  );
}

// ─── Keywords Tab ─────────────────────────────────────────────────────────────

function KeywordsTab({
  keywords: kws,
  setKeywords,
  isPending,
  startTransition,
}: {
  keywords: Keyword[];
  setKeywords: (kws: Keyword[]) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiTopic, setAiTopic] = useState("");
  const [aiResults, setAiResults] = useState<Array<{ phrase: string; intent: string; difficulty: string }>>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [addingIdx, setAddingIdx] = useState<Set<number>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  const filtered = statusFilter === "all" ? kws : kws.filter((k) => k.status === statusFilter);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createKeyword(formData);
      if (result.success && result.data) {
        setKeywords([result.data, ...kws]);
        setShowAdd(false);
        form.reset();
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this keyword?")) return;
    startTransition(async () => {
      const result = await deleteKeyword(id);
      if (result.success) setKeywords(kws.filter((k) => k.id !== id));
    });
  }

  async function handleCycleStatus(kw: Keyword) {
    const curr = KW_STATUS_ORDER.indexOf(kw.status ?? "research");
    const next = KW_STATUS_ORDER[(curr + 1) % KW_STATUS_ORDER.length]!;
    startTransition(async () => {
      const result = await updateKeyword({ id: kw.id, status: next });
      if (result.success) {
        setKeywords(kws.map((k) => (k.id === kw.id ? { ...k, status: next } : k)));
      }
    });
  }

  async function handleAiSuggest() {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    setError(null);
    const result = await suggestKeywords(aiTopic.trim());
    setAiLoading(false);
    if (result.success && result.data) setAiResults(result.data);
    else if (!result.success) setError(result.error ?? "AI suggestion failed");
  }

  async function handleAddSuggestion(idx: number) {
    const s = aiResults[idx];
    if (!s) return;
    setAddingIdx((prev) => new Set(prev).add(idx));
    const result = await createKeywordFromSuggestion(s);
    setAddingIdx((prev) => { const n = new Set(prev); n.delete(idx); return n; });
    if (result.success && result.data) {
      setKeywords([result.data, ...kws]);
      setAiResults((prev) => prev.filter((_, i) => i !== idx));
    }
  }

  async function handleAddAll() {
    const newKws: Keyword[] = [];
    for (let i = 0; i < aiResults.length; i++) {
      const s = aiResults[i];
      if (!s) continue;
      const result = await createKeywordFromSuggestion(s);
      if (result.success && result.data) {
        newKws.push(result.data);
      }
    }
    if (newKws.length > 0) setKeywords([...newKws, ...kws]);
    setAiResults([]);
  }

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          Add Keyword
        </button>
        <button
          onClick={() => setShowAi(!showAi)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
        >
          <Sparkles className="w-4 h-4" />
          AI Suggest
        </button>

        {/* Status filter */}
        <div className="ml-auto flex gap-1">
          {["all", ...KW_STATUS_ORDER].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Add Keyword</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              name="phrase"
              placeholder="Keyword phrase"
              required
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <input
              name="volume"
              type="number"
              placeholder="Search volume"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <select
              name="intent"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Intent…</option>
              <option value="informational">Informational</option>
              <option value="navigational">Navigational</option>
              <option value="transactional">Transactional</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              name="difficulty"
              type="number"
              min="0"
              max="100"
              placeholder="Difficulty (0-100)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <input
              name="cluster"
              placeholder="Topic cluster"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <select
              name="priority"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
              <option value="low">Low priority</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="submit" disabled={isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
            </button>
          </div>
        </form>
      )}

      {/* AI Suggest Panel */}
      {showAi && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
          <p className="text-xs font-semibold text-primary uppercase tracking-wide">✦ AI Keyword Research</p>
          <div className="flex gap-2">
            <input
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAiSuggest()}
              placeholder="Enter a topic (e.g. family reunion planning)"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleAiSuggest}
              disabled={aiLoading || !aiTopic.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {aiLoading ? "Researching…" : "Suggest"}
            </button>
          </div>

          {aiResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{aiResults.length} suggestions</p>
                <button
                  onClick={handleAddAll}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Add All →
                </button>
              </div>
              {aiResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-card border border-border px-3 py-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">{r.phrase}</span>
                    <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${INTENT_COLORS[r.intent] ?? "bg-muted"}`}>
                      {r.intent}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{r.difficulty} difficulty</span>
                  </div>
                  <button
                    onClick={() => handleAddSuggestion(i)}
                    disabled={addingIdx.has(i)}
                    className="ml-3 shrink-0 rounded-md border border-primary/30 p-1 text-primary hover:bg-primary/5 disabled:opacity-40"
                  >
                    {addingIdx.has(i) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Keywords Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-16 text-center">
          <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {kws.length === 0 ? "No keywords tracked yet" : "No keywords match this filter"}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Keyword</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Volume</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden md:table-cell">Difficulty</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden sm:table-cell">Intent</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground hidden lg:table-cell">Rank</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {filtered.map((kw) => (
                <tr key={kw.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{kw.phrase}</span>
                    {kw.cluster && (
                      <span className="ml-2 text-xs text-muted-foreground">{kw.cluster}</span>
                    )}
                    {kw.priority === "high" && (
                      <span className={`ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS.high}`}>
                        high
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {kw.volume?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {kw.difficulty != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${kw.difficulty < 30 ? "bg-green-500" : kw.difficulty < 60 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${kw.difficulty}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{kw.difficulty}</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {kw.intent ? (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${INTENT_COLORS[kw.intent] ?? "bg-muted"}`}>
                        {kw.intent}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleCycleStatus(kw)}
                      disabled={isPending}
                      title="Click to advance status"
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize cursor-pointer hover:opacity-80 ${KW_STATUS_COLORS[kw.status ?? "research"]}`}
                    >
                      {kw.status ?? "research"}
                      <ToggleLeft className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {kw.currentRank ? (
                      <span className="font-medium text-foreground">#{kw.currentRank}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(kw.id)}
                      disabled={isPending}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Pages Tab ────────────────────────────────────────────────────────────────

function PagesTab({
  pages: pgs,
  setPages,
  isPending,
  startTransition,
}: {
  pages: Page[];
  setPages: (pgs: Page[]) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiFields, setAiFields] = useState<{
    title: string; metaTitle: string; metaDesc: string; h1: string; body: string; schemaType: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    startTransition(async () => {
      const result = await createPage(fd);
      if (result.success && result.data) {
        setPages([result.data, ...pgs]);
        setShowAdd(false);
        setAiFields(null);
        setAiTopic("");
        form.reset();
      } else if (!result.success) {
        setError(result.error ?? "Failed to create page");
      }
    });
  }

  async function handlePublish(id: string) {
    startTransition(async () => {
      const result = await publishPage(id);
      if (result.success) {
        setPages(pgs.map((p) => p.id === id ? { ...p, pageStatus: "published" } : p));
      }
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this page?")) return;
    startTransition(async () => {
      const result = await deletePage(id);
      if (result.success) setPages(pgs.filter((p) => p.id !== id));
    });
  }

  async function handleAIGenerate() {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setError(null);
    const result = await generatePageWithAI(aiTopic.trim());
    setAiGenerating(false);
    if (result.success && result.data) setAiFields(result.data);
    else if (!result.success) setError(result.error ?? "AI generation failed");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">SEO Pages</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          New Page
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showAdd && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h3 className="text-base font-semibold text-foreground">Create Page</h3>

          {/* AI Generate */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <p className="text-xs font-medium text-primary">✦ AI Generate</p>
            <div className="flex gap-2">
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAIGenerate()}
                placeholder="e.g. family reunion planning tips"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={handleAIGenerate}
                disabled={aiGenerating || !aiTopic.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {aiGenerating ? "Generating…" : "Generate"}
              </button>
            </div>
            {aiFields && <p className="text-xs text-primary">✓ Fields filled — review and save</p>}
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Title *</label>
                <input
                  key={aiFields?.title}
                  name="title"
                  required
                  defaultValue={aiFields?.title ?? ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="How to Plan a Family Reunion"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">URL Slug *</label>
                <input
                  name="slug"
                  required
                  pattern="[a-z0-9-]+"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="how-to-plan-family-reunion"
                />
                <p className="mt-0.5 text-[10px] text-muted-foreground">Lowercase, hyphens only</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Meta Title</label>
                <input
                  key={aiFields?.metaTitle}
                  name="metaTitle"
                  maxLength={60}
                  defaultValue={aiFields?.metaTitle ?? ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Max 60 chars"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">H1</label>
                <input
                  key={aiFields?.h1}
                  name="h1"
                  defaultValue={aiFields?.h1 ?? ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="H1 heading"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-foreground mb-1">Meta Description</label>
                <input
                  key={aiFields?.metaDesc}
                  name="metaDesc"
                  maxLength={155}
                  defaultValue={aiFields?.metaDesc ?? ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Max 155 chars"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Schema Type</label>
                <select
                  key={aiFields?.schemaType}
                  name="schemaType"
                  defaultValue={aiFields?.schemaType ?? ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="">None</option>
                  <option value="Article">Article</option>
                  <option value="FAQPage">FAQ Page</option>
                  <option value="HowTo">How To</option>
                  <option value="Product">Product</option>
                  <option value="Organization">Organization</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Body (HTML)</label>
              <textarea
                key={aiFields?.body}
                name="body"
                rows={6}
                defaultValue={aiFields?.body ?? ""}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="<p>Page content...</p>"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create Page
              </button>
            </div>
          </form>
        </div>
      )}

      {pgs.length === 0 && !showAdd ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-16 text-center">
          <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No pages yet</p>
          <button onClick={() => setShowAdd(true)} className="mt-2 text-sm text-primary">
            Create your first SEO page
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {pgs.map((pg) => {
            const isExpanded = expandedId === pg.id;
            return (
              <div key={pg.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-start justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${PAGE_STATUS_COLORS[pg.pageStatus] ?? "bg-muted"}`}>
                        {pg.pageStatus}
                      </span>
                      {pg.schemaType && (
                        <span className="inline-flex items-center rounded-full bg-indigo-500/10 text-indigo-600 px-2 py-0.5 text-[10px] font-medium">
                          {pg.schemaType}
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-foreground">{pg.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">/{pg.slug}</p>
                    {pg.metaDesc && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{pg.metaDesc}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    {pg.pageStatus !== "published" && (
                      <button
                        onClick={() => handlePublish(pg.id)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-green-500/30 px-2.5 py-1.5 text-xs font-medium text-green-600 hover:bg-green-500/10 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Publish
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : pg.id)}
                      className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(pg.id)}
                      disabled={isPending}
                      className="rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-3">
                    {pg.metaTitle && (
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Meta Title</p>
                        <p className="text-sm text-foreground">{pg.metaTitle}</p>
                      </div>
                    )}
                    {pg.h1 && (
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">H1</p>
                        <p className="text-sm text-foreground">{pg.h1}</p>
                      </div>
                    )}
                    {pg.schemaJson && (
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Schema JSON-LD</p>
                        <pre className="rounded-lg bg-card border border-border p-3 text-[10px] text-muted-foreground overflow-x-auto">
                          {JSON.stringify(JSON.parse(pg.schemaJson), null, 2)}
                        </pre>
                      </div>
                    )}
                    {pg.body && (
                      <div>
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">Body Preview</p>
                        <div
                          className="prose prose-sm max-w-none text-muted-foreground text-xs line-clamp-6"
                          dangerouslySetInnerHTML={{ __html: pg.body }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── AEO Tab ──────────────────────────────────────────────────────────────────

function AEOTab({ pages }: { pages: Page[] }) {
  const [selectedPageId, setSelectedPageId] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AEOResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("");
  const [mode, setMode] = useState<"page" | "text">("page");

  async function handleAnalyze() {
    setError(null);
    setResult(null);
    setAnalyzing(true);

    try {
      let body: Record<string, string>;
      if (mode === "page") {
        if (!selectedPageId) { setError("Select a page first"); setAnalyzing(false); return; }
        body = { pageId: selectedPageId };
      } else {
        if (!textInput.trim()) { setError("Enter some content first"); setAnalyzing(false); return; }
        body = { rawText: textInput };
      }

      const res = await fetch("/api/seo/aeo-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success: boolean; data?: AEOResult; error?: string };
      if (data.success && data.data) {
        setResult(data.data);
      } else {
        setError(data.error ?? "Analysis failed");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setAnalyzing(false);
    }
  }

  const scoreColor =
    !result ? "" :
    result.score >= 75 ? "text-green-600" :
    result.score >= 50 ? "text-amber-600" :
    "text-destructive";

  return (
    <div className="space-y-5">
      {/* Explainer */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-start gap-3">
          <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-foreground">Answer Engine Optimization (AEO)</p>
            <p className="text-xs text-muted-foreground mt-1">
              AEO scores your content for discoverability in AI-generated answers — ChatGPT, Perplexity, Google AI Overviews, and Bing Copilot. Higher scores mean more citations.
            </p>
          </div>
        </div>
      </div>

      {/* Input mode toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => setMode("page")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${mode === "page" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
        >
          <FileText className="w-4 h-4" />
          Analyze Page
        </button>
        <button
          onClick={() => setMode("text")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${mode === "text" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
        >
          <BookOpen className="w-4 h-4" />
          Analyze Text
        </button>
      </div>

      {/* Input */}
      {mode === "page" ? (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Select a page</label>
          {pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pages yet — create one in the Pages tab first.</p>
          ) : (
            <select
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Choose a page…</option>
              {pages.map((p) => (
                <option key={p.id} value={p.id}>{p.title} (/{p.slug})</option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Paste your content</label>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            rows={6}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            placeholder="Paste a blog post, landing page, or any text to analyze…"
          />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={analyzing || (mode === "page" && !selectedPageId) || (mode === "text" && !textInput.trim())}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
        {analyzing ? "Analyzing…" : "Run AEO Analysis"}
      </button>

      {/* Results */}
      {result && (
        <div className="space-y-5">
          {/* Score */}
          <div className="rounded-xl border border-border bg-card p-5 flex items-center gap-6">
            <div className="text-center">
              <p className={`text-5xl font-bold ${scoreColor}`}>{result.score}</p>
              <p className="text-xs text-muted-foreground mt-1">AEO Score</p>
            </div>
            <div className="flex-1">
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${result.score >= 75 ? "bg-green-500" : result.score >= 50 ? "bg-amber-500" : "bg-destructive"}`}
                  style={{ width: `${result.score}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {result.score >= 75 ? "Strong — this content is likely to be cited by AI answer engines." :
                 result.score >= 50 ? "Moderate — several improvements can increase citation likelihood." :
                 "Weak — significant work needed to improve AI discoverability."}
              </p>
            </div>
          </div>

          {/* Suggestions */}
          {result.suggestions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Recommendations</h3>
              <div className="space-y-2">
                {result.suggestions.map((s, i) => {
                  const cfg = SEVERITY_CONFIG[s.severity] ?? SEVERITY_CONFIG.low!;
                  return (
                    <div key={i} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 shrink-0 ${cfg.color}`}>{cfg.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-medium text-foreground">{s.title}</p>
                            <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-2 py-0.5">{s.dimension}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{s.description}</p>
                          <div className="mt-2 flex items-start gap-1.5 text-xs text-primary">
                            <ArrowRight className="w-3 h-3 mt-0.5 shrink-0" />
                            <span>{s.action}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Extracted Questions */}
          {result.extractedQuestions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Questions This Content Answers</h3>
              <div className="rounded-xl border border-border bg-card divide-y divide-border">
                {result.extractedQuestions.map((q, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-4 py-2.5">
                    <HelpCircle className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-foreground">{q}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FAQ Candidates */}
          {result.faqCandidates.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">FAQ Schema Candidates</h3>
              <p className="text-xs text-muted-foreground mb-3">Add these Q&amp;As to your page with FAQPage schema to directly answer AI queries.</p>
              <div className="space-y-2">
                {result.faqCandidates.map((faq, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-4">
                    <p className="text-sm font-medium text-foreground mb-1">{faq.question}</p>
                    <p className="text-xs text-muted-foreground">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
