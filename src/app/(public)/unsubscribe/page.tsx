"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, MailX } from "lucide-react";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const workspaceId = searchParams.get("ws") ?? "";

  const [status, setStatus] = useState<
    "confirm" | "loading" | "success" | "already" | "error"
  >("confirm");

  // If params missing, show a manual entry
  const [manualEmail, setManualEmail] = useState(email);

  async function handleUnsubscribe() {
    const targetEmail = manualEmail || email;
    if (!targetEmail) return;

    setStatus("loading");
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, workspaceId }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        alreadyUnsubscribed?: boolean;
        error?: string;
      };

      if (data.alreadyUnsubscribed) {
        setStatus("already");
      } else if (data.success) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {status === "confirm" && (
          <>
            <MailX className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-4 text-xl font-semibold text-foreground">
              Unsubscribe
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {email
                ? `Remove ${email} from our mailing list?`
                : "Enter your email to unsubscribe."}
            </p>

            {!email && (
              <input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="your@email.com"
                className="mt-4 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
              />
            )}

            <button
              onClick={handleUnsubscribe}
              disabled={!manualEmail && !email}
              className="mt-5 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              Confirm Unsubscribe
            </button>

            <p className="mt-4 text-xs text-muted-foreground">
              Changed your mind?{" "}
              <a href="/subscribe" className="text-primary hover:underline">
                Re-subscribe anytime
              </a>
            </p>
          </>
        )}

        {status === "loading" && (
          <div className="py-8">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">Processing...</p>
          </div>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              You&apos;ve been unsubscribed
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You won&apos;t receive any more emails from us. We&apos;re sorry
              to see you go.
            </p>
          </>
        )}

        {status === "already" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              Already unsubscribed
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This email is already unsubscribed from our list.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <MailX className="mx-auto h-10 w-10 text-destructive" />
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Please try again or contact support.
            </p>
            <button
              onClick={() => setStatus("confirm")}
              className="mt-4 text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <UnsubscribeContent />
    </Suspense>
  );
}
