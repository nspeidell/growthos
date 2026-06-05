"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  MessagesSquare,
  Plus,
  Trash2,
  Send,
  Users,
  Loader2,
  Clock,
  CheckCircle2,
  BarChart3,
  AlertCircle,
  ExternalLink,
  Zap,
  Copy,
  Check,
  RefreshCw,
  Repeat2,
  MessageSquare,
  Sparkles,
  Power,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  listCommunities,
  createCommunity,
  createCommunityPost,
  publishCommunityPost,
  deleteCommunity,
  listConnectedAccountsByPlatform,
  debugFacebookCommunity,
  type CommunityWithStats,
  type ConnectedAccountSummary,
} from "./actions";
import {
  listCommunityCampaigns,
  createCommunityCampaign,
  toggleCampaign,
  deleteCampaign,
  generatePostsNow,
  generateCommentSuggestions,
  adaptPostForPlatform,
  getRepostSuggestions,
} from "./campaign-actions";
import type { CommunityCampaign, CommunityPost } from "@/lib/db/schema";

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  facebook: { label: "Facebook Group", color: "bg-blue-600" },
  reddit: { label: "Reddit", color: "bg-orange-500" },
  discord: { label: "Discord", color: "bg-indigo-600" },
  slack: { label: "Slack", color: "bg-purple-600" },
};

const POST_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  image: "Image",
  link: "Link",
  poll: "Poll",
  video: "Video",
};

