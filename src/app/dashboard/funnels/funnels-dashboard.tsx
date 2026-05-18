"use client";

import { useState, useEffect, useTransition } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Download,
  ExternalLink,
  Loader2,
  Link2,
  Sparkles,
} from "lucide-react";
import {
  listLeadMagnets,
  createLeadMagnet,
  deleteLeadMagnet,
  generateLeadMagnetWithAI,
} from "./actions";
import type { LeadMagnet } from "@/lib/db/schema";

export default function FunnelsDashboard() {
  const [magnets, setMagnets] = useState<LeadMagnet[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiFields, setAiFields] = useState<{ title: string; description: string; slug: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const result = await listLeadMagnets();
    if (result.success && result.data) setMagnets(result.data);
    setLoading(false);
  }

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createLeadMagnet(formData);
      if (result.success) {
        setShowCreate(false);
        setAiFields(null);
        setAiTopic("");
        await load();
      } else {
        setError(result.error ?? "Failed to create lead magnet");
      }
    });
  }

  async function handleAIGenerate() {
    if (!aiTopic.trim()) return;
    setAiGenerating(true);
    setError(null);
    const result = await generateLeadMagnetWithAI(aiTopic.trim());
    setAiGenerating(false);
    if (result.success && result.data) {
      setAiFields(result.data);
    } else if (!result.success) {
      setError(result.error ?? "AI generation failed");
    }
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this lead magnet? Existing links will stop working.")) return;
    startTransition(async () => {
      await deleteLeadMagnet(id);
      await load();
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalDownloads = magnets.reduce((sum, m) => sum + (m.downloads ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <FileText className="w-4 h-4" />
            <span className="text-xs">Total</span>
          </div>
          <p className="text-xl font-bold text-foreground">{magnets.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <Download className="w-4 h-4" />
            <span className="text-xs">Downloads</span>
          </div>
          <p className="text-xl font-bold text-foreground">{totalDownloads}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-foreground">Lead Magnets</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" />
          New Lead Magnet
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Create Lead Magnet</h3>

          {/* AI Generate */}
          <div className="mb-5 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-medium text-primary mb-2">✦ AI Generate</p>
            <div className="flex gap-2">
              <input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAIGenerate()}
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="e.g. a checklist for planning a family reunion"
              />
              <button
                type="button"
                onClick={handleAIGenerate}
                disabled={aiGenerating || !aiTopic.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {aiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {aiGenerating ? "Generating…" : "Generate"}
              </button>
            </div>
            {aiFields && <p className="mt-2 text-xs text-primary">✓ Fields filled below — add your file URL and save</p>}
          </div>

          <form action={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Title</label>
                <input
                  key={aiFields?.title}
                  name="title"
                  required
                  defaultValue={aiFields?.title ?? ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Ultimate Growth Playbook"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Slug</label>
                <input
                  key={aiFields?.slug}
                  name="slug"
                  required
                  pattern="[a-z0-9-]+"
                  defaultValue={aiFields?.slug ?? ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="growth-playbook"
                />
                <p className="mt-1 text-xs text-muted-foreground">URL-safe, lowercase, hyphens only</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                <textarea
                  key={aiFields?.description}
                  name="description"
                  rows={2}
                  defaultValue={aiFields?.description ?? ""}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="A 30-page guide covering audience growth strategies..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">File URL</label>
                <input
                  name="fileUrl"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="https://cdn.example.com/growth-playbook.pdf"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">File Type (optional)</label>
                <input
                  name="fileType"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="pdf"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1">Cover URL (optional)</label>
                <input
                  name="coverUrl"
                  type="url"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="https://cdn.example.com/cover.png"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Magnets List */}
      {magnets.length === 0 && !showCreate ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-12 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">No lead magnets yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 text-sm text-primary"
          >
            Create your first lead magnet
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {magnets.map((magnet) => (
            <div key={magnet.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate">{magnet.title}</p>
                  {magnet.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                      {magnet.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="w-3 h-3" />
                      /lead-magnet/{magnet.slug}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Download className="w-3 h-3" />
                      {magnet.downloads ?? 0} downloads
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <a
                    href={`/lead-magnet/${magnet.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground"
                    title="Preview page"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={() => handleDelete(magnet.id)}
                    disabled={isPending}
                    className="rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
