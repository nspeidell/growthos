"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Clock,
  Send,
  AlertCircle,
} from "lucide-react";
import {
  getPostsByDateRange,
  getConnectedAccountsForCalendar,
} from "./actions";
import { DayDetail } from "./day-detail";
import type { CalendarPost, ConnectedAccountOption } from "./actions";

// ─── Platform Config ──────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-500",
  x: "bg-sky-500",
  facebook: "bg-blue-600",
  reddit: "bg-orange-500",
  youtube: "bg-red-600",
  linkedin: "bg-blue-700",
  tiktok: "bg-fuchsia-500",
  threads: "bg-neutral-700",
  pinterest: "bg-red-500",
};

const PLATFORM_FILTER_COLORS: Record<string, string> = {
  instagram: "bg-pink-500/10 text-pink-600 border-pink-500/30",
  x: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  facebook: "bg-blue-600/10 text-blue-700 border-blue-600/30",
  reddit: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  youtube: "bg-red-600/10 text-red-700 border-red-600/30",
  linkedin: "bg-blue-700/10 text-blue-800 border-blue-700/30",
  tiktok: "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/30",
  threads: "bg-neutral-500/10 text-neutral-600 border-neutral-500/30",
  pinterest: "bg-red-500/10 text-red-600 border-red-500/30",
};

