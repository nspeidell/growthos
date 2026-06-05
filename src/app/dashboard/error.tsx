"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <AlertTriangle className="w-10 h-10 text-destructive mb-4" />
      <h2 className="text-lg font-semibold text-foreground mb-1">Something went wrong</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        {error.message ?? "An unexpected error occurred. Try refreshing the page."}
      </p>
      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
      >
        <RefreshCw className="w-4 h-4" /> Try again
      </button>
    </div>
  );
}
