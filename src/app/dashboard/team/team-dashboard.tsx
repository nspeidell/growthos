"use client";

import { useState, useEffect, useTransition } from "react";
import {
  UsersRound,
  Plus,
  Trash2,
  Loader2,
  Shield,
  Crown,
  UserPlus,
  ChevronDown,
} from "lucide-react";
import {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
} from "./actions";
import type { TeamMember } from "./actions";

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof Crown }> = {
  owner: { label: "Owner", color: "bg-amber-500/10 text-amber-600", icon: Crown },
  admin: { label: "Admin", color: "bg-primary/10 text-primary", icon: Shield },
  marketer: { label: "Marketer", color: "bg-pink-500/10 text-pink-600", icon: UsersRound },
  analyst: { label: "Analyst", color: "bg-sky-500/10 text-sky-600", icon: UsersRound },
  content_manager: { label: "Content Mgr", color: "bg-green-500/10 text-green-600", icon: UsersRound },
  viewer: { label: "Viewer", color: "bg-muted text-muted-foreground", icon: UsersRound },
};

const ASSIGNABLE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "marketer", label: "Marketer" },
  { value: "analyst", label: "Analyst" },
  { value: "content_manager", label: "Content Manager" },
  { value: "viewer", label: "Viewer" },
];

export default function TeamDashboard() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [editingRole, setEditingRole] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const result = await listMembers();
    if (result.success && result.data) {
      setMembers(result.data);
    }
    setLoading(false);
  }

  function handleInvite(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(formData);
      if (result.success) {
        setShowInvite(false);
        await load();
      } else {
        setError(result.error ?? "Failed to invite member");
      }
    });
  }

  function handleRoleChange(memberId: string, newRole: string) {
    setError(null);
    const fd = new FormData();
    fd.set("memberId", memberId);
    fd.set("role", newRole);
    startTransition(async () => {
      const result = await updateMemberRole(fd);
      if (result.success) {
        setEditingRole(null);
        await load();
      } else {
        setError(result.error ?? "Failed to update role");
      }
    });
  }

  function handleRemove(memberId: string, name: string) {
    if (!confirm(`Remove ${name} from this workspace?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeMember(memberId);
      if (result.success) {
        await load();
      } else {
        setError(result.error ?? "Failed to remove member");
      }
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Members</p>
          <p className="mt-1 text-xl font-bold text-foreground">{members.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Admins</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {members.filter((m) => m.role === "admin" || m.role === "owner").length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Marketers</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {members.filter((m) => m.role === "marketer").length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Viewers</p>
          <p className="mt-1 text-xl font-bold text-foreground">
            {members.filter((m) => m.role === "viewer").length}
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <UserPlus className="h-4 w-4" /> Invite
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">
            Invite a team member
          </h3>
          <form action={handleInvite} className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Email
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="colleague@company.com"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="w-44">
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Role
              </label>
              <select
                name="role"
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Send Invite
              </button>
              <button
                type="button"
                onClick={() => setShowInvite(false)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Members List */}
      <div className="space-y-2">
        {members.map((member) => {
          const roleConfig = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.viewer!;
          const isOwner = member.role === "owner";
          const isEditing = editingRole === member.memberId;

          return (
            <div
              key={member.memberId}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {member.avatarUrl ? (
                  <img
                    src={member.avatarUrl}
                    alt={member.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  member.name.charAt(0).toUpperCase()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {member.name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {member.email}
                </p>
              </div>

              {/* Role Badge / Editor */}
              <div className="relative">
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <select
                      defaultValue={member.role}
                      onChange={(e) =>
                        handleRoleChange(member.memberId, e.target.value)
                      }
                      className="rounded-md border border-input bg-background px-2 py-1 text-xs focus:border-ring focus:ring-1 focus:ring-ring"
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setEditingRole(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => !isOwner && setEditingRole(member.memberId)}
                    disabled={isOwner}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${roleConfig.color} ${
                      !isOwner ? "cursor-pointer hover:ring-1 hover:ring-primary/30" : ""
                    }`}
                    title={isOwner ? "Owner role cannot be changed" : "Click to change role"}
                  >
                    {roleConfig.label}
                    {!isOwner && <ChevronDown className="h-3 w-3" />}
                  </button>
                )}
              </div>

              {/* Joined */}
              <span className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
                {new Date(member.joinedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>

              {/* Remove */}
              {!isOwner && (
                <button
                  onClick={() => handleRemove(member.memberId, member.name)}
                  disabled={isPending}
                  className="shrink-0 rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  title="Remove member"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {members.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-12 text-center">
          <UsersRound className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            No team members yet
          </p>
          <button
            onClick={() => setShowInvite(true)}
            className="mt-2 text-sm text-primary"
          >
            Invite your first team member
          </button>
        </div>
      )}
    </div>
  );
}
