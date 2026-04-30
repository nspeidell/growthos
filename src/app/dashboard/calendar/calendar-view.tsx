"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Loader2,
} from "lucide-react";
import { getPostsByDateRange } from "./actions";
import { DayDetail } from "./day-detail";
import type { CalendarPost } from "./actions";

// ─── Platform Colors ───

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "bg-pink-500",
  x: "bg-sky-500",
  facebook: "bg-blue-600",
  reddit: "bg-orange-500",
  youtube: "bg-red-600",
};

const STATUS_OPACITY: Record<string, string> = {
  draft: "opacity-40",
  queued: "opacity-70",
  approved: "opacity-100",
  published: "opacity-100",
  failed: "opacity-50 ring-1 ring-destructive",
  cancelled: "opacity-30 line-through",
  publishing: "opacity-90 animate-pulse",
};

// ─── Helpers ───

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getDaysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getFirstDayOfWeek(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ─── Component ───

type ViewMode = "month" | "week";

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [posts, setPosts] = useState<CalendarPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const start = viewMode === "month"
      ? getMonthStart(currentDate)
      : getWeekStart(currentDate);
    const end = viewMode === "month"
      ? getMonthEnd(currentDate)
      : getWeekEnd(currentDate);

    const result = await getPostsByDateRange(start.getTime(), end.getTime());
    if (result.success && result.data) {
      setPosts(result.data);
    }
    setLoading(false);
  }, [currentDate, viewMode]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  function navigate(direction: -1 | 1) {
    setSelectedDay(null);
    if (viewMode === "month") {
      setCurrentDate(
        new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1)
      );
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

  // ─── Month Grid ───

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
        {/* Header */}
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="bg-card px-2 py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
        {/* Cells */}
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
                  today
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground"
                }`}
              >
                {date.getDate()}
              </span>
              {/* Post dots */}
              {dayPosts.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5">
                  {dayPosts.slice(0, 4).map((p) => (
                    <span
                      key={p.id}
                      className={`h-2 w-2 rounded-full ${PLATFORM_COLORS[p.platform] ?? "bg-muted-foreground"} ${STATUS_OPACITY[p.postStatus] ?? ""}`}
                      title={`${p.platform} — ${p.postStatus}`}
                    />
                  ))}
                  {dayPosts.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayPosts.length - 4}
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

  // ─── Week Strip ───

  function renderWeekStrip() {
    const start = getWeekStart(currentDate);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }

    return (
      <div className="space-y-3">
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
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <p className="text-xs text-muted-foreground">
                  {WEEKDAYS[date.getDay()]}
                </p>
                <p
                  className={`mt-1 text-lg font-semibold ${
                    today ? "text-primary" : "text-foreground"
                  }`}
                >
                  {date.getDate()}
                </p>
                {dayPosts.length > 0 && (
                  <div className="mt-2 flex justify-center gap-0.5">
                    {dayPosts.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className={`h-2 w-2 rounded-full ${PLATFORM_COLORS[p.platform] ?? "bg-muted-foreground"}`}
                      />
                    ))}
                    {dayPosts.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">
                        +{dayPosts.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Layout ───

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
                viewMode === "month"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                viewMode === "week"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Grid */}
      {!loading && (
        <>
          {viewMode === "month" ? renderMonthGrid() : renderWeekStrip()}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 pt-2">
            {Object.entries(PLATFORM_COLORS).map(([platform, color]) => (
              <div key={platform} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
                <span className="text-xs text-muted-foreground capitalize">
                  {platform}
                </span>
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
          onReschedule={loadPosts}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

// ─── Week Helpers ───

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekEnd(date: Date): Date {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