const STATUS_OPACITY: Record<string, string> = {
  draft: "opacity-40",
  queued: "opacity-70",
  approved: "opacity-100",
  published: "opacity-100",
  failed: "opacity-50 ring-1 ring-destructive",
  cancelled: "opacity-30",
  publishing: "opacity-90 animate-pulse",
};

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function getMonthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
function getFirstDayOfWeek(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isToday(date: Date) {
  return isSameDay(date, new Date());
}
function getWeekStart(date: Date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
function getWeekEnd(date: Date) {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type ViewMode = "month" | "week";

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ posts }: { posts: CalendarPost[] }) {
  const total = posts.length;
  const published = posts.filter((p) => p.postStatus === "published").length;
  const scheduled = posts.filter(
    (p) => p.postStatus === "queued" || p.postStatus === "approved"
  ).length;
  const failed = posts.filter((p) => p.postStatus === "failed").length;

  return (
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: "Total", value: total, icon: <Clock className="w-3.5 h-3.5" />, color: "text-foreground" },
        { label: "Scheduled", value: scheduled, icon: <Send className="w-3.5 h-3.5" />, color: "text-amber-600" },
        { label: "Published", value: published, icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-green-600" },
        { label: "Failed", value: failed, icon: <AlertCircle className="w-3.5 h-3.5" />, color: "text-destructive" },
      ].map(({ label, value, icon, color }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-3">
          <div className={`flex items-center gap-1.5 mb-1 ${color} opacity-60`}>
            {icon}
            <span className="text-xs">{label}</span>
          </div>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [allPosts, setAllPosts] = useState<CalendarPost[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [activePlatforms, setActivePlatforms] = useState<Set<string>>(new Set());

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const start = viewMode === "month" ? getMonthStart(currentDate) : getWeekStart(currentDate);
    const end = viewMode === "month" ? getMonthEnd(currentDate) : getWeekEnd(currentDate);

    const result = await getPostsByDateRange(start.getTime(), end.getTime());
    if (result.success && result.data) setAllPosts(result.data);
    setLoading(false);
  }, [currentDate, viewMode]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Load connected accounts once
  useEffect(() => {
    getConnectedAccountsForCalendar().then((result) => {
      if (result.success && result.data) setAccounts(result.data);
    });
  }, []);

  // Derive unique platforms in the current view
  const platformsInView = [...new Set(allPosts.map((p) => p.platform))].sort();

  // Filtered posts
  const posts =
    activePlatforms.size === 0
      ? allPosts
      : allPosts.filter((p) => activePlatforms.has(p.platform));

  function togglePlatform(platform: string) {
    setActivePlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  function navigate(direction: -1 | 1) {
    setSelectedDay(null);
    if (viewMode === "month") {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + direction * 7);
      setCurrentDate(d);
    }
  }

  function goToToday() {
    setCurrentDate(new Date());
    setSelectedDay(new Date());
  }

  function getPostsForDay(day: Date): CalendarPost[] {
    return posts.filter((p) => isSameDay(new Date(p.scheduledFor), day));
  }

  // ─── Month Grid ───────────────────────────────────────────────────────────

  function renderMonthGrid() {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfWeek(currentDate);
    const cells: (Date | null)[] = [];

    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), d));
    }

    return (
      <div className="grid grid-cols-7 gap-px rounded-xl border border-border bg-border overflow-hidden">
        {WEEKDAYS.map((day) => (
          <div key={day} className="bg-card px-2 py-2 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) {
            return <div key={`empty-${i}`} className="bg-card/50 min-h-[80px] md:min-h-[100px]" />;
          }
          const dayPosts = getPostsForDay(date);
          const isSelected = selectedDay && isSameDay(date, selectedDay);
          const today = isToday(date);

          return (
            <button
              key={date.toISOString()}
              onClick={() => setSelectedDay(date)}
              className={`relative bg-card min-h-[80px] md:min-h-[100px] p-1.5 text-left transition-colors hover:bg-accent/50 ${
                isSelected ? "ring-2 ring-inset ring-primary" : ""
              }`}
            >
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  today ? "bg-primary text-primary-foreground" : "text-foreground"
                }`}
              >
                {date.getDate()}
              </span>
              {dayPosts.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {dayPosts.slice(0, 5).map((p) => (
                    <span
                      key={p.id}
                      className={`h-2 w-2 rounded-full ${PLATFORM_COLORS[p.platform] ?? "bg-muted-foreground"} ${STATUS_OPACITY[p.postStatus] ?? ""}`}
                      title={`${p.platform} — ${p.postStatus}`}
                    />
                  ))}
                  {dayPosts.length > 5 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayPosts.length - 5}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // ─── Week Strip ───────────────────────────────────────────────────────────

  function renderWeekStrip() {
    const start = getWeekStart(currentDate);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }

    return (
      <div className="grid grid-cols-7 gap-2">
        {days.map((date) => {
          const dayPosts = getPostsForDay(date);
          const isSelected = selectedDay && isSameDay(date, selectedDay);
          const today = isToday(date);

          return (
            <button
              key={date.toISOString()}
              onClick={() => setSelectedDay(date)}
              className={`rounded-xl border p-3 text-center transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <p className="text-xs text-muted-foreground">{WEEKDAYS[date.getDay()]}</p>
              <p className={`mt-1 text-lg font-semibold ${today ? "text-primary" : "text-foreground"}`}>
                {date.getDate()}
              </p>
              {dayPosts.length > 0 && (
                <div className="mt-2 flex justify-center gap-0.5 flex-wrap">
                  {dayPosts.slice(0, 4).map((p) => (
                    <span
                      key={p.id}
                      className={`h-2 w-2 rounded-full ${PLATFORM_COLORS[p.platform] ?? "bg-muted-foreground"}`}
                    />
                  ))}
                  {dayPosts.length > 4 && (
                    <span className="text-[9px] text-muted-foreground">+{dayPosts.length - 4}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="text-lg font-semibold text-foreground min-w-[180px] text-center">
            {viewMode === "month"
              ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
              : `Week of ${currentDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
          </h2>
          <button
            onClick={() => navigate(1)}
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Today
          </button>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {!loading && <StatsBar posts={allPosts} />}

      {/* Platform Filters */}
      {platformsInView.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {platformsInView.map((platform) => {
            const active = activePlatforms.has(platform);
            const colorClass = PLATFORM_FILTER_COLORS[platform] ?? "bg-muted/10 text-muted-foreground border-border";
            return (
              <button
                key={platform}
                onClick={() => togglePlatform(platform)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all capitalize ${
                  active
                    ? colorClass
                    : "border-border bg-card text-muted-foreground opacity-50"
                } ${!active && activePlatforms.size > 0 ? "opacity-40" : ""}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${PLATFORM_COLORS[platform] ?? "bg-muted-foreground"}`}
                />
                {platform}
              </button>
            );
          })}
          {activePlatforms.size > 0 && (
            <button
              onClick={() => setActivePlatforms(new Set())}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Calendar */}
      {!loading && (
        <>
          {viewMode === "month" ? renderMonthGrid() : renderWeekStrip()}

          {/* Platform Legend */}
          <div className="flex flex-wrap gap-3 pt-1">
            {Object.entries(PLATFORM_COLORS)
              .filter(([p]) => platformsInView.includes(p))
              .map(([platform, color]) => (
                <div key={platform} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                  <span className="text-xs text-muted-foreground capitalize">{platform}</span>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Day Detail */}
      {selectedDay && (
        <DayDetail
          date={selectedDay}
          posts={getPostsForDay(selectedDay)}
          accounts={accounts}
          onRefresh={loadPosts}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
