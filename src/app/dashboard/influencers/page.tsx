export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import InfluencerDashboard from "./influencer-dashboard";

export default async function InfluencersPage() {
  await requirePermission("analytics:read");

  return <InfluencerDashboard />;
}
