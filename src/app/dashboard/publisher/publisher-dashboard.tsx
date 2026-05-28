"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Send,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  RefreshCw,
  Library,
  Copy,
  ChevronDown,
  Check,
  ArrowUpDown,
  CheckSquare,
  Square,
  Image,
  Video,
  Download,
  Zap,
} from "lucide-react";
import {
  listConnectedAccounts,
  listScheduledPosts,
  schedulePost,
  approvePost,
  cancelPost,
  listPinterestBoards,
  createReunionPinterestBoards,
  type ScheduledPostWithDetails,
} from "./actions";
import type { PinterestBoard } from "@/lib/publishers/pinterest";
import {
  listContentAssets,
  approveAndScheduleAll,
  getMediaJobStatus,
  type ContentAssetWithProject,
  type BatchScheduleResult,
} from "../content/actions";
import type { ConnectedAccount, ContentAsset } from "@/lib/db/schema";

// ─── Platform Icons & Colors ───

const PLATFORM_META: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  instagram: { label: "Instagram", color: "bg-pink-500", icon: "📸" },
  facebook: { label: "Facebook", color: "bg-blue-600", icon: "📘" },
  youtube: { label: "YouTube", color: "bg-red-600", icon: "▶️" },
  x: { label: "X", color: "bg-neutral-800", icon: "𝕏" },
  reddit: { label: "Reddit", color: "bg-orange-500", icon: "🤖" },
  pinterest: { label: "Pinterest", color: "bg-red-700", icon: "📌" },
  linkedin: { label: "LinkedIn", color: "bg-blue-700", icon: "💼" },
  tiktok: { label: "TikTok", color: "bg-neutral-900", icon: "🎵" },
  google_business: { label: "Google Business", color: "bg-green-600", icon: "📍" },
  threads: { label: "Threads", color: "bg-neutral-700", icon: "🧵" },
  wordpress: { label: "WordPress", color: "bg-blue-500", icon: "📝" },
  medium: { label: "Medium", color: "bg-neutral-800", icon: "✍️" },
  ghost: { label: "Ghost", color: "bg-neutral-600", icon: "👻" },
  substack: { label: "Substack", color: "bg-orange-600", icon: "📰" },
  website: { label: "Website", color: "bg-teal-600", icon: "🌐" },
  email: { label: "Email", color: "bg-indigo-600", icon: "📧" },
};

