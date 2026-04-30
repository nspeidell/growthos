export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import CommunitiesDashboard from "./communities-dashboard";

export default async function CommunitiesPage() {
  await requirePermission("content:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Communities</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage Facebook Groups, Discord servers, and community engagement.
        </p>
      </div>

      <CommunitiesDashboard />
    </div>
  );
}
