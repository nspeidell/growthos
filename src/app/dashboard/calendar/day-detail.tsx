"use client";

import { useState, useTransition } from "react";
import {
  X,
  Clock,
  CalendarClock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Send,
} from "lucide-react";
import { reschedulePost } from "./actions";
import type { CalendarPost } from "./actions";

// ─── Platform Icons (text-based for simplicity) ───

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  instagram: { label: "IG", color: "text-pink-500" },
  x: { label: "X", color: "text-sky-500" },
  facebook: { label: "FB", color: "text-blue-600" },
  reddit: { label: "RD", color: "text-orange-500" },
  youtube: { label: "YT", color: "text-red-600" },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  queued: { label: "Queued", className: "bg-amber-500/10 text-amber-600" },
  approved: { label: "Approved", className: "bg-primary/10 text-primary" },
  published: { label: "Published", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
  publishing: { label: "Publishing...", className: "bg-primary/10 text-primary animate-pulse" },
};

interface DayDetailProps {
  date: Date;
  posts: CalendarPost[];
  onReschedule: () => void;
  onClose: () => void;
}

export function DayDetail({ date, posts, onReschedule, onClose }: DayDetailProps) {
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReschedule(postId: string) {
    if (!newDate || !newTime) return;
    setError(null);

    const dateTime = new Date(`${newDate}T${newTime}`);
    if (isNaN(dateTime.getTime())) {
      setError("Invalid date/time");
      return;
    }

    startTransition(async () => {
      const result = await reschedulePost(postId, dateTime.getTime());
      if (result.success) {
        setRescheduleId(null);
        setNewDate("");
        setNewTime("");
        onReschedule();
      } else {
        setError(result.error ?? "Failed to reschedule");
      }
    });
  }

  const formatted = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">{formatted}</h3>
          <p className="text-xs text-muted-foreground">
            {posts.length} post{posts.length !== 1 ? "s" : ""} scheduled
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Posts List */}
      {posts.length === 0 ? (
        <div className="py-6 text-center">
          <CalendarClock className="mx-auto h-7 w-7 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No posts scheduled for this day
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const platform = PLATFORM_LABELS[post.platform] ?? {
              label: post.platform,
              color: "text-muted-foreground",
            };
            const status = STATUS_BADGES[post.postStatus] ?? STATUS_BADGES.draft!;
            const time = new Date(post.scheduledFor).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            const isRescheduling = rescheduleId === post.id;
            const canReschedule =
              post.postStatus !== "published" && post.postStatus !== "publishing";

            return (
              <div
                key={post.id}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold ${platform.color}`}>
                        {platform.label}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${status.className}`}
                      >
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

                  {canReschedule && (
                    <button
                      onClick={() =>
                        setRescheduleId(isRescheduling ? null : post.id)
                      }
                      className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground hover:text-foreground hover:border-primary/40"
                      title="Reschedule"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Reschedule Form */}
                {isRescheduling && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
                        Date
                      </label>
                      <input
                        type="date"
                        value={newDate}
                        onChange={(e) => setNewDate(e.target.value)}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:border-ring focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
                        Time
                      </label>
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
                      {isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
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
