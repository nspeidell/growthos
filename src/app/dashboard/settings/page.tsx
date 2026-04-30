export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import BrandVault from "./brand-vault";

export default async function SettingsPage() {
  await requirePermission("content:read");
  return <BrandVault />;
}
