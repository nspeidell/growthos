export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import FunnelsDashboard from "./funnels-dashboard";

export default async function FunnelsPage() {
  await requirePermission("content:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Funnels & Lead Magnets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create lead magnets, manage download pages, and track conversion metrics.
        </p>
      </div>

      <FunnelsDashboard />
    </div>
  );
}
