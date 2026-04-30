export const runtime = 'edge';

import { requireAuth } from "@/lib/auth/middleware";
import WorkspacesManager from "./workspaces-manager";

export default async function WorkspacesPage() {
  await requireAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workspaces</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your brands and businesses. Each workspace has its own content, analytics, and team.
        </p>
      </div>

      <WorkspacesManager />
    </div>
  );
}
