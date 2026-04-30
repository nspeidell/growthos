export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import AutomationsDashboard from "./automations-dashboard";

export default async function AutomationsPage() {
  await requirePermission("content:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Automations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build email sequences, drip campaigns, and automated workflows triggered by subscriber actions.
        </p>
      </div>

      <AutomationsDashboard />
    </div>
  );
}
