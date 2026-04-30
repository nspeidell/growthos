export const runtime = 'edge';

import TeamDashboard from "./team-dashboard";

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Team</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage workspace members, roles, and invitations.
        </p>
      </div>

      <TeamDashboard />
    </div>
  );
}
