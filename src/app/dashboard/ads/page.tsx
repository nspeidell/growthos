export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import AdsDashboard from "./ads-dashboard";

export default async function AdsManagerPage() {
  await requirePermission("content:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ads Manager</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create and manage ad campaigns across Meta, Google, and X.
        </p>
      </div>

      <AdsDashboard />
    </div>
  );
}
