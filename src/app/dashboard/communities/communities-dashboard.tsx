"use client";

import { useState, useEffect, useTransition } from "react";
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
  const [activeTab, setActiveTab] = useState<"communities" | "create">("communities");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPostForm, setShowPostForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
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
    </div>
  );
}
