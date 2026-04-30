export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import AnalyticsDashboard from "./analytics-dashboard";

export default async function AnalyticsPage() {
  await requirePermission("analytics:read");

  return <AnalyticsDashboard />;
}
