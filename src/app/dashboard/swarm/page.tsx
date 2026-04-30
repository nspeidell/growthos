import { requireAuth } from "@/lib/auth/middleware";
import { SwarmDashboard } from "./swarm-dashboard";
import { getSwarmDashboard, launchMission, cancelMission, toggleAgent } from "./actions";

export const runtime = "edge";

export default async function SwarmPage() {
  const session = await requireAuth();
  const workspaceId = session.workspaceId;
  const data = await getSwarmDashboard(workspaceId);

  async function handleLaunchMission(goal: string) {
    "use server";
    await launchMission(workspaceId, goal);
  }

  async function handleCancelMission(missionId: string) {
    "use server";
    await cancelMission(workspaceId, missionId);
  }

  async function handleToggleAgent(agentId: string, isActive: boolean) {
    "use server";
    await toggleAgent(workspaceId, agentId, isActive);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Growth Swarm
          </h1>
          <p className="text-sm text-zinc-400 font-mono">
            AI Agent Orchestration Engine
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-mono text-emerald-400 border border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ONLINE
          </span>
        </div>
      </div>

      <SwarmDashboard
        data={data}
        onLaunchMission={handleLaunchMission}
        onCancelMission={handleCancelMission}
        onToggleAgent={handleToggleAgent}
      />
    </div>
  );
}
