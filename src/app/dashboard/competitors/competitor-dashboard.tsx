"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Eye,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  TrendingUp,
  ExternalLink,
  Users,
  BarChart3,
} from "lucide-react";
import {
  listCompetitors,
  createCompetitor,
  deleteCompetitor,
  addCompetitorPost,
  analyzeCompetitorPost,
  runGapAnalysis,
  type CompetitorWithPosts,
} from "./actions";

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

export default function CompetitorDashboard() {
  const [comps, setComps] = useState<CompetitorWithPosts[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedComp, setSelectedComp] = useState<string | null>(null);
  const [showAddPost, setShowAddPost] = useState(false);
  const [gapInsights, setGapInsights] = useState<string | null>(null);
  const [gapLoading, setGapLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function load() {
      setLoading(true);
      const result = await listCompetitors();
      if (result.success) setComps(result.data);
      setLoading(false);
    }
    load();
  }, []);

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createCompetitor(formData);
      if (result.success) {
        setComps([{ ...result.data, posts: [], postCount: 0 }, ...comps]);
        setShowAdd(false);
        form.reset();
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteCompetitor(id);
      if (result.success) {
        setComps(comps.filter((c) => c.id !== id));
        if (selectedComp === id) setSelectedComp(null);
      }
    });
  };

  const handleAddPost = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await addCompetitorPost(formData);
      if (result.success) {
        // Refresh the competitor list
        const refreshed = await listCompetitors();
        if (refreshed.success) setComps(refreshed.data);
        setShowAddPost(false);
        form.reset();
      }
    });
  };

  const handleAnalyze = (postId: string) => {
    startTransition(async () => {
      await analyzeCompetitorPost(postId);
      const refreshed = await listCompetitors();
      if (refreshed.success) setComps(refreshed.data);
    });
  };

  const handleGapAnalysis = async () => {
    setGapLoading(true);
    const result = await runGapAnalysis();
    if (result.success) {
      setGapInsights(result.data.insights);
    }
    setGapLoading(false);
  };

  const selected = comps.find((c) => c.id === selectedComp);

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
          <h1 className="text-2xl font-bold text-neutral-900">
            Competitor Intelligence
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Track competitors, analyze content, and find gaps
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGapAnalysis}
            disabled={gapLoading || comps.length === 0}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-50"
          >
            {gapLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <BarChart3 className="w-4 h-4" />
            )}
            Gap Analysis
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            <Plus className="w-4 h-4" />
            Add Competitor
          </button>
        </div>
      </div>

      {/* Gap Analysis Results */}
      {gapInsights && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-1">
              <BarChart3 className="w-4 h-4" />
              Gap Analysis
            </h3>
            <button
              onClick={() => setGapInsights(null)}
              className="text-purple-500 hover:text-purple-700 text-xs"
            >
              Dismiss
            </button>
          </div>
          <div className="text-sm text-purple-800 whitespace-pre-wrap">
            {gapInsights}
          </div>
        </div>
      )}

      {/* Add Competitor Form */}
      {showAdd && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              name="name"
              placeholder="Competitor name"
              required
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              name="platform"
              required
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">Platform...</option>
              {PLATFORM_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
            <input
              name="handle"
              placeholder="@handle"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              name="url"
              placeholder="Website URL"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <input
              name="niche"
              placeholder="Niche (e.g. family app, photo sharing)"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <textarea
            name="notes"
            placeholder="Notes about this competitor..."
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {isPending ? "Adding..." : "Add Competitor"}
          </button>
        </form>
      )}

      {/* Competitor List + Detail */}
      {comps.length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-900">
            No competitors tracked
          </h3>
          <p className="text-sm text-neutral-500 mt-1">
            Add competitors to start tracking their content strategy
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Competitor List */}
          <div className="space-y-2">
            {comps.map((comp) => (
              <button
                key={comp.id}
                onClick={() => setSelectedComp(comp.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  selectedComp === comp.id
                    ? "border-brand-300 bg-brand-50"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">
                      {comp.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {comp.platform}
                      {comp.handle ? ` · @${comp.handle}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400">
                      {comp.postCount} posts
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(comp.id);
                      }}
                      className="text-neutral-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Detail Panel */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">
                      {selected.name}
                    </h2>
                    <p className="text-sm text-neutral-500">
                      {selected.platform}
                      {selected.handle ? ` · @${selected.handle}` : ""}
                      {selected.niche ? ` · ${selected.niche}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddPost(!showAddPost)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700"
                  >
                    <Plus className="w-3 h-3" />
                    Add Post
                  </button>
                </div>

                {selected.notes && (
                  <p className="text-sm text-neutral-600 bg-neutral-50 rounded-md p-3">
                    {selected.notes}
                  </p>
                )}

                {/* Add Post Form */}
                {showAddPost && (
                  <form
                    onSubmit={handleAddPost}
                    className="border border-neutral-200 rounded-lg p-3 space-y-2"
                  >
                    <input type="hidden" name="competitorId" value={selected.id} />
                    <input
                      name="postUrl"
                      placeholder="Post URL"
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                    <textarea
                      name="content"
                      placeholder="Paste the post content here..."
                      required
                      rows={3}
                      className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        name="postDate"
                        type="date"
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={isPending}
                        className="px-3 py-2 text-sm font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                      >
                        {isPending ? "Adding..." : "Add Post"}
                      </button>
                    </div>
                  </form>
                )}

                {/* Posts List */}
                <div className="space-y-3">
                  {selected.posts.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-8">
                      No posts tracked yet. Add a post manually or wait for the
                      auto-scanner.
                    </p>
                  ) : (
                    selected.posts.map((post) => (
                      <div
                        key={post.id}
                        className="border border-neutral-100 rounded-lg p-3"
                      >
                        <p className="text-sm text-neutral-800 line-clamp-3">
                          {post.content}
                        </p>

                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            {post.postDate && (
                              <span>
                                {new Date(post.postDate).toLocaleDateString()}
                              </span>
                            )}
                            {post.postUrl && (
                              <a
                                href={post.postUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand-600 hover:text-brand-700 flex items-center gap-0.5"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View
                              </a>
                            )}
                          </div>

                          {!post.aiAnalysis ? (
                            <button
                              onClick={() => handleAnalyze(post.id)}
                              disabled={isPending}
                              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-700 border border-purple-200 rounded hover:bg-purple-50 disabled:opacity-50"
                            >
                              <Sparkles className="w-3 h-3" />
                              Analyze
                            </button>
                          ) : (
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              Analyzed
                            </span>
                          )}
                        </div>

                        {post.aiAnalysis && (
                          <div className="mt-2 text-xs text-neutral-700 bg-neutral-50 rounded p-2 whitespace-pre-wrap">
                            {post.aiAnalysis}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-neutral-400 text-sm">
                Select a competitor to view details
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
