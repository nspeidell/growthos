export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import CompetitorDashboard from "./competitor-dashboard";

export default async function CompetitorsPage() {
  await requirePermission("analytics:read");

  return <CompetitorDashboard />;
}
