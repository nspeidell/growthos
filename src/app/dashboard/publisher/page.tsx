export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import PublisherDashboard from "./publisher-dashboard";

export default async function PublisherPage() {
  await requirePermission("publish:queue");

  return <PublisherDashboard />;
}
