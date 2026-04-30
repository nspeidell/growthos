"use client";

import { useState, useEffect, useTransition } from "react";
import {
  MessagesSquare,
  Plus,
  Trash2,
  Send,
  Users,
  TrendingUp,
  Loader2,
  Clock,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import {
  listCommunities,
  createCommunity,
  createCommunityPost,
  publishCommunityPost,
  deleteCommunity,
  type CommunityWithStats,
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

  useEffect(() => {
    load();
  }, []);

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
    startTransition(async () => {
      await publishCommunityPost(postId);
      await load();
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
                  Platform Group ID (optional)
                </label>
                <input
                  name="platformId"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="e.g. 123456789"
                />
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
                              <button
                                onClick={() => handlePublish(post.id)}
                                disabled={isPending}
                                className="inline-flex items-center gap-1 rounded-lg bg-success px-2.5 py-1 text-xs font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50 shrink-0"
                              >
                                <Send className="w-3 h-3" /> Publish
                              </button>
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
