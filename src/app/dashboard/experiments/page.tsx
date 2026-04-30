import { requireAuth } from "@/lib/auth/middleware";
import { ExperimentsDashboard } from "./experiments-dashboard";
import { getExperimentsDashboard, startExperiment, pauseExperiment, rollbackWinner } from "./actions";

export const runtime = "edge";

export default async function ExperimentsPage() {
  const session = await requireAuth();
  const workspaceId = session.workspaceId;
  const userId = session.userId;
  const data = await getExperimentsDashboard(workspaceId);

  async function handleStart(experimentId: string) {
    "use server";
    await startExperiment(workspaceId, experimentId, userId);
  }

  async function handlePause(experimentId: string) {
    "use server";
    await pauseExperiment(workspaceId, experimentId, userId);
  }

  async function handleRollback(experimentId: string) {
    "use server";
    await rollbackWinner(workspaceId, experimentId, userId);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Growth Optimization
          </h1>
          <p className="text-sm text-zinc-400 font-mono">
            Experiment Engine &middot; Statistical Testing &middot; Auto-Optimize
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-mono text-emerald-400 border border-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            OPTIMIZING
          </span>
        </div>
      </div>

      <ExperimentsDashboard
        data={data}
        onStartExperiment={handleStart}
        onPauseExperiment={handlePause}
        onRollback={handleRollback}
      />
    </div>
  );
}
