export const runtime = 'edge';

import { requirePermission } from "@/lib/auth/middleware";
import { MediaStudio } from "./media-studio";

export default async function MediaPage() {
  await requirePermission("content:read");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Media Studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate images, ad creatives, and high-realism composite videos with cloned voice narration.
        </p>
      </div>
      <MediaStudio />
    </div>
  );
}
