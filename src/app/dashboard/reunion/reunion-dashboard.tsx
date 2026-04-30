"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Users,
  Plus,
  Send,
  Trash2,
  RefreshCw,
  Clock,
  Play,
  Pause,
  CheckCircle2,
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

// ─── Constants ───

const TYPE_META: Record<
  string,
  { label: string; icon: React.ReactNode; color: string }
> = {
  push: {
    label: "Push Notification",
    icon: <Bell className="w-3.5 h-3.5" />,
    color: "bg-blue-100 text-blue-800",
  },
  invite_reminder: {
    label: "Invite Reminder",
    icon: <UserPlus className="w-3.5 h-3.5" />,
    color: "bg-purple-100 text-purple-800",
  },
  reactivation: {
    label: "Reactivation",
    icon: <UserX className="w-3.5 h-3.5" />,
    color: "bg-orange-100 text-orange-800",
  },
  announcement: {
    label: "Announcement",
    icon: <Megaphone className="w-3.5 h-3.5" />,
    color: "bg-green-100 text-green-800",
  },
  onboarding: {
    label: "Onboarding",
    icon: <Sparkles className="w-3.5 h-3.5" />,
    color: "bg-indigo-100 text-indigo-800",
  },
};

const STATUS_BADGES: Record<
  string,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700" },
  scheduled: { label: "Scheduled", className: "bg-yellow-100 text-yellow-800" },
  active: { label: "Active", className: "bg-green-100 text-green-800" },
  paused: { label: "Paused", className: "bg-orange-100 text-orange-800" },
  completed: { label: "Completed", className: "bg-blue-100 text-blue-800" },
};

// ─── Component ───

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
    if (campaignsRes.success && campaignsRes.data) {
      setCampaigns(campaignsRes.data);
    }
    if (statsRes.success && statsRes.data) {
      setUserStats(statsRes.data);
    }
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
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* User Stats Cards */}
      {userStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Users className="w-3.5 h-3.5" /> Total Users
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {userStats.totalUsers.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <TrendingUp className="w-3.5 h-3.5" /> Active (30d)
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {userStats.activeUsers30d.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <UserPlus className="w-3.5 h-3.5" /> New (7d)
            </div>
            <p className="text-2xl font-bold text-green-600">
              +{userStats.newUsers7d.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <UserX className="w-3.5 h-3.5" /> Churn Rate
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {(userStats.churnRate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setActiveTab("campaigns")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "campaigns"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab("create")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === "create"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <Plus className="w-4 h-4" />
          New Campaign
        </button>
      </div>

      {/* Create Campaign Form */}
      {activeTab === "create" && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Create Reunion Campaign
          </h3>
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <form action={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campaign Name
                </label>
                <input
                  name="name"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Weekend Family Challenge Reminder"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  name="type"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="push">Push Notification</option>
                  <option value="invite_reminder">Invite Reminder</option>
                  <option value="reactivation">Reactivation</option>
                  <option value="announcement">Announcement</option>
                  <option value="onboarding">Onboarding</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Segment
                </label>
                <select
                  name="segmentType"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Users</option>
                  <option value="active">Active Users</option>
                  <option value="inactive">Inactive Users</option>
                  <option value="new">New Users</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Inactive Days (for reactivation)
                </label>
                <input
                  name="inactiveDays"
                  type="number"
                  min="1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="30"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title
              </label>
              <input
                name="title"
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Notification title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Body
              </label>
              <textarea
                name="body"
                required
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Message body..."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CTA Text
                </label>
                <input
                  name="cta"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Open App"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Deeplink
                </label>
                <input
                  name="deeplink"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="reunion://challenges/weekly"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Campaign
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Campaign List */}
      {activeTab === "campaigns" && (
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-medium text-gray-500">
                No Reunion campaigns yet
              </p>
              <button
                onClick={() => setActiveTab("create")}
                className="mt-2 text-sm text-blue-600 hover:text-blue-700"
              >
                Create your first campaign
              </button>
            </div>
          ) : (
            campaigns.map((campaign) => {
              const typeInfo = TYPE_META[campaign.type] ?? {
                label: campaign.type,
                icon: <Bell className="w-3.5 h-3.5" />,
                color: "bg-gray-100 text-gray-700",
              };
              const statusInfo = STATUS_BADGES[campaign.campaignStatus] ?? {
                label: campaign.campaignStatus,
                className: "bg-gray-100 text-gray-600",
              };

              const content = (() => {
                try {
                  return JSON.parse(campaign.content ?? "{}") as {
                    title?: string;
                    body?: string;
                  };
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
                <div
                  key={campaign.id}
                  className="rounded-xl border border-gray-200 bg-white p-5"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeInfo.color}`}
                        >
                          {typeInfo.icon}
                          {typeInfo.label}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.className}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="font-medium text-gray-900">
                        {campaign.name}
                      </p>
                      {content.title && (
                        <p className="text-sm text-gray-600 mt-1">
                          {content.title}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 ml-4">
                      {campaign.campaignStatus === "draft" && (
                        <button
                          onClick={() => handleSend(campaign.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" /> Send
                        </button>
                      )}
                      {(campaign.campaignStatus === "active" ||
                        campaign.campaignStatus === "completed") && (
                        <button
                          onClick={() => handleSync(campaign.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${
                              isPending ? "animate-spin" : ""
                            }`}
                          />
                          Sync
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(campaign.id)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Metrics */}
                  {campaign.sentCount != null && campaign.sentCount > 0 && (
                    <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500">Sent</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {campaign.sentCount.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Opened</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {(campaign.openedCount ?? 0).toLocaleString()}
                          <span className="text-xs font-normal text-gray-400 ml-1">
                            ({openRate.toFixed(1)}%)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Clicked</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {(campaign.clickedCount ?? 0).toLocaleString()}
                          <span className="text-xs font-normal text-gray-400 ml-1">
                            ({clickRate.toFixed(1)}%)
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Open Rate</p>
                        <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-500"
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
