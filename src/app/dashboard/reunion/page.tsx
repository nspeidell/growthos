export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import ReunionDashboard from "./reunion-dashboard";

export default async function ReunionPage() {
  await requirePermission("content:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reunion Campaigns</h1>
        <p className="mt-1 text-sm text-gray-500">
          Push notifications, invite reminders, and reactivation campaigns for your Reunion app users.
        </p>
      </div>

      <ReunionDashboard />
    </div>
  );
}
