"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Trash2,
  ArrowRightLeft,
  Loader2,
  Crown,
  Shield,
  Users,
} from "lucide-react";
import {
  listWorkspaces,
  createWorkspace,
  switchWorkspace,
  deleteWorkspace,
  type WorkspaceWithRole,
} from "./actions";

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown className="w-3.5 h-3.5 text-yellow-500" />,
  admin: <Shield className="w-3.5 h-3.5 text-blue-500" />,
  marketer: <Users className="w-3.5 h-3.5 text-green-500" />,
};

export default function WorkspacesManager() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const result = await listWorkspaces();
    if (result.success && result.data) {
      setWorkspaces(result.data);
    }
    setLoading(false);
  }

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createWorkspace(formData);
      if (result.success) {
        setShowCreate(false);
        await load();
      } else {
        setError(result.error ?? "Failed to create workspace");
      }
    });
  }

  function handleSwitch(workspaceId: string) {
    startTransition(async () => {
      const result = await switchWorkspace(workspaceId);
      if (result.success) {
        router.push("/dashboard");
        router.refresh();
      }
    });
  }

  function handleDelete(workspaceId: string, name: string) {
    if (
      !confirm(
        `Delete "${name}"? All data in this workspace will be permanently lost.`
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteWorkspace(workspaceId);
      if (result.success) await load();
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
      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">
            Create New Workspace
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
                  Workspace Name
                </label>
                <input
                  name="name"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Reunion App"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Slug
                </label>
                <input
                  name="slug"
                  required
                  pattern="^[a-z0-9-]+$"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground font-mono focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="e.g. reunion-app"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Lowercase, numbers, and hyphens only
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Workspace
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Workspace Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{ws.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {ROLE_ICONS[ws.role] ?? null}
                    <span className="text-xs text-muted-foreground capitalize">
                      {ws.role}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {ws.plan} plan
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
              <button
                onClick={() => handleSwitch(ws.id)}
                disabled={isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Switch
              </button>
              {ws.role === "owner" && (
                <button
                  onClick={() => handleDelete(ws.id, ws.name)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Add Workspace Card */}
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl border-2 border-dashed border-border bg-card/50 p-5 flex flex-col items-center justify-center gap-2 hover:border-primary/30 hover:bg-accent/50 transition-colors min-h-[140px]"
        >
          <Plus className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Add Workspace
          </span>
        </button>
      </div>
    </div>
  );
}
