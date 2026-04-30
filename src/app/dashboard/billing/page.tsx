export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import BillingDashboard from "./billing-dashboard";

export default async function BillingPage() {
  await requirePermission("billing:read");

  return <BillingDashboard />;
}
