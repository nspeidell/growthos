export const runtime = 'edge';

import { requireAuth } from "@/lib/auth/middleware";
import CommandCenter from "./command-center";

export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Welcome back, {session.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {session.workspaceName} command center — here&apos;s your growth at a glance.
        </p>
      </div>

      <CommandCenter />
    </div>
  );
}
