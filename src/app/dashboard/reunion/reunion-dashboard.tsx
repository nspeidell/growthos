"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Users,
  Plus,
  Send,
  Trash2,
  RefreshCw,
  Loader2,
  Bell,
  UserPlus,
  UserX,
  Megaphone,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  listReunionCampaigns,
  createReunionCampaign,
  sendReunionCampaign,
  syncReunionCampaignStats,
  deleteReunionCampaign,
  getReunionUserStats,
} from "./actions";
import type { ReunionCampaign } from "@/lib/db/schema";
import type { ReunionUserStats } from "@/lib/reunion/client";

// ─── Constants ───────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  push: { label: "Push", icon: <Bell className="w-3.5 h-3.5" />, color: "bg-primary/10 text-primary" },
  invite_reminder: { label: "Invite", icon: <UserPlus className="w-3.5 h-3.5" />, color: "bg-purple-500/10 text-purple-400" },
  reactivation: { label: "Reactivation", icon: <UserX className="w-3.5 h-3.5" />, color: "bg-orange-500/10 text-orange-400" },
  announcement: { label: "Announcement", icon: <Megaphone className="w-3.5 h-3.5" />, color: "bg-emerald-500/10 text-emerald-400" },
  onboarding: { label: "Onboarding", icon: <Sparkles className="w-3.5 h-3.5" />, color: "bg-indigo-500/10 text-indigo-400" },
};

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "Scheduled", className: "bg-amber-500/10 text-amber-400" },
  active: { label: "Active", className: "bg-emerald-500/10 text-emerald-400" },
  paused: { label: "Paused", className: "bg-orange-500/10 text-orange-400" },
  completed: { label: "Completed", className: "bg-primary/10 text-primary" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReunionDashboard() {
  const [campaigns, setCampaigns] = useState<ReunionCampaign[]>([]);
  const [userStats, setUserStats] = useState<ReunionUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"campaigns" | "create">("campaigns");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [campaignsRes, statsRes] = await Promise.all([
      listReunionCampaigns(),
      getReunionUserStats(),
    ]);
    if (campaignsRes.success && campaignsRes.data) setCampaigns(campaignsRes.data);
    if (statsRes.success && statsRes.data) setUserStats(statsRes.data);
    setLoading(false);
  }

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createReunionCampaign(formData);
      if (result.success) {
        setActiveTab("campaigns");
        await loadData();
      } else {
        setError(result.error ?? "Failed to create campaign");
      }
    });
  }

  function handleSend(campaignId: string) {
    if (!confirm("Send this campaign? This will push to Reunion users.")) return;
    startTransition(async () => {
      const result = await sendReunionCampaign(campaignId);
      if (result.success) await loadData();
    });
  }

  function handleSync(campaignId: string) {
    startTransition(async () => {
      await syncReunionCampaignStats(campaignId);
      await loadData();
    });
  }

  function handleDelete(campaignId: string) {
    if (!confirm("Delete this campaign?")) return;
    startTransition(async () => {
      const result = await deleteReunionCampaign(campaignId);
      if (result.success) await loadData();
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── User Stats ──────────────────────────────────────────────── */}
      {userStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Users className="w-3.5 h-3.5" /> Total Users
            </div>
            <p className="text-2xl font-bold text-foreground">
              {userStats.totalUsers.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <TrendingUp className="w-3.5 h-3.5" /> Active (30d)
            </div>
            <p className="text-2xl font-bold text-foreground">
              {userStats.activeUsers30d.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <UserPlus className="w-3.5 h-3.5" /> New (7d)
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              +{userStats.newUsers7d.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <UserX className="w-3.5 h-3.5" /> Churn Rate
            </div>
            <p className="text-2xl font-bold text-foreground">
              {(userStats.churnRate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* ─── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "campaigns"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab("create")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* ─── Create Form ──────────────────────────────────────────────── */}
      {activeTab === "create" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Create Reunion Campaign</h3>
          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <form action={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Campaign Name</label>
                <input
                  name="name"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Weekend Family Challenge Reminder"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Type</label>
                <select
                  name="type"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="push">Push Notification</option>
                  <option value="invite_reminder">Invite Reminder</option>
                  <option value="reactivation">Reactivation</option>
                  <option value="announcement">Announcement</option>
                  <option value="onboarding">Onboarding</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Segment</label>
                <select
                  name="segmentType"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                >
                  <option value="all">All Users</option>
                  <option value="active">Active Users</option>
                  <option value="inactive">Inactive Users</option>
                  <option value="new">New Users</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Inactive Days (reactivation)</label>
                <input
                  name="inactiveDays"
                  type="number"
                  min="1"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="30"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Title</label>
              <input
                name="title"
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Notification title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Body</label>
              <textarea
                name="body"
                required
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Message body..."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">CTA Text</label>
                <input
                  name="cta"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Open App"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Deeplink</label>
                <input
                  name="deeplink"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="reunion://challenges/weekly"
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
                Create Campaign
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Campaign List ────────────────────────────────────────────── */}
      {activeTab === "campaigns" && (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No Reunion campaigns yet</p>
              <button
                onClick={() => setActiveTab("create")}
                className="mt-2 text-sm text-primary"
              >
                Create your first campaign
              </button>
            </div>
          ) : (
            campaigns.map((campaign) => {
              const typeInfo = TYPE_META[campaign.type] ?? {
                label: campaign.type,
                icon: <Bell className="w-3.5 h-3.5" />,
                color: "bg-muted text-muted-foreground",
              };
              const statusInfo = STATUS_BADGES[campaign.campaignStatus] ?? {
                label: campaign.campaignStatus,
                className: "bg-muted text-muted-foreground",
              };

              const content = (() => {
                try {
                  return JSON.parse(campaign.content ?? "{}") as { title?: string; body?: string };
                } catch {
                  return {};
                }
              })();

              const openRate =
                campaign.sentCount && campaign.sentCount > 0
                  ? ((campaign.openedCount ?? 0) / campaign.sentCount) * 100
                  : 0;

              const clickRate =
                campaign.sentCount && campaign.sentCount > 0
                  ? ((campaign.clickedCount ?? 0) / campaign.sentCount) * 100
                  : 0;

              return (
                <div key={campaign.id} className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeInfo.color}`}>
                          {typeInfo.icon}
                          {typeInfo.label}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="font-medium text-foreground">{campaign.name}</p>
                      {content.title && (
                        <p className="text-sm text-muted-foreground mt-1">{content.title}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {campaign.campaignStatus === "draft" && (
                        <button
                          onClick={() => handleSend(campaign.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" /> Send
                        </button>
                      )}
                      {(campaign.campaignStatus === "active" || campaign.campaignStatus === "completed") && (
                        <button
                          onClick={() => handleSync(campaign.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
                          Sync
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(campaign.id)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metrics */}
                  {campaign.sentCount != null && campaign.sentCount > 0 && (
                    <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                      <div>
                        <p className="text-xs text-muted-foreground">Sent</p>
                        <p className="text-sm font-semibold text-foreground">
                          {campaign.sentCount.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Opened</p>
                        <p className="text-sm font-semibold text-foreground">
                          {(campaign.openedCount ?? 0).toLocaleString()}
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            ({openRate.toFixed(1)}%)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Clicked</p>
                        <p className="text-sm font-semibold text-foreground">
                          {(campaign.clickedCount ?? 0).toLocaleString()}
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            ({clickRate.toFixed(1)}%)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Open Rate</p>
                        <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(openRate, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
