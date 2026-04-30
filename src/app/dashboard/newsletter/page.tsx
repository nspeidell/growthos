export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import NewsletterDashboard from "./newsletter-dashboard";

export default async function NewsletterPage() {
  await requirePermission("content:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Newsletter</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage subscribers, compose newsletters, and track open/click metrics.
        </p>
      </div>

      <NewsletterDashboard />
    </div>
  );
}
