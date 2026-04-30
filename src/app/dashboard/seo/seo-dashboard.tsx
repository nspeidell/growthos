"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Search,
  Plus,
  TrendingUp,
  TrendingDown,
  FileText,
  Sparkles,
  Trash2,
  Loader2,
  ArrowUpDown,
  Globe,
  Target,
} from "lucide-react";
import {
  listKeywords,
  createKeyword,
  deleteKeyword,
  suggestKeywords,
  listPages,
  createPage,
} from "./actions";
import type { Keyword, Page } from "@/lib/db/schema";

type Tab = "keywords" | "pages";

const INTENT_COLORS: Record<string, string> = {
  informational: "bg-blue-100 text-blue-800",
  navigational: "bg-purple-100 text-purple-800",
  transactional: "bg-green-100 text-green-800",
  commercial: "bg-amber-100 text-amber-800",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-neutral-100 text-neutral-600",
};

export default function SeoDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("keywords");
  const [keywordsList, setKeywords] = useState<Keyword[]>([]);
  const [pagesList, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddKeyword, setShowAddKeyword] = useState(false);
  const [showAddPage, setShowAddPage] = useState(false);
  const [showAiSuggest, setShowAiSuggest] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [kwResult, pgResult] = await Promise.all([
        listKeywords(),
        listPages(),
      ]);
      if (kwResult.success) setKeywords(kwResult.data);
      if (pgResult.success) setPages(pgResult.data);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">SEO & AEO</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Keywords, pages, schema markup, and AI answer optimization
          </p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Keywords"
          value={keywordsList.length}
          icon={<Target className="w-4 h-4" />}
        />
        <StatCard
          label="Targeting"
          value={keywordsList.filter((k) => k.status === "targeting").length}
          icon={<TrendingUp className="w-4 h-4" />}
        />
        <StatCard
          label="Pages"
          value={pagesList.length}
          icon={<FileText className="w-4 h-4" />}
        />
        <StatCard
          label="Published"
          value={pagesList.filter((p) => p.pageStatus === "published").length}
          icon={<Globe className="w-4 h-4" />}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {(
          [
            { key: "keywords", label: "Keywords", icon: Search },
            { key: "pages", label: "Pages", icon: FileText },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-600 hover:text-neutral-900"
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
          showAdd={showAddKeyword}
          setShowAdd={setShowAddKeyword}
          showAi={showAiSuggest}
          setShowAi={setShowAiSuggest}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
      {activeTab === "pages" && (
        <PagesTab
          pages={pagesList}
          setPages={setPages}
          showAdd={showAddPage}
          setShowAdd={setShowAddPage}
          isPending={isPending}
          startTransition={startTransition}
        />
      )}
    </div>
  );
}

// ─── Stat Card ───

function StatCard({
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
      <p className="text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}

// ─── Keywords Tab ───

function KeywordsTab({
  keywords: kws,
  setKeywords,
  showAdd,
  setShowAdd,
  showAi,
  setShowAi,
  isPending,
  startTransition,
}: {
  keywords: Keyword[];
  setKeywords: (kws: Keyword[]) => void;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  showAi: boolean;
  setShowAi: (v: boolean) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [aiTopic, setAiTopic] = useState("");
  const [aiResults, setAiResults] = useState<
    Array<{ phrase: string; intent: string; difficulty: string }>
  >([]);
  const [aiLoading, setAiLoading] = useState(false);

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createKeyword(formData);
      if (result.success) {
        setKeywords([result.data, ...kws]);
        setShowAdd(false);
        form.reset();
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteKeyword(id);
      if (result.success) {
        setKeywords(kws.filter((k) => k.id !== id));
      }
    });
  };

  const handleAiSuggest = async () => {
    if (!aiTopic.trim()) return;
    setAiLoading(true);
    const result = await suggestKeywords(aiTopic);
    if (result.success) {
      setAiResults(result.data);
    }
    setAiLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
        >
          <Plus className="w-4 h-4" />
          Add Keyword
        </button>
        <button
          onClick={() => setShowAi(!showAi)}
          className="flex items-center gap-1 px-3 py-2 text-sm font-medium border border-brand-300 text-brand-700 rounded-lg hover:bg-brand-50"
        >
          <Sparkles className="w-4 h-4" />
          AI Suggest
        </button>
      </div>

      {/* Add Keyword Form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              name="phrase"
              placeholder="Keyword phrase"
              required
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="volume"
              type="number"
              placeholder="Search volume"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              name="intent"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Intent...</option>
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
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="cluster"
              placeholder="Topic cluster"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              name="priority"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
              <option value="low">Low priority</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? "Adding..." : "Add Keyword"}
          </button>
        </form>
      )}

      {/* AI Suggest Panel */}
      {showAi && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={aiTopic}
              onChange={(e) => setAiTopic(e.target.value)}
              placeholder="Enter a topic to get AI keyword suggestions..."
              className="flex-1 rounded-lg border border-purple-300 px-3 py-2 text-sm bg-white"
            />
            <button
              onClick={handleAiSuggest}
              disabled={aiLoading}
              className="px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Suggest
            </button>
          </div>
          {aiResults.length > 0 && (
            <div className="space-y-1">
              {aiResults.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white rounded-md px-3 py-2 text-sm"
                >
                  <span className="font-medium">{r.phrase}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        INTENT_COLORS[r.intent] ?? "bg-neutral-100"
                      }`}
                    >
                      {r.intent}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {r.difficulty} difficulty
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Keywords Table */}
      {kws.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900">
            No keywords tracked yet
          </h3>
          <p className="text-sm text-neutral-500 mt-1">
            Add keywords manually or use AI suggestions
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">
                  Keyword
                </th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden md:table-cell">
                  Volume
                </th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden md:table-cell">
                  Difficulty
                </th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden sm:table-cell">
                  Intent
                </th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600">
                  Priority
                </th>
                <th className="text-left px-4 py-3 font-medium text-neutral-600 hidden lg:table-cell">
                  Rank
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-neutral-100">
              {kws.map((kw) => (
                <tr key={kw.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {kw.phrase}
                    {kw.cluster && (
                      <span className="ml-2 text-xs text-neutral-400">
                        {kw.cluster}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 hidden md:table-cell">
                    {kw.volume?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {kw.difficulty != null ? (
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              kw.difficulty < 30
                                ? "bg-green-500"
                                : kw.difficulty < 60
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${kw.difficulty}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-500">
                          {kw.difficulty}
                        </span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    {kw.intent ? (
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          INTENT_COLORS[kw.intent] ?? "bg-neutral-100"
                        }`}
                      >
                        {kw.intent}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        PRIORITY_COLORS[kw.priority] ?? "bg-neutral-100"
                      }`}
                    >
                      {kw.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {kw.currentRank ? (
                      <span className="flex items-center gap-1 text-sm font-medium">
                        #{kw.currentRank}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(kw.id)}
                      disabled={isPending}
                      className="text-neutral-400 hover:text-red-500"
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

// ─── Pages Tab ───

function PagesTab({
  pages: pgs,
  setPages,
  showAdd,
  setShowAdd,
  isPending,
  startTransition,
}: {
  pages: Page[];
  setPages: (pgs: Page[]) => void;
  showAdd: boolean;
  setShowAdd: (v: boolean) => void;
  isPending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createPage(formData);
      if (result.success) {
        setPages([result.data, ...pgs]);
        setShowAdd(false);
        form.reset();
      }
    });
  };

  const STATUS_BADGE: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-800",
    published: "bg-green-100 text-green-800",
    archived: "bg-neutral-100 text-neutral-600",
  };

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowAdd(!showAdd)}
        className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
      >
        <Plus className="w-4 h-4" />
        New Page
      </button>

      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              name="title"
              placeholder="Page title"
              required
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="slug"
              placeholder="URL slug (e.g. about-us)"
              required
              pattern="[a-z0-9-]+"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              name="metaTitle"
              placeholder="Meta title (max 60 chars)"
              maxLength={60}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="metaDesc"
              placeholder="Meta description (max 155 chars)"
              maxLength={155}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <select
            name="schemaType"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="">Schema type (optional)...</option>
            <option value="Article">Article</option>
            <option value="FAQPage">FAQ Page</option>
            <option value="HowTo">How To</option>
            <option value="Product">Product</option>
            <option value="Organization">Organization</option>
          </select>
          <textarea
            name="body"
            placeholder="Page body (HTML)"
            rows={4}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Create Page"}
          </button>
        </form>
      )}

      {pgs.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900">No pages yet</h3>
          <p className="text-sm text-neutral-500 mt-1">
            Create SEO-optimized pages with schema markup
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pgs.map((pg) => (
            <div
              key={pg.id}
              className="rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-neutral-900">{pg.title}</h3>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        STATUS_BADGE[pg.pageStatus] ?? "bg-neutral-100"
                      }`}
                    >
                      {pg.pageStatus}
                    </span>
                    {pg.schemaType && (
                      <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-800">
                        {pg.schemaType}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">/{pg.slug}</p>
                  {pg.metaDesc && (
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-1">
                      {pg.metaDesc}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
