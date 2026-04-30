export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import { ContentStudio } from "./content-studio";

export default async function ContentPage() {
  await requirePermission("content:read");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Create</h1>
        <p className="mt-1 text-sm text-gray-500">
          One brief, every platform — text, video, and images generated automatically.
        </p>
      </div>
      <ContentStudio />
    </div>
  );
}
