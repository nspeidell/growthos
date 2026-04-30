export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import SeoDashboard from "./seo-dashboard";

export default async function SeoAeoPage() {
  await requirePermission("content:read");

  return <SeoDashboard />;
}
