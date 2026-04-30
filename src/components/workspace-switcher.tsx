"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Plus, Check, Building2 } from "lucide-react";
import {
  listWorkspaces,
  switchWorkspace,
  type WorkspaceWithRole,
} from "@/app/dashboard/workspaces/actions";

interface WorkspaceSwitcherProps {
  currentWorkspaceName: string;
}

export function WorkspaceSwitcher({
  currentWorkspaceName,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithRole[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      listWorkspaces().then((result) => {
        if (result.success && result.data) {
          setWorkspaces(result.data);
        }
      });
    }
  }, [open]);

  function handleSwitch(workspaceId: string) {
    startTransition(async () => {
      const result = await switchWorkspace(workspaceId);
      if (result.success) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
      >
        <Building2 className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1 truncate text-left">
          {currentWorkspaceName}
        </span>
        <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
            <div className="p-1">
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => handleSwitch(ws.id)}
                  disabled={isPending}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-left">{ws.name}</span>
                  {ws.name === currentWorkspaceName && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-border p-1">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/dashboard/workspaces");
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Manage Workspaces</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
