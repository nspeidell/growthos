"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Mail } from "lucide-react";

export default function NewsletterSignupPage() {
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
          source: "newsletter",
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
          <h1 className="mt-4 text-2xl font-bold text-foreground">You&apos;re subscribed!</h1>
          <p className="mt-2 text-muted-foreground">
            Check your inbox for a confirmation. We&apos;ll send you growth insights weekly.
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
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Growth Newsletter</h1>
          <p className="mt-2 text-muted-foreground">
            Weekly insights on audience growth, content strategy, and marketing automation. Free forever.
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
              "Subscribe"
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
  if (typeof window !== "undefined") {
    const meta = document.querySelector('meta[name="workspace-slug"]');
    if (meta) return meta.getAttribute("content") ?? "default";
  }
  return "default";
}
