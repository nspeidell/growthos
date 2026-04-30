export const runtime = 'edge';

import { Users } from "lucide-react";

export default function OutreachPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Outreach</h1>
        <p className="mt-1 text-sm text-gray-500">
          Find influencers, podcasts, journalists, and communities.
        </p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-16">
        <Users className="h-10 w-10 text-gray-300" />
        <p className="mt-4 text-sm font-medium text-gray-500">
          Coming in Phase 3
        </p>
        <p className="mt-1 text-xs text-gray-400">
          Find influencers, podcasts, journalists, and communities.
        </p>
      </div>
    </div>
  );
}
