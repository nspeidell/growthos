export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import VoicesManager from "./voices-manager";

export default async function VoicesPage() {
  await requirePermission("content:write");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Voice Profiles</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage cloned voice profiles for video narration. Connect your ElevenLabs voices here.
        </p>
      </div>

      <VoicesManager />
    </div>
  );
}