export default function CommunitiesDashboard() {
  const [communities, setCommunities] = useState<CommunityWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"communities" | "create" | "autopost">("communities");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  // Campaign state
  const [campaigns, setCampaigns] = useState<CommunityCampaign[]>([]);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignCommunityId, setCampaignCommunityId] = useState<string>("");
  const [generatingPost, setGeneratingPost] = useState<string | null>(null);
  const [commentPost, setCommentPost] = useState<string | null>(null);
  const [commentContext, setCommentContext] = useState("");
  const [commentSuggestions, setCommentSuggestions] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [adaptingPost, setAdaptingPost] = useState<string | null>(null);
  const [adaptedContent, setAdaptedContent] = useState<{ title?: string; body: string } | null>(null);
  const [repostSuggestions, setRepostSuggestions] = useState<CommunityPost[]>([]);
  // Create form state
  const [createPlatform, setCreatePlatform] = useState("facebook");
  const [fbAccounts, setFbAccounts] = useState<ConnectedAccountSummary[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (createPlatform === "facebook") {
      setLoadingAccounts(true);
      listConnectedAccountsByPlatform("facebook").then((result) => {
        if (result.success && result.data) setFbAccounts(result.data);
        setLoadingAccounts(false);
      });
    } else {
      setFbAccounts([]);
    }
  }, [createPlatform]);

  async function load() {
    setLoading(true);
    const result = await listCommunities();
    if (result.success && result.data) setCommunities(result.data);
    setLoading(false);
  }

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCommunity(formData);
      if (result.success) {
        setActiveTab("communities");
        await load();
      } else {
        setError(result.error ?? "Failed to create community");
      }
    });
  }

  function handleCreatePost(formData: FormData) {
    startTransition(async () => {
      const result = await createCommunityPost(formData);
      if (result.success) {
        setShowPostForm(false);
        await load();
      }
    });
  }

  function handlePublish(postId: string) {
    setPublishError(null);
    startTransition(async () => {
      const result = await publishCommunityPost(postId);
      if (!result.success) {
        setPublishError(result.error ?? "Failed to publish");
      }
      await load();
    });
  }

  // Campaign handlers
  const loadCampaigns = useCallback(async () => {
    const res = await listCommunityCampaigns();
    if (res.success) setCampaigns(res.data);
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  function handleCreateCampaign(formData: FormData) {
    startTransition(async () => {
      const res = await createCommunityCampaign(formData);
      if (res.success) {
        setShowCampaignForm(false);
        await loadCampaigns();
      }
    });
  }

  function handleGenerateNow(campaignId: string) {
    setGeneratingPost(campaignId);
    startTransition(async () => {
      await generatePostsNow(campaignId);
      await load();
      setGeneratingPost(null);
    });
  }

  async function handleCopy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* ignore */ }
  }

  function handleGetCommentSuggestions(postId: string) {
    setCommentPost(postId);
    setCommentSuggestions([]);
    setCommentContext("");
  }

  function handleFetchSuggestions() {
    if (!commentPost) return;
    startTransition(async () => {
      const res = await generateCommentSuggestions(commentPost, commentContext);
      if (res.success) setCommentSuggestions(res.data);
    });
  }

  function handleAdaptPost(postId: string) {
    setAdaptingPost(postId);
    setAdaptedContent(null);
  }

  function handleAdaptForPlatform(postId: string, platform: "facebook" | "reddit" | "instagram" | "twitter") {
    startTransition(async () => {
      const res = await adaptPostForPlatform(postId, platform);
      if (res.success) setAdaptedContent(res.data);
    });
  }

  function handleLoadRepostSuggestions(communityId: string) {
    startTransition(async () => {
      const res = await getRepostSuggestions(communityId);
      if (res.success) setRepostSuggestions(res.data);
    });
  }

  function handleDebug(communityId: string) {
    setDebugInfo("Loading…");
    startTransition(async () => {
      const result = await debugFacebookCommunity(communityId);
      if (result.success) {
        setDebugInfo(JSON.stringify(result.data, null, 2));
      } else {
        setDebugInfo(`Error: ${result.error}`);
      }
    });
  }

  function handleDelete(communityId: string) {
    if (!confirm("Delete this community? All posts will be lost.")) return;
    startTransition(async () => {
      const result = await deleteCommunity(communityId);
      if (result.success) {
        if (selectedId === communityId) setSelectedId(null);
        await load();
      }
    });
  }

  const selected = communities.find((c) => c.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setActiveTab("communities")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "communities"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Communities
        </button>
        <button
          onClick={() => setActiveTab("create")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === "create"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Plus className="w-4 h-4" />
          Add Community
        </button>
        <button
          onClick={() => setActiveTab("autopost")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === "autopost"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="w-4 h-4" />
          Auto-Post
          {campaigns.filter(c => c.isActive).length > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
              {campaigns.filter(c => c.isActive).length}
            </span>
          )}
        </button>
      </div>

      {/* Create Form */}
      {activeTab === "create" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Add Community
          </h3>
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <form action={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Community Name
                </label>
                <input
                  name="name"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Reunion Families"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Platform
                </label>
                <select
                  name="platform"
                  required
                  value={createPlatform}
                  onChange={(e) => setCreatePlatform(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="facebook">Facebook Group</option>
                  <option value="discord">Discord Server</option>
                  <option value="reddit">Reddit Community</option>
                  <option value="slack">Slack</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {createPlatform === "facebook" ? "Facebook Group ID" : createPlatform === "reddit" ? "Subreddit name (e.g. r/family)" : "Platform ID"}
                </label>
                <input
                  name="platformId"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder={createPlatform === "facebook" ? "e.g. 123456789012345" : createPlatform === "reddit" ? "family" : "ID or handle"}
                />
                {createPlatform === "facebook" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Find in your group URL: facebook.com/groups/<strong>123456789</strong>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Description
                </label>
                <input
                  name="description"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Brief description"
                />
              </div>

              {/* Facebook account picker */}
              {createPlatform === "facebook" && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Connected Facebook Account (for publishing)
                  </label>
                  {loadingAccounts ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts…
                    </div>
                  ) : fbAccounts.length === 0 ? (
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                      <AlertCircle className="inline w-4 h-4 mr-1" />
                      No active Facebook account connected.{" "}
                      <a href="/dashboard/publisher" className="underline">
                        Connect one in Publisher
                      </a>{" "}
                      to enable posting. You can still add the community now.
                    </div>
                  ) : (
                    <select
                      name="connectedAccountId"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      <option value="">— Select account (optional) —</option>
                      {fbAccounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.platformUsername ?? acc.platformAccountId}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Reddit notice */}
              {createPlatform === "reddit" && (
                <div className="md:col-span-2">
                  <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900/30 p-3 text-sm text-orange-700 dark:text-orange-400">
                    <AlertCircle className="inline w-4 h-4 mr-1" />
                    Reddit posts are created here as drafts for reference. Per your content strategy, Reddit posts should be submitted manually to preserve authenticity and avoid detection as brand marketing.
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Community
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Community List + Detail */}
      {activeTab === "communities" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* List */}
          <div className="lg:col-span-1 space-y-3">
            {communities.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-12 text-center">
                <MessagesSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  No communities yet
                </p>
                <button
                  onClick={() => setActiveTab("create")}
                  className="mt-2 text-sm text-primary hover:text-primary/80"
                >
                  Add your first community
                </button>
              </div>
            ) : (
              communities.map((comm) => {
                const platform = PLATFORM_META[comm.platform] ?? {
                  label: comm.platform,
                  color: "bg-gray-500",
                };
                return (
                  <button
                    key={comm.id}
                    onClick={() => setSelectedId(comm.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      selectedId === comm.id
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-2.5 w-2.5 rounded-full ${platform.color}`} />
                      <span className="text-xs text-muted-foreground">
                        {platform.label}
                      </span>
                    </div>
                    <p className="font-medium text-foreground">{comm.name}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {(comm.memberCount ?? 0).toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="w-3 h-3" />
                        {comm.recentEngagement} engagements
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Detail */}
          <div className="lg:col-span-2">
            {!selected ? (
              <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-16 text-center">
                <MessagesSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Select a community to manage
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Publish error banner */}
                {publishError && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{publishError}</span>
                  </div>
                )}

                {/* Debug output */}
                {debugInfo && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-yellow-400">Facebook Debug Output</span>
                      <button onClick={() => setDebugInfo(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                    </div>
                    <pre className="text-xs text-foreground whitespace-pre-wrap font-mono overflow-x-auto">{debugInfo}</pre>
                  </div>
                )}

                {/* Header */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {selected.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {selected.description || "No description"}
                      </p>
                    </div>
                    {selected.platform === "facebook" && (
                      <button
                        onClick={() => handleDebug(selected.id)}
                        disabled={isPending}
                        className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
                        title="Debug Facebook config"
                      >
                        Debug
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(selected.id)}
                      disabled={isPending}
                      className="rounded-lg border border-destructive/20 p-2 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
                    <div>
                      <p className="text-xs text-muted-foreground">Members</p>
                      <p className="text-lg font-bold text-foreground">
                        {(selected.memberCount ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Posts</p>
                      <p className="text-lg font-bold text-foreground">
                        {selected.postCount ?? selected.posts.length}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Post Form */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-semibold text-foreground">Posts</h4>
                    <button
                      onClick={() => setShowPostForm(!showPostForm)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"
                    >
                      <Plus className="w-4 h-4" /> New Post
                    </button>
                  </div>

                  {showPostForm && (
                    <form
                      action={handleCreatePost}
                      className="mb-4 rounded-lg border border-border bg-muted/50 p-4 space-y-3"
                    >
                      <input type="hidden" name="communityId" value={selected.id} />
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">
                            Type
                          </label>
                          <select
                            name="postType"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                          >
                            <option value="text">Text</option>
                            <option value="image">Image</option>
                            <option value="link">Link</option>
                            <option value="poll">Poll</option>
                            <option value="video">Video</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">
                            Title (optional)
                          </label>
                          <input
                            name="title"
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">
                          Body
                        </label>
                        <textarea
                          name="body"
                          required
                          rows={3}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                          placeholder="Post content..."
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPostForm(false)}
                          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Create Post
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Post List */}
                  {selected.posts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No posts yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selected.posts.map((post) => (
                        <div
                          key={post.id}
                          className="rounded-lg border border-border p-4"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-muted-foreground">
                                  {POST_TYPE_LABELS[post.postType] ?? post.postType}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                                    post.postStatus === "published"
                                      ? "bg-success/10 text-success"
                                      : post.postStatus === "scheduled"
                                      ? "bg-warning/10 text-warning"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {post.postStatus === "published" ? (
                                    <CheckCircle2 className="w-3 h-3" />
                                  ) : (
                                    <Clock className="w-3 h-3" />
                                  )}
                                  {post.postStatus}
                                </span>
                              </div>
                              {post.title && (
                                <p className="font-medium text-foreground">
                                  {post.title}
                                </p>
                              )}
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {post.body}
                              </p>
                            </div>
                            {post.postStatus === "draft" && (
                              <div className="flex flex-col gap-1.5 shrink-0">
                                {selected.platform === "facebook" && selected.platformId ? (
                                  <>
                                    <button
                                      onClick={async () => {
                                        const text = post.title
                                          ? `${post.title}\n\n${post.body}`
                                          : post.body;
                                        await navigator.clipboard.writeText(text);
                                        window.open(
                                          `https://www.facebook.com/groups/${selected.platformId}`,
                                          "_blank"
                                        );
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 shrink-0"
                                    >
                                      <ExternalLink className="w-3 h-3" /> Copy & Open Group
                                    </button>
                                    <button
                                      onClick={() => handlePublish(post.id)}
                                      disabled={isPending}
                                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                                    >
                                      <CheckCircle2 className="w-3 h-3" /> Mark Posted
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handlePublish(post.id)}
                                    disabled={isPending}
                                    className="inline-flex items-center gap-1 rounded-lg bg-success px-2.5 py-1 text-xs font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50 shrink-0"
                                  >
                                    <Send className="w-3 h-3" /> Publish
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          {(post.likes ?? 0) > 0 || (post.comments ?? 0) > 0 ? (
                            <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                              <span>{post.likes} likes</span>
                              <span>{post.comments} comments</span>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Auto-Post Tab ─────────────────────────────────────────────────── */}
      {activeTab === "autopost" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" /> Auto-Post Campaigns
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                AI drafts your community posts daily. Wake up, copy, paste, done.
              </p>
            </div>
            <button
              onClick={() => setShowCampaignForm(f => !f)}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="w-4 h-4" /> New Campaign
            </button>
          </div>

          {/* Campaign Form */}
          {showCampaignForm && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold mb-4">Set Up Auto-Post Campaign</h3>
              <form action={handleCreateCampaign} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Campaign Name</label>
                    <input name="name" required placeholder="Daily Reunion Posts"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Community</label>
                    <select name="communityId" required
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="">Select community…</option>
                      {communities.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.platform})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Doctrine / Voice</label>
                    <select name="doctrineMode"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="balanced">Balanced (recommended)</option>
                      <option value="hormozi">Hormozi — Direct & High Value</option>
                      <option value="garyvee">GaryVee — Raw & Authentic</option>
                      <option value="sethgodin">Seth Godin — Thoughtful & Tribal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Ready by (UTC hour)</label>
                    <select name="generateAtUtcHour"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="10">10 UTC = 6am ET / 3am PT</option>
                      <option value="11">11 UTC = 7am ET / 4am PT</option>
                      <option value="12" selected>12 UTC = 8am ET / 5am PT</option>
                      <option value="13">13 UTC = 9am ET / 6am PT</option>
                    </select>
                  </div>
                </div>
                <input type="hidden" name="contentPillars"
                  value='["family connection","legacy","current events","engagement","humor"]' />
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Custom Instructions (optional)</label>
                  <textarea name="customInstructions" rows={2} placeholder="e.g. Always tie back to the idea that family connection is a choice, not a circumstance."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowCampaignForm(false)}
                    className="flex-1 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50">
                    Cancel
                  </button>
                  <button type="submit" disabled={isPending}
                    className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
                    {isPending ? "Creating…" : "Create Campaign"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Campaign List */}
          {campaigns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-sm">No campaigns yet</p>
              <p className="text-xs text-muted-foreground mt-1">Set up a campaign and GrowthOS will draft your posts every morning.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(campaign => {
                const community = communities.find(c => c.id === campaign.communityId);
                const todaysDrafts = community?.posts?.filter(p => {
                  const d = new Date(p.createdAt ?? 0);
                  const today = new Date();
                  return p.postStatus === "draft" &&
                    d.toDateString() === today.toDateString();
                }) ?? [];

                return (
                  <div key={campaign.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${campaign.isActive ? "bg-green-400" : "bg-muted-foreground"}`} />
                          <span className="font-semibold text-sm">{campaign.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {community?.name ?? "—"} · {community?.platform}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Voice: {campaign.doctrineMode} · Runs at {campaign.generateAtUtcHour}:00 UTC daily
                        </p>
                        {campaign.customInstructions && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">"{campaign.customInstructions}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleGenerateNow(campaign.id)}
                          disabled={isPending || generatingPost === campaign.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                          title="Generate today's post now"
                        >
                          {generatingPost === campaign.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Sparkles className="w-3 h-3" />}
                          Generate Now
                        </button>
                        <button
                          onClick={() => toggleCampaign(campaign.id, !campaign.isActive).then(loadCampaigns)}
                          className={`rounded-lg p-1.5 border transition-colors ${campaign.isActive ? "border-green-500/30 text-green-400 hover:bg-green-500/10" : "border-border text-muted-foreground hover:bg-muted"}`}
                          title={campaign.isActive ? "Pause campaign" : "Activate campaign"}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteCampaign(campaign.id).then(loadCampaigns)}
                          className="rounded-lg p-1.5 border border-destructive/20 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Today's drafts */}
                    {todaysDrafts.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Today's drafts ready to post:</p>
                        {todaysDrafts.map(post => {
                          const fullText = post.title ? `${post.title}\n\n${post.body}` : post.body;
                          return (
                            <div key={post.id} className="rounded-lg bg-muted/40 p-3">
                              {post.title && <p className="text-xs font-semibold mb-1">{post.title}</p>}
                              <p className="text-sm text-foreground">{post.body}</p>
                              <div className="flex flex-wrap gap-2 mt-2">
                                {/* Copy & Open */}
                                {community?.platform === "facebook" && community.platformId && (
                                  <button
                                    onClick={async () => {
                                      await handleCopy(fullText, `copy-${post.id}`);
                                      window.open(`https://www.facebook.com/groups/${community.platformId}`, "_blank");
                                    }}
                                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                                  >
                                    {copiedId === `copy-${post.id}` ? <Check className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                                    Copy & Open Group
                                  </button>
                                )}
                                {community?.platform === "reddit" && (
                                  <button
                                    onClick={() => handleCopy(fullText, `copy-${post.id}`)}
                                    className="inline-flex items-center gap-1 rounded-md bg-orange-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
                                  >
                                    {copiedId === `copy-${post.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    Copy for Reddit
                                  </button>
                                )}
                                {/* Mark Posted */}
                                <button
                                  onClick={() => { void handlePublish(post.id); void load(); }}
                                  disabled={isPending}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                                >
                                  <CheckCircle2 className="w-3 h-3" /> Mark Posted
                                </button>
                                {/* AI Comment Suggestions */}
                                <button
                                  onClick={() => handleGetCommentSuggestions(post.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                                >
                                  <MessageSquare className="w-3 h-3" /> Reply Ideas
                                </button>
                                {/* Cross-platform adapt */}
                                <button
                                  onClick={() => handleAdaptPost(post.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                                >
                                  <Repeat2 className="w-3 h-3" /> Adapt
                                </button>
                              </div>

                              {/* Comment Suggestions Panel */}
                              {commentPost === post.id && (
                                <div className="mt-3 pt-3 border-t border-border space-y-2">
                                  <p className="text-xs font-medium">Paste a comment to get reply ideas:</p>
                                  <textarea
                                    value={commentContext}
                                    onChange={e => setCommentContext(e.target.value)}
                                    placeholder="e.g. 'We do game night every Friday!'"
                                    rows={2}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                  <button
                                    onClick={handleFetchSuggestions}
                                    disabled={isPending || !commentContext}
                                    className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                                  >
                                    {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                    Get Reply Ideas
                                  </button>
                                  {commentSuggestions.map((s, i) => (
                                    <div key={i} className="flex items-start gap-2 rounded-lg bg-muted/60 p-2">
                                      <span className="text-xs text-muted-foreground font-mono">{i + 1}</span>
                                      <p className="text-xs flex-1">{s}</p>
                                      <button onClick={() => handleCopy(s, `reply-${i}`)}
                                        className="text-muted-foreground hover:text-foreground flex-shrink-0">
                                        {copiedId === `reply-${i}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Cross-Platform Adapt Panel */}
                              {adaptingPost === post.id && (
                                <div className="mt-3 pt-3 border-t border-border space-y-2">
                                  <p className="text-xs font-medium">Adapt for another platform:</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {(["facebook", "reddit", "instagram", "twitter"] as const)
                                      .filter(p => p !== community?.platform)
                                      .map(p => (
                                        <button key={p} onClick={() => handleAdaptForPlatform(post.id, p)}
                                          disabled={isPending}
                                          className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted capitalize disabled:opacity-50">
                                          {p === "twitter" ? "X / Twitter" : p.charAt(0).toUpperCase() + p.slice(1)}
                                        </button>
                                      ))}
                                  </div>
                                  {adaptedContent && (
                                    <div className="rounded-lg bg-muted/60 p-3 space-y-1">
                                      {adaptedContent.title && <p className="text-xs font-semibold">{adaptedContent.title}</p>}
                                      <p className="text-xs">{adaptedContent.body}</p>
                                      <button onClick={() => handleCopy(
                                        adaptedContent.title ? `${adaptedContent.title}\n\n${adaptedContent.body}` : adaptedContent.body,
                                        "adapted"
                                      )} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1">
                                        {copiedId === "adapted" ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                        Copy adapted post
                                      </button>
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
              })}
            </div>
          )}

          {/* Repost Suggestions */}
          {communities.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Repeat2 className="w-4 h-4 text-primary" /> Repost Suggestions
                </h3>
                <select
                  onChange={e => e.target.value && handleLoadRepostSuggestions(e.target.value)}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none"
                >
                  <option value="">Select community…</option>
                  {communities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {repostSuggestions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Select a community to find high-performing posts worth reposting.</p>
              ) : (
                <div className="space-y-2">
                  {repostSuggestions.map(post => (
                    <div key={post.id} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                      <div className="flex-1 min-w-0">
                        {post.title && <p className="text-xs font-medium">{post.title}</p>}
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{post.body}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {post.likes ?? 0} likes · {post.comments ?? 0} comments
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopy(post.title ? `${post.title}\n\n${post.body}` : post.body, `repost-${post.id}`)}
                        className="flex-shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                      >
                        {copiedId === `repost-${post.id}` ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
