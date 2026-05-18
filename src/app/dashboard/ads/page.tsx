export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import AdsDashboard from "./ads-dashboard";

export default async function AdsManagerPage() {
  await requirePermission("content:write");
  return <AdsDashboard />;
}