const STATUS_BADGES: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  draft: {
    label: "Pending Approval",
    className: "bg-yellow-100 text-yellow-800",
    icon: <Clock className="w-3 h-3" />,
  },
  queued: {
    label: "Queued",
    className: "bg-blue-100 text-blue-800",
    icon: <Clock className="w-3 h-3" />,
  },
  approved: {
    label: "Approved",
    className: "bg-green-100 text-green-800",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  publishing: {
    label: "Publishing...",
    className: "bg-purple-100 text-purple-800",
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  published: {
    label: "Published",
    className: "bg-green-100 text-green-800",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  failed: {
    label: "Failed",
    className: "bg-red-100 text-red-800",
    icon: <XCircle className="w-3 h-3" />,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-neutral-100 text-neutral-600",
    icon: <XCircle className="w-3 h-3" />,
  },
};

type Tab = "library" | "queue";

export default function PublisherDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>("library");
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [posts, setPosts] = useState<ScheduledPostWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<string | null>(null);
  const [creatingBoards, setCreatingBoards] = useState(false);

  // Check URL params for connection status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const username = params.get("username");
    const error = params.get("error");

    if (connected && username) {
      setNotification(`✅ Connected ${connected} as @${username}`);
      window.history.replaceState({}, "", "/dashboard/publisher");
    } else if (error) {
      setNotification(`❌ ${error}`);
      window.history.replaceState({}, "", "/dashboard/publisher");
    }
  }, []);

  // Load data on mount and when tab switches to queue
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [acctResult, postResult] = await Promise.all([
        listConnectedAccounts(),
        listScheduledPosts(),
      ]);

      if (acctResult.success) setAccounts(acctResult.data);
      if (postResult.success) setPosts(postResult.data);
      setLoading(false);
    }
    loadData();
  }, []);

  // Refresh queue when switching to Queue tab
  useEffect(() => {
    if (activeTab === "queue") {
      listScheduledPosts().then((result) => {
        if (result.success) setPosts(result.data);
      });
    }
  }, [activeTab]);

  // Called by Library after batch scheduling to refresh queue data
  function refreshQueue() {
    listScheduledPosts().then((result) => {
      if (result.success) setPosts(result.data);
    });
  }

  const handleApprove = (postId: string) => {
    startTransition(async () => {
      const result = await approvePost(postId);
      if (result.success) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, postStatus: "queued" } : p
          )
        );
        setNotification("Post approved and queued for publishing");
      }
    });
  };

  const handleCancel = (postId: string) => {
    startTransition(async () => {
      const result = await cancelPost(postId);
      if (result.success) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, postStatus: "cancelled" } : p
          )
        );
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification Banner */}
      {notification && (
        <div className="rounded-lg bg-brand-50 border border-brand-200 p-4 flex items-center justify-between">
          <span className="text-sm">{notification}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-brand-600 hover:text-brand-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pinterest Setup Banner */}
      {accounts.some((a) => a.platform === "pinterest" && a.accountStatus === "active") && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-red-900">📌 Pinterest connected</p>
            <p className="text-xs text-red-700 mt-0.5">
              Create all 12 Reunion strategy boards in one click — Family Traditions, Questions to Ask Your Grandparents, Family Legacy Ideas, and more.
            </p>
          </div>
          <button
            disabled={creatingBoards}
            onClick={() => {
              const pinterestAccount = accounts.find((a) => a.platform === "pinterest" && a.accountStatus === "active");
              if (!pinterestAccount) return;
              setCreatingBoards(true);
              createReunionPinterestBoards(pinterestAccount.id).then((result) => {
                setCreatingBoards(false);
                if (result.success) {
                  const { created, skipped } = result.data;
                  const parts = [];
                  if (created.length > 0) parts.push(`${created.length} boards created`);
                  if (skipped.length > 0) parts.push(`${skipped.length} already existed`);
                  setNotification(`✅ Pinterest boards ready! ${parts.join(", ")}.`);
                } else {
                  setNotification(`❌ Board creation failed: ${result.error}`);
                }
              });
            }}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-2 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-50"
          >
            {creatingBoards ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "📌"}
            {creatingBoards ? "Creating boards…" : "Create All 12 Boards"}
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Publisher</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Schedule, approve, and publish content across platforms
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {(
          [
            { key: "library", label: "Library", icon: Library },
            { key: "queue", label: "Queue", icon: Send },
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
      {activeTab === "library" && (
        <ContentLibrary accounts={accounts} onScheduled={refreshQueue} />
      )}
      {activeTab === "queue" && (
        <QueueView
          posts={posts}
          onApprove={handleApprove}
          onCancel={handleCancel}
          isPending={isPending}
        />
      )}
    </div>
  );
}

// ─── Queue View ───

function QueueView({
  posts,
  onApprove,
  onCancel,
  isPending,
}: {
  posts: ScheduledPostWithDetails[];
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  isPending: boolean;
}) {
  const activePosts = posts.filter(
    (p) => !["cancelled", "published"].includes(p.postStatus)
  );
  const publishedPosts = posts.filter((p) => p.postStatus === "published");

  if (activePosts.length === 0 && publishedPosts.length === 0) {
    return (
      <div className="text-center py-16">
        <Send className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-neutral-900">
          No posts in queue
        </h3>
        <p className="text-sm text-neutral-500 mt-1">
          Schedule content from the Content Studio to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {activePosts.length > 0 && (
      <div className="space-y-3">
      {activePosts.map((post) => {
        const platformInfo = PLATFORM_META[post.platform] ?? {
          label: post.platform,
          color: "bg-neutral-500",
          icon: "📱",
        };
        const defaultBadge = { label: "Unknown", className: "bg-neutral-100 text-neutral-600", icon: <Clock className="w-3 h-3" /> };
        const statusInfo = STATUS_BADGES[post.postStatus] ?? defaultBadge;

        return (
          <div
            key={post.id}
            className="rounded-lg border border-neutral-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Platform + Status */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${platformInfo.color}`}
                  >
                    <span>{platformInfo.icon}</span>
                    {platformInfo.label}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}
                  >
                    {statusInfo.icon}
                    {statusInfo.label}
                  </span>
                  {post.approvalMode === "autonomous" && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      Auto
                    </span>
                  )}
                </div>

                {/* Content Preview */}
                <p className="text-sm text-neutral-800 line-clamp-2">
                  {post.contentAsset?.body?.substring(0, 200) ?? "Content"}
                </p>

                {/* Account + Schedule */}
                <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                  {post.account && (
                    <span>@{post.account.platformUsername}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(post.scheduledFor).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Error Message */}
                {post.errorMessage && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                    <AlertTriangle className="w-3 h-3" />
                    {post.errorMessage}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {post.postStatus === "draft" && (
                  <button
                    onClick={() => onApprove(post.id)}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50"
                  >
                    Approve
                  </button>
                )}
                {post.postStatus === "published" && post.platformPostUrl && (
                  <a
                    href={post.platformPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:text-brand-700"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                {!["published", "publishing", "cancelled"].includes(
                  post.postStatus
                ) && (
                  <button
                    onClick={() => onCancel(post.id)}
                    disabled={isPending}
                    className="px-3 py-1.5 text-xs font-medium text-neutral-600 border border-neutral-300 rounded-md hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      </div>
      )}

      {/* Published Posts */}
      {publishedPosts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" /> Published ({publishedPosts.length})
          </h3>
          {publishedPosts.map((post) => {
            const platformInfo = PLATFORM_META[post.platform] ?? { label: post.platform, color: "bg-neutral-500", icon: "📱" };
            return (
              <div key={post.id} className="rounded-lg border border-green-100 bg-green-50/40 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${platformInfo.color}`}>
                        <span>{platformInfo.icon}</span> {platformInfo.label}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle2 className="w-3 h-3" /> Published
                      </span>
                    </div>
                    <p className="text-sm text-neutral-700 line-clamp-2">
                      {post.contentAsset?.body?.substring(0, 200) ?? "Content"}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500">
                      {post.account && <span>@{post.account.platformUsername}</span>}
                      {post.publishedAt && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                          {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                  </div>
                  {post.platformPostUrl && (
                    <a href={post.platformPostUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 flex-shrink-0">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Content Library (approved content ready to schedule) ───

type SortField = "date" | "platform" | "project" | "status";
type SortDir = "asc" | "desc";

function ContentLibrary({ accounts, onScheduled }: { accounts: ConnectedAccount[]; onScheduled: () => void }) {
  const [allAssets, setAllAssets] = useState<ContentAssetWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sort
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Multi-select + batch
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchTime, setBatchTime] = useState("");
  const [batchScheduling, setBatchScheduling] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchScheduleResult | null>(null);

  // Single schedule inline
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleSuccess, setScheduleSuccess] = useState("");

  // Pinterest board picker
  const [pinterestBoards, setPinterestBoards] = useState<PinterestBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState("");

  // Load ALL assets once (filter client-side for speed)
  useEffect(() => {
    loadAssets();
  }, []);

  // Load Pinterest boards when a Pinterest account is selected
  useEffect(() => {
    if (!selectedAccountId) {
      setPinterestBoards([]);
      setSelectedBoardId("");
      return;
    }
    const account = accounts.find((a) => a.id === selectedAccountId);
    if (account?.platform !== "pinterest") {
      setPinterestBoards([]);
      setSelectedBoardId("");
      return;
    }
    setLoadingBoards(true);
    setSelectedBoardId("");
    listPinterestBoards(selectedAccountId).then((result) => {
      if (result.success && result.data) {
        setPinterestBoards(result.data);
        if (result.data.length > 0 && result.data[0]) setSelectedBoardId(result.data[0].id);
      }
      setLoadingBoards(false);
    });
  }, [selectedAccountId, accounts]);

  // Poll for in-progress media jobs
  useEffect(() => {
    const pendingJobIds = allAssets
      .filter((a) => a.mediaJob && (a.mediaJob.status === "processing" || a.mediaJob.status === "queued"))
      .map((a) => a.mediaJob!.id);

    if (pendingJobIds.length === 0) return;

    const interval = setInterval(async () => {
      const result = await getMediaJobStatus(pendingJobIds);
      if (!result.success) return;

      const updates = result.data;
      let hasChanges = false;

      setAllAssets((prev) =>
        prev.map((asset) => {
          if (!asset.mediaJob) return asset;
          const update = updates[asset.mediaJob.id];
          if (update && update.status !== asset.mediaJob.status) {
            hasChanges = true;
            return {
              ...asset,
              mediaJob: { ...asset.mediaJob, ...update },
            };
          }
          return asset;
        })
      );
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [allAssets]);

  async function loadAssets() {
    setLoading(true);
    const result = await listContentAssets();
    if (result.success) {
      setAllAssets(result.data);
    }
    setSelectedIds(new Set());
    setBatchResult(null);
    setLoading(false);
  }

  // ─── Client-side filtering ───

  function getFiltered(): ContentAssetWithProject[] {
    let filtered = allAssets;
    if (statusFilter) {
      filtered = filtered.filter((a) => a.status === statusFilter);
    }
    if (platformFilter) {
      filtered = filtered.filter((a) => a.platform === platformFilter);
    }
    if (projectFilter) {
      filtered = filtered.filter((a) => a.projectTitle === projectFilter);
    }
    return filtered;
  }

  // ─── Sorting ───

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "date" ? "desc" : "asc");
    }
  }

  function getSorted(list: ContentAssetWithProject[]) {
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "platform":
          cmp = a.platform.localeCompare(b.platform);
          break;
        case "project":
          cmp = a.projectTitle.localeCompare(b.projectTitle);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  // Unique project names for the filter dropdown
  const uniqueProjects = [...new Set(allAssets.map((a) => a.projectTitle))].sort();
  // Unique platforms that actually exist in the data
  const uniquePlatforms = [...new Set(allAssets.map((a) => a.platform))].sort();

  // ─── Selection ───

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sortedAssets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedAssets.map((a) => a.id)));
    }
  }

  // ─── Batch Schedule ───

  async function handleBatchSchedule() {
    if (selectedIds.size === 0) return;
    setBatchScheduling(true);
    setScheduleError("");

    const scheduleTime = batchTime
      ? new Date(batchTime).toISOString()
      : new Date(Date.now() + 3600000).toISOString();

    const res = await approveAndScheduleAll([...selectedIds], scheduleTime);

    setBatchScheduling(false);

    if (!res.success) {
      setScheduleError(res.error);
      return;
    }

    setBatchResult(res.data);
    setSelectedIds(new Set());
    onScheduled(); // Refresh queue data
  }

  // ─── Single Schedule ───

  function openSchedule(assetId: string, platform: string) {
    setSchedulingId(assetId);
    setScheduleError("");
    setScheduleSuccess("");
    const match = accounts.find(
      (a) => a.platform === platform && a.accountStatus === "active"
    );
    setSelectedAccountId(match?.id ?? "");
    const oneHour = new Date(Date.now() + 60 * 60 * 1000);
    setScheduledFor(oneHour.toISOString().slice(0, 16));
  }

  async function handlePostNow(assetId: string, platform: string) {
    // Find matching active account for this platform
    const match = accounts.find((a) => a.platform === platform && a.accountStatus === "active");
    if (!match) {
      setScheduleError(`No ${PLATFORM_META[platform]?.label ?? platform} account connected. Go to Brand Vault → Accounts.`);
      return;
    }

    setScheduling(true);
    setScheduleError("");

    const formData = new FormData();
    formData.set("contentAssetId", assetId);
    formData.set("connectedAccountId", match.id);
    formData.set("scheduledFor", new Date().toISOString()); // Now
    formData.set("approvalMode", "manual");

    const result = await schedulePost(formData);
    setScheduling(false);

    if (!result.success) {
      setScheduleError(result.error);
      return;
    }

    setScheduleSuccess("Post queued for immediate publishing!");
    onScheduled();
    setTimeout(() => setScheduleSuccess(""), 3000);
  }

  async function handleSchedule() {
    if (!schedulingId || !selectedAccountId || !scheduledFor) {
      setScheduleError("Select an account and time.");
      return;
    }

    const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

    // Pinterest requires a board selection
    if (selectedAccount?.platform === "pinterest" && !selectedBoardId) {
      setScheduleError("Select a Pinterest board.");
      return;
    }

    setScheduling(true);
    setScheduleError("");

    const formData = new FormData();
    formData.set("contentAssetId", schedulingId);
    formData.set("connectedAccountId", selectedAccountId);
    formData.set("scheduledFor", new Date(scheduledFor).toISOString());
    formData.set("approvalMode", "manual");

    // Attach Pinterest board ID in metadata so the publisher adapter can use it
    if (selectedAccount?.platform === "pinterest" && selectedBoardId) {
      formData.set("metadata", JSON.stringify({ boardId: selectedBoardId }));
    }

    const result = await schedulePost(formData);

    setScheduling(false);

    if (!result.success) {
      setScheduleError(result.error);
      return;
    }

    setScheduleSuccess("Scheduled! Check the Queue tab.");
    setSchedulingId(null);
    onScheduled(); // Refresh queue data
    setTimeout(() => setScheduleSuccess(""), 3000);
  }

  const activeAccounts = accounts.filter((a) => a.accountStatus === "active");
  const filteredAssets = getFiltered();
  const sortedAssets = getSorted(filteredAssets);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scheduleSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {scheduleSuccess}
        </div>
      )}

      {batchResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <strong>{batchResult.approved} approved</strong>, <strong>{batchResult.scheduled} scheduled</strong> to connected accounts.
          {batchResult.skipped.length > 0 && (
            <span className="text-amber-700 ml-1">
              Skipped (no account): {batchResult.skipped.map((p) => PLATFORM_META[p]?.label ?? p).join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setSelectedIds(new Set()); }}
          className="rounded-lg border border-neutral-300 bg-white text-neutral-900 px-3 py-1.5 text-sm"
        >
          <option value="">All Status</option>
          <option value="approved">Approved</option>
          <option value="draft">Draft</option>
          <option value="review">In Review</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          value={platformFilter}
          onChange={(e) => { setPlatformFilter(e.target.value); setSelectedIds(new Set()); }}
          className="rounded-lg border border-neutral-300 bg-white text-neutral-900 px-3 py-1.5 text-sm"
        >
          <option value="">All Platforms</option>
          {uniquePlatforms.map((key) => {
            const meta = PLATFORM_META[key];
            return (
              <option key={key} value={key}>
                {meta?.icon ?? "📱"} {meta?.label ?? key}
              </option>
            );
          })}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => { setProjectFilter(e.target.value); setSelectedIds(new Set()); }}
          className="rounded-lg border border-neutral-300 bg-white text-neutral-900 px-3 py-1.5 text-sm"
        >
          <option value="">All Projects</option>
          {uniqueProjects.map((title) => (
            <option key={title} value={title}>{title}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-neutral-500 mr-1">Sort:</span>
          {(["date", "platform", "project", "status"] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => toggleSort(field)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                sortField === field
                  ? "bg-neutral-200 text-neutral-900"
                  : "text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {field.charAt(0).toUpperCase() + field.slice(1)}
              {sortField === field && (
                <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter count */}
      {(statusFilter || platformFilter || projectFilter) && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span>
            Showing {sortedAssets.length} of {allAssets.length} items
          </span>
          <button
            onClick={() => { setStatusFilter(""); setPlatformFilter(""); setProjectFilter(""); setSelectedIds(new Set()); }}
            className="text-brand-600 hover:text-brand-700 font-medium"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Batch Action Bar */}
      {sortedAssets.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 hover:text-neutral-900"
          >
            {selectedIds.size === sortedAssets.length ? (
              <CheckSquare className="h-4 w-4 text-brand-600" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {selectedIds.size === sortedAssets.length ? "Deselect All" : "Select All"}
          </button>

          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-neutral-500">
                {selectedIds.size} selected
              </span>
              <div className="ml-auto flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={batchTime}
                  onChange={(e) => setBatchTime(e.target.value)}
                  placeholder="1hr from now"
                  className="rounded-md border border-neutral-300 bg-white text-neutral-900 px-2 py-1 text-xs"
                />
                <button
                  onClick={handleBatchSchedule}
                  disabled={batchScheduling}
                  className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {batchScheduling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Send className="h-3 w-3" />
                  )}
                  Schedule {selectedIds.size} Post{selectedIds.size !== 1 ? "s" : ""}
                </button>
              </div>
            </>
          )}

          {selectedIds.size === 0 && (
            <span className="text-xs text-neutral-400 ml-auto">
              Select posts to batch schedule
            </span>
          )}
        </div>
      )}

      {scheduleError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {scheduleError}
        </div>
      )}

      {sortedAssets.length === 0 ? (
        <div className="py-16 text-center">
          <Library className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-2 text-sm font-medium text-neutral-700">No content yet</p>
          <p className="text-xs text-neutral-500 mt-1">
            Generate content in the Create tab to get started
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedAssets.map((asset) => {
            const meta = PLATFORM_META[asset.platform] ?? {
              label: asset.platform,
              color: "bg-neutral-500",
              icon: "📱",
            };
            const isSelected = selectedIds.has(asset.id);

            return (
              <div
                key={asset.id}
                className={`rounded-xl border bg-white overflow-hidden transition-colors ${
                  isSelected ? "border-brand-400 ring-1 ring-brand-200" : "border-neutral-200"
                }`}
              >
                {/* Header */}
                <div className="flex items-center">
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(asset.id)}
                    className="pl-4 pr-2 py-3 flex-shrink-0"
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-brand-600" />
                    ) : (
                      <Square className="h-4 w-4 text-neutral-400" />
                    )}
                  </button>

                  <button
                    onClick={() => setExpandedId(expandedId === asset.id ? null : asset.id)}
                    className="flex-1 flex items-center justify-between pr-4 py-3 text-left hover:bg-neutral-50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg">{meta.icon}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">
                          {asset.projectTitle}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {meta.label} · {asset.type} · v{asset.version}
                          <span className="ml-2 text-neutral-400">
                            {new Date(asset.createdAt).toLocaleDateString("en-US", {
                              month: "short", day: "numeric",
                            })}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Media Status Badge */}
                      {asset.mediaJob && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          asset.mediaJob.status === "completed"
                            ? "bg-emerald-100 text-emerald-800"
                            : asset.mediaJob.status === "processing"
                            ? "bg-blue-100 text-blue-800"
                            : asset.mediaJob.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-neutral-100 text-neutral-600"
                        }`}>
                          {asset.mediaJob.status === "completed" ? (
                            asset.mediaJob.type === "video_composite" ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />
                          ) : asset.mediaJob.status === "processing" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : null}
                          {asset.mediaJob.type === "video_composite" ? "Video" : "Image"}
                        </span>
                      )}
                      {/* Publish Status Badge */}
                      {asset.publishedPost && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          asset.publishedPost.postStatus === "published"
                            ? "bg-emerald-100 text-emerald-800"
                            : asset.publishedPost.postStatus === "failed"
                            ? "bg-red-100 text-red-800"
                            : asset.publishedPost.postStatus === "queued" || asset.publishedPost.postStatus === "publishing"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-neutral-100 text-neutral-600"
                        }`}>
                          {asset.publishedPost.postStatus === "published" ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : asset.publishedPost.postStatus === "failed" ? (
                            <XCircle className="h-3 w-3" />
                          ) : asset.publishedPost.postStatus === "publishing" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {asset.publishedPost.postStatus === "published" ? "Published" :
                           asset.publishedPost.postStatus === "failed" ? "Failed" :
                           asset.publishedPost.postStatus === "queued" ? "Queued" :
                           asset.publishedPost.postStatus === "publishing" ? "Publishing…" :
                           asset.publishedPost.postStatus}
                          {asset.publishedPost.postStatus === "published" && asset.publishedPost.platformPostUrl && (
                            <a
                              href={asset.publishedPost.platformPostUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="ml-0.5 hover:opacity-70"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        asset.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : asset.status === "draft"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {asset.status}
                      </span>
                      <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform ${
                        expandedId === asset.id ? "rotate-180" : ""
                      }`} />
                    </div>
                  </button>
                </div>

                {/* Expanded Content */}
                {expandedId === asset.id && (
                  <div className="border-t border-neutral-100 px-4 py-3">
                    {/* Media Preview */}
                    {asset.mediaJob && (
                      <div className="mb-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                        <div className="flex items-center gap-2 mb-2">
                          {asset.mediaJob.type === "video_composite" ? (
                            <Video className="h-4 w-4 text-purple-600" />
                          ) : (
                            <Image className="h-4 w-4 text-blue-600" />
                          )}
                          <span className="text-xs font-medium text-neutral-700">
                            {asset.mediaJob.type === "video_composite" ? "Video" :
                             asset.mediaJob.type === "meme" ? "Meme" :
                             asset.mediaJob.type === "quote_card" ? "Quote Card" :
                             asset.mediaJob.type === "carousel_slide" ? "Carousel" :
                             "Image"} — {asset.mediaJob.status}
                          </span>
                        </div>

                        {asset.mediaJob.status === "completed" && asset.mediaJob.r2Key && (
                          <div className="space-y-2">
                            {/* Show thumbnail for images */}
                            {asset.mediaJob.type !== "video_composite" && (
                              <img
                                src={`/api/media/serve/${asset.mediaJob.r2Key}`}
                                alt="Generated media"
                                className="max-w-xs rounded-md border border-neutral-200"
                              />
                            )}
                            {/* Download link */}
                            <a
                              href={`/api/media/serve/${asset.mediaJob.r2Key}?download=true`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                            >
                              <Download className="h-3 w-3" />
                              Download {asset.mediaJob.type === "video_composite" ? "Video" : "Image"}
                            </a>
                          </div>
                        )}

                        {asset.mediaJob.status === "processing" && (
                          <div className="flex items-center gap-2 text-xs text-blue-600">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Generating... this may take a minute
                          </div>
                        )}

                        {asset.mediaJob.status === "queued" && (
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <Clock className="h-3 w-3" />
                            Queued for processing
                          </div>
                        )}

                        {asset.mediaJob.status === "failed" && (
                          <div className="flex items-center gap-2 text-xs text-red-600">
                            <XCircle className="h-3 w-3" />
                            {asset.mediaJob.error ?? "Generation failed"}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="whitespace-pre-wrap text-sm text-neutral-700 leading-relaxed mb-3 max-h-64 overflow-y-auto">
                      {asset.body}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(asset.body);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                      >
                        <Copy className="h-3 w-3" /> Copy
                      </button>
                      {asset.status === "approved" && (
                        <>
                          <button
                            onClick={() => openSchedule(asset.id, asset.platform)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700"
                          >
                            <Calendar className="h-3 w-3" /> Schedule Post
                          </button>
                          <button
                            onClick={() => handlePostNow(asset.id, asset.platform)}
                            disabled={scheduling}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Zap className="h-3 w-3" /> Post Now
                          </button>
                        </>
                      )}
                    </div>

                    {/* Inline Schedule Form */}
                    {schedulingId === asset.id && (
                      <div className="mt-3 p-3 rounded-lg border border-brand-200 bg-brand-50 space-y-3">
                        {scheduleError && (
                          <p className="text-xs text-red-600">{scheduleError}</p>
                        )}
                        <div className="flex gap-2">
                          <select
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                            className="flex-1 rounded-md border border-neutral-300 bg-white text-neutral-900 px-2 py-1.5 text-xs"
                          >
                            <option value="">Select account...</option>
                            {activeAccounts.map((a) => {
                              const aMeta = PLATFORM_META[a.platform];
                              return (
                                <option key={a.id} value={a.id}>
                                  {aMeta?.icon ?? "📱"} {aMeta?.label ?? a.platform} — @{a.platformUsername}
                                </option>
                              );
                            })}
                          </select>
                          <input
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            className="flex-1 rounded-md border border-neutral-300 bg-white text-neutral-900 px-2 py-1.5 text-xs"
                          />
                        </div>

                        {/* Pinterest Board Picker — shown only when a Pinterest account is selected */}
                        {accounts.find((a) => a.id === selectedAccountId)?.platform === "pinterest" && (
                          <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                              📌 Pinterest Board
                            </label>
                            {loadingBoards ? (
                              <div className="flex items-center gap-2 text-xs text-neutral-500">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Loading your boards…
                              </div>
                            ) : pinterestBoards.length === 0 ? (
                              <p className="text-xs text-amber-600">
                                No boards found. Create a board on Pinterest first, then reconnect.
                              </p>
                            ) : (
                              <select
                                value={selectedBoardId}
                                onChange={(e) => setSelectedBoardId(e.target.value)}
                                className="w-full rounded-md border border-neutral-300 bg-white text-neutral-900 px-2 py-1.5 text-xs"
                              >
                                {pinterestBoards.map((board) => (
                                  <option key={board.id} value={board.id}>
                                    {board.name}
                                    {board.pin_count > 0 ? ` (${board.pin_count} pins)` : ""}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            onClick={handleSchedule}
                            disabled={
                              scheduling ||
                              !selectedAccountId ||
                              (accounts.find((a) => a.id === selectedAccountId)?.platform === "pinterest" && !selectedBoardId)
                            }
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                          >
                            {scheduling ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3" />
                            )}
                            Schedule
                          </button>
                          <button
                            onClick={() => setSchedulingId(null)}
                            className="px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-700"
                          >
                            Cancel
                          </button>
                        </div>
                        {activeAccounts.length === 0 && (
                          <p className="text-xs text-amber-600">
                            No accounts connected. Go to Brand Vault → Accounts to connect platforms.
                          </p>
                        )}
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
