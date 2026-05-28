export const runtime = "edge";

import { requirePermission } from "@/lib/auth/middleware";
import JvDashboard from "./jv-dashboard";

export default async function JvPage() {
  await requirePermission("analytics:read");
  return <JvDashboard />;
}
