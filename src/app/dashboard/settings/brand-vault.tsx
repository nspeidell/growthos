"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Palette,
  Type,
  Users,
  Target,
  Save,
  Loader2,
  Plus,
  Trash2,
  Shield,
  Unplug,
  RefreshCw,
} from "lucide-react";
import {
  getBrandProfile,
  upsertBrandProfile,
  getBrandColors,
  addBrandColor,
  deleteBrandColor,
} from "./brand/actions";
import { listConnectedAccounts } from "../publisher/actions";
import type { BrandProfile, BrandColor, ConnectedAccount } from "@/lib/db/schema";

type Tab = "profile" | "colors" | "guidelines" | "accounts";

// ─── Platform metadata ────────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { label: string; color: string; icon: string }> = {
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

// ─── Root ────────────────────────────────────────────────────────────────────

export default function BrandVault() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState<BrandProfile | null>(null);
  const [colors, setColors] = useState<BrandColor[]>([]);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<"success" | "error">("success");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [profileResult, colorsResult, acctResult] = await Promise.all([
        getBrandProfile(),
        getBrandColors(),
        listConnectedAccounts(),
      ]);
      if (profileResult.success) setProfile(profileResult.data);
      if (colorsResult.success) setColors(colorsResult.data);
      if (acctResult.success) setAccounts(acctResult.data);
      setLoading(false);
    }
    loadData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const username = params.get("username");
    const error = params.get("error");
    if (connected && username) {
      showNotification(`Connected ${connected} as @${username}`, "success");
      setActiveTab("accounts");
      window.history.replaceState({}, "", "/dashboard/settings");
    } else if (error) {
      showNotification(error, "error");
      setActiveTab("accounts");
      window.history.replaceState({}, "", "/dashboard/settings");
    }
  }, []);

  const showNotification = (msg: string, type: "success" | "error" = "success") => {
    setNotification(msg);
    setNotificationType(type);
    setTimeout(() => setNotification(null), 4000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const TABS = [
    { key: "profile" as const, label: "Identity", icon: Target },
    { key: "colors" as const, label: "Colors", icon: Palette },
    { key: "guidelines" as const, label: "Voice & Guidelines", icon: Type },
    { key: "accounts" as const, label: "Accounts", icon: Unplug },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Notification ─────────────────────────────────────────────── */}
      {notification && (
        <div className={`rounded-lg p-4 text-sm flex items-center justify-between ${
          notificationType === "error"
            ? "bg-destructive/10 border border-destructive/20 text-destructive"
            : "bg-primary/10 border border-primary/20 text-primary"
        }`}>
          <span>{notification}</span>
          <button onClick={() => setNotification(null)} className="ml-4 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Brand Vault
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your brand identity, voice, and visual guidelines — used by AI across all content generation.
        </p>
      </div>

      {/* ─── Tabs ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ──────────────────────────────────────────────── */}
      {activeTab === "profile" && (
        <ProfileTab
          profile={profile}
          onSave={(updated) => { setProfile(updated); showNotification("Brand profile saved"); }}
          onError={(msg) => showNotification(msg, "error")}
        />
      )}
      {activeTab === "colors" && (
        <ColorsTab
          colors={colors}
          hasProfile={!!profile}
          onAdd={(color) => { setColors((prev) => [...prev, color]); showNotification("Color added"); }}
          onDelete={(id) => { setColors((prev) => prev.filter((c) => c.id !== id)); showNotification("Color removed"); }}
        />
      )}
      {activeTab === "guidelines" && (
        <GuidelinesTab
          profile={profile}
          onSave={(updated) => { setProfile(updated); showNotification("Guidelines saved"); }}
          onError={(msg) => showNotification(msg, "error")}
        />
      )}
      {activeTab === "accounts" && (
        <AccountsTab
          accounts={accounts}
          onRefresh={async () => {
            const result = await listConnectedAccounts();
            if (result.success) setAccounts(result.data);
          }}
        />
      )}
    </div>
  );
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────

function ProfileTab({
  profile,
  onSave,
  onError,
}: {
  profile: BrandProfile | null;
  onSave: (profile: BrandProfile) => void;
  onError: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await upsertBrandProfile(formData);
      if (result.success) onSave(result.data);
      else onError(result.error || "Failed to save brand profile");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <h2 className="text-lg font-semibold text-foreground">Brand Identity</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Brand Name *</label>
          <input
            name="brandName"
            type="text"
            required
            defaultValue={profile?.brandName ?? ""}
            placeholder="e.g., Reunion"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Tagline</label>
          <input
            name="tagline"
            type="text"
            defaultValue={profile?.tagline ?? ""}
            placeholder="e.g., Bringing families closer together"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Mission *</label>
          <textarea
            name="mission"
            required
            rows={3}
            defaultValue={profile?.mission ?? ""}
            placeholder="What is your brand's core purpose? What problem do you solve?"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Vision</label>
          <textarea
            name="vision"
            rows={2}
            defaultValue={profile?.vision ?? ""}
            placeholder="Where is your brand headed? What's the long-term goal?"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            <Users className="w-4 h-4 inline mr-1" />
            Target Audience *
          </label>
          <textarea
            name="audience"
            required
            rows={3}
            defaultValue={profile?.audience ?? ""}
            placeholder="Describe your ideal customer. Include demographics, interests, pain points."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">
            This helps AI tailor content to resonate with your audience.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Keywords</label>
          <input
            name="keywords"
            type="text"
            defaultValue={profile?.keywords ?? ""}
            placeholder="family, reunion, connection, challenge, togetherness"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">Comma-separated keywords that define your brand.</p>
        </div>

        <input type="hidden" name="tone" value={profile?.tone ?? "professional, warm, authentic"} />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Brand Profile
      </button>
    </form>
  );
}

// ─── Colors Tab ───────────────────────────────────────────────────────────────

function ColorsTab({
  colors,
  hasProfile,
  onAdd,
  onDelete,
}: {
  colors: BrandColor[];
  hasProfile: boolean;
  onAdd: (color: BrandColor) => void;
  onDelete: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);

  if (!hasProfile) {
    return (
      <div className="text-center py-16">
        <Palette className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground">Set up your brand profile first</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Go to the Identity tab to create your brand profile before adding colors.
        </p>
      </div>
    );
  }

  const handleAdd = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await addBrandColor(formData);
      if (result.success) {
        onAdd(result.data);
        form.reset();
        setShowForm(false);
      }
    });
  };

  const handleDelete = (colorId: string) => {
    startTransition(async () => {
      const result = await deleteBrandColor(colorId);
      if (result.success) onDelete(colorId);
    });
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Brand Colors</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          <Plus className="w-3 h-3" />
          Add Color
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Label *</label>
              <input
                name="label"
                type="text"
                required
                placeholder="e.g., Primary Blue"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Hex Color *</label>
              <input
                name="hex"
                type="text"
                required
                pattern="^#[0-9A-Fa-f]{6}$"
                placeholder="#3B82F6"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Usage</label>
            <input
              name="usage"
              type="text"
              placeholder="e.g., Headings, CTA buttons, links"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? "Adding..." : "Add Color"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-xs font-medium text-muted-foreground border border-border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {colors.length === 0 ? (
        <div className="text-center py-12 rounded-lg border-2 border-dashed border-border">
          <Palette className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No brand colors yet. Add your first color above.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {colors.map((color) => (
            <div key={color.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-lg border border-border shadow-inner"
                  style={{ backgroundColor: color.hex }}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">{color.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{color.hex}</p>
                  {color.usage && <p className="text-xs text-muted-foreground mt-0.5">{color.usage}</p>}
                </div>
              </div>
              <button
                onClick={() => handleDelete(color.id)}
                disabled={isPending}
                className="p-2 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Guidelines Tab ───────────────────────────────────────────────────────────

function GuidelinesTab({
  profile,
  onSave,
  onError,
}: {
  profile: BrandProfile | null;
  onSave: (profile: BrandProfile) => void;
  onError: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (!profile) {
    return (
      <div className="text-center py-16">
        <Type className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground">Set up your brand profile first</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Go to the Identity tab to create your brand profile before setting guidelines.
        </p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("brandName", profile.brandName);
    formData.set("mission", profile.mission);
    formData.set("audience", profile.audience);
    if (profile.tagline) formData.set("tagline", profile.tagline);
    if (profile.vision) formData.set("vision", profile.vision);
    if (profile.keywords) formData.set("keywords", profile.keywords);
    startTransition(async () => {
      const result = await upsertBrandProfile(formData);
      if (result.success) onSave(result.data);
      else onError(result.error || "Failed to save guidelines");
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <h2 className="text-lg font-semibold text-foreground">Voice & Content Guidelines</h2>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Brand Tone *</label>
          <textarea
            name="tone"
            required
            rows={3}
            defaultValue={profile.tone}
            placeholder="Describe your brand's voice. Examples: professional yet warm, casual and witty, authoritative and educational"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">
            AI will match this tone when generating content for your brand.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Content Guidelines</label>
          <textarea
            name="guidelines"
            rows={6}
            defaultValue={profile.guidelines ?? ""}
            placeholder={"Things to include:\n- Words or phrases to always use\n- Words or phrases to never use\n- Topics to focus on\n- Topics to avoid\n- Formatting preferences\n- Hashtag style"}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-1">
            These rules guide every piece of AI-generated content. Be specific.
          </p>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save Guidelines
      </button>
    </form>
  );
}

// ─── Accounts Tab ─────────────────────────────────────────────────────────────

function AccountsTab({
  accounts,
  onRefresh,
}: {
  accounts: ConnectedAccount[];
  onRefresh: () => void;
}) {
  const platforms = Object.entries(PLATFORM_META);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Connected Platforms</h2>
        <button
          onClick={onRefresh}
          className="text-xs text-primary flex items-center gap-1 hover:opacity-80"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Connect your social media accounts to publish content directly from GrowthOS.
      </p>

      <div className="grid gap-3">
        {platforms.map(([key, meta]) => {
          const connected = accounts.find((a) => a.platform === key);

          return (
            <div key={key} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <span className={`w-10 h-10 rounded-full ${meta.color} flex items-center justify-center text-lg text-white`}>
                  {meta.icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{meta.label}</p>
                  {connected ? (
                    <p className="text-xs text-muted-foreground">
                      @{connected.platformUsername}
                      {connected.accountStatus !== "active" && (
                        <span className="ml-1 text-amber-400">({connected.accountStatus})</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>

              {connected ? (
                <div className="flex items-center gap-2">
                  {(connected.accountStatus === "expired" || connected.accountStatus === "revoked") && (
                    <a
                      href={`/api/social/connect?platform=${key}`}
                      className="px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-400 rounded-md hover:bg-amber-500/20"
                    >
                      Reconnect
                    </a>
                  )}
                  <button
                    onClick={async () => {
                      await fetch("/api/social/disconnect", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ accountId: connected.id }),
                      });
                      onRefresh();
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-destructive border border-destructive/20 rounded-md hover:bg-destructive/10"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <a
                  href={`/api/social/connect?platform=${key}`}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Connect
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
