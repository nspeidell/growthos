"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Zap } from "lucide-react";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name || undefined,
          workspaceSlug: getWorkspaceSlug(),
          source: "waitlist",
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Something went wrong");
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-md">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">You&apos;re on the list!</h1>
          <p className="mt-2 text-muted-foreground">
            We&apos;ll be in touch soon with early access details.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Join the Waitlist</h1>
          <p className="mt-2 text-muted-foreground">
            Be the first to know when we launch. Early access + exclusive perks.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>
          {status === "error" && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}
          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {status === "loading" ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              "Get Early Access"
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          No spam. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}

function getWorkspaceSlug(): string {
  // In production, this would be derived from subdomain or path parameter
  // For now, use a default or read from meta tag / env
  if (typeof window !== "undefined") {
    const meta = document.querySelector('meta[name="workspace-slug"]');
    if (meta) return meta.getAttribute("content") ?? "default";
  }
  return "default";
}
