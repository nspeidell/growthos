"use client";

import { useState, useTransition } from "react";
import {
  X,
  Clock,
  CalendarClock,
  Loader2,
  Send,
  CheckCircle2,
  Trash2,
  Plus,
  ChevronDown,
} from "lucide-react";
import {
  reschedulePost,
  deleteScheduledPost,
  approvePost,
  schedulePostFromCalendar,
} from "./actions";
import type { CalendarPost, ConnectedAccountOption } from "./actions";

// ─── Config ───────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  instagram: { label: "IG",  color: "text-pink-500" },
  x:         { label: "X",   color: "text-sky-500" },
  facebook:  { label: "FB",  color: "text-blue-600" },
  reddit:    { label: "RD",  color: "text-orange-500" },
  youtube:   { label: "YT",  color: "text-red-600" },
  linkedin:  { label: "LI",  color: "text-blue-700" },
  tiktok:    { label: "TK",  color: "text-fuchsia-500" },
  threads:   { label: "TH",  color: "text-neutral-600" },
  pinterest: { label: "PIN", color: "text-red-500" },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft:      { label: "Draft",          className: "bg-muted text-muted-foreground" },
  queued:     { label: "Queued",         className: "bg-amber-500/10 text-amber-600" },
  approved:   { label: "Approved",       className: "bg-primary/10 text-primary" },
  published:  { label: "Published",      className: "bg-success/10 text-success" },
  failed:     { label: "Failed",         className: "bg-destructive/10 text-destructive" },
  cancelled:  { label: "Cancelled",      className: "bg-muted text-muted-foreground" },
  publishing: { label: "Publishing...",  className: "bg-primary/10 text-primary animate-pulse" },
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface DayDetailProps {
  date: Date;
  posts: CalendarPost[];
  accounts: ConnectedAccountOption[];
  onRefresh: () => void;
  onClose: () => void;
}

// ─── Compose Form ─────────────────────────────────────────────────────────────

function ComposeForm({
  date,
  accounts,
  onScheduled,
  onCancel,
}: {
  date: Date;
  accounts: ConnectedAccountOption[];
  onScheduled: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [time, setTime] = useState(
    // Default to the next round hour
    (() => {
      const d = new Date();
      d.setHours(d.getHours() + 1, 0, 0, 0);
      return `${String(d.getHours()).padStart(2, "0")}:00`;
    })()
  );

  function handleSubmit() {
    setError(null);
    if (!accountId) { setError("Please select an account"); return; }
    if (!body.trim()) { setError("Content is required"); return; }

    // Build a timestamp from the selected day + the chosen time
    const [h, m] = time.split(":").map(Number);
    const scheduledDate = new Date(date);
    scheduledDate.setHours(h ?? 0, m ?? 0, 0, 0);

    const fd = new FormData();
    fd.set("connectedAccountId", accountId);
    fd.set("body", body);
    fd.set("scheduledForMs", String(scheduledDate.getTime()));

    startTransition(async () => {
      const result = await schedulePostFromCalendar(fd);
      if (result.success) {
        onScheduled();
      } else if (!result.success) {
        setError(result.error ?? "Failed to schedule");
      }
    });
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
        No connected accounts. Connect a social account in Settings → Publisher to schedule posts.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
      <p className="text-xs font-semibold text-primary uppercase tracking-wide">New Post</p>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Account picker */}
      <div className="relative">
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="w-full appearance-none rounded-lg border border-input bg-background pl-3 pr-8 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.platform.charAt(0).toUpperCase() + a.platform.slice(1)}
              {a.username ? ` — @${a.username}` : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      </div>

      {/* Content */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2200}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring resize-none"
        placeholder="Write your post..."
      />
      <p className="text-[10px] text-muted-foreground text-right">{body.length}/2200</p>

      {/* Time */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Time</label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DayDetail({ date, posts, accounts, onRefresh, onClose }: DayDetailProps) {
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);

  const formatted = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  function handleReschedule(postId: string) {
    if (!newDate || !newTime) return;
    setError(null);
    const dateTime = new Date(`${newDate}T${newTime}`);
    if (isNaN(dateTime.getTime())) { setError("Invalid date/time"); return; }

    startTransition(async () => {
      const result = await reschedulePost(postId, dateTime.getTime());
      if (result.success) {
        setRescheduleId(null);
        setNewDate("");
        setNewTime("");
        onRefresh();
      } else if (!result.success) {
        setError(result.error ?? "Failed to reschedule");
      }
    });
  }

  function handleDelete(postId: string) {
    if (!confirm("Delete this post?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteScheduledPost(postId);
      if (!result.success) setError(result.error ?? "Failed to delete");
      else onRefresh();
    });
  }

  function handleApprove(postId: string) {
    setError(null);
    startTransition(async () => {
      const result = await approvePost(postId);
      if (!result.success) setError(result.error ?? "Failed to approve");
      else onRefresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">{formatted}</h3>
          <p className="text-xs text-muted-foreground">
            {posts.length} post{posts.length !== 1 ? "s" : ""} scheduled
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCompose((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Schedule Post
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Compose form */}
      {showCompose && (
        <ComposeForm
          date={date}
          accounts={accounts}
          onScheduled={() => { setShowCompose(false); onRefresh(); }}
          onCancel={() => setShowCompose(false)}
        />
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Posts List */}
      {posts.length === 0 ? (
        <div className="py-6 text-center">
          <CalendarClock className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No posts scheduled for this day.</p>
          <button
            onClick={() => setShowCompose(true)}
            className="mt-2 text-xs text-primary hover:underline"
          >
            Schedule one now →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const platform = PLATFORM_LABELS[post.platform] ?? { label: post.platform, color: "text-muted-foreground" };
            const status = STATUS_BADGES[post.postStatus] ?? STATUS_BADGES.draft!;
            const time = new Date(post.scheduledFor).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            const isRescheduling = rescheduleId === post.id;
            const canModify = post.postStatus !== "published" && post.postStatus !== "publishing";
            const canApprove = post.postStatus === "draft" || post.postStatus === "queued";

            return (
              <div key={post.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold ${platform.color}`}>{platform.label}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}>
                        {status.label}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {time}
                      </span>
                    </div>
                    <p className="text-sm text-foreground line-clamp-2">
                      {post.body || "No content preview"}
                    </p>
                  </div>

                  {/* Actions */}
                  {canModify && (
                    <div className="flex items-center gap-1 shrink-0">
                      {canApprove && (
                        <button
                          onClick={() => handleApprove(post.id)}
                          disabled={isPending}
                          title="Approve"
                          className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-green-600 hover:border-green-500/40 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setRescheduleId(isRescheduling ? null : post.id)}
                        disabled={isPending}
                        title="Reschedule"
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40 disabled:opacity-50"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(post.id)}
                        disabled={isPending}
                        title="Delete"
                        className="rounded-md border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Reschedule Form */}
                {isRescheduling && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Date</label>
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:border-ring focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">Time</label>
                      <input
                        type="time"
                        value={newTime}
                        onChange={(e) => setNewTime(e.target.value)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:border-ring focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <button
                      onClick={() => handleReschedule(post.id)}
                      disabled={isPending || !newDate || !newTime}
                      className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Move
                    </button>
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
