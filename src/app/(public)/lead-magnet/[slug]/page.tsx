"use client";

export const runtime = 'edge';

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Loader2, CheckCircle2, Download, FileText } from "lucide-react";

interface LeadMagnetInfo {
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string | null;
  coverUrl: string | null;
  workspaceSlug: string;
}

export default function LeadMagnetPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [magnet, setMagnet] = useState<LeadMagnetInfo | null>(null);
  const [loadingMagnet, setLoadingMagnet] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchMagnetInfo();
  }, [slug]);

  async function fetchMagnetInfo() {
    try {
      const response = await fetch(`/api/lead-magnet/${slug}`);
      if (response.ok) {
        const data = (await response.json()) as LeadMagnetInfo;
        setMagnet(data);
      }
    } catch (error) {
      // Non-critical — page still renders
      console.error("[LeadMagnetPage] Failed to fetch magnet info for slug", slug, error);
    } finally {
      setLoadingMagnet(false);
    }
  }

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
          workspaceSlug: magnet?.workspaceSlug ?? "default",
          source: "lead_magnet",
          leadMagnetSlug: slug,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Something went wrong");
      }

      const result = (await response.json()) as { success: boolean; downloadUrl?: string };
      if (result.downloadUrl) {
        setDownloadUrl(result.downloadUrl);
      }
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (loadingMagnet) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-md">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h1 className="mt-4 text-2xl font-bold text-foreground">It&apos;s yours!</h1>
          <p className="mt-2 text-muted-foreground">
            {downloadUrl
              ? "Your download is ready."
              : "Check your inbox — we've sent you the download link."}
          </p>
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Now
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {magnet?.title ?? "Free Download"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {magnet?.description ?? "Enter your email to get instant access."}
          </p>
          {magnet?.fileType && (
            <span className="mt-3 inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
              {magnet.fileType}
            </span>
          )}
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
              "Get Free Access"
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
