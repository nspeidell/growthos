"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Mic,
  Plus,
  Trash2,
  Star,
  Loader2,
  Sliders,
} from "lucide-react";
import {
  listVoiceProfilesFull,
  createVoiceProfile,
  setFounderVoice,
  deleteVoiceProfile,
} from "./actions";
import type { VoiceProfile } from "@/lib/db/schema";

export default function VoicesManager() {
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const result = await listVoiceProfilesFull();
    if (result.success && result.data) setProfiles(result.data);
    setLoading(false);
  }

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createVoiceProfile(formData);
      if (result.success) {
        setShowCreate(false);
        await load();
      } else {
        setError(result.error ?? "Failed to create profile");
      }
    });
  }

  function handleSetFounder(id: string) {
    startTransition(async () => {
      await setFounderVoice(id);
      await load();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this voice profile?")) return;
    startTransition(async () => {
      await deleteVoiceProfile(id);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {profiles.length} profile{profiles.length !== 1 ? "s" : ""} configured
        </p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> Add Voice
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
          <h3 className="text-lg font-semibold text-foreground mb-4">Add Voice Profile</h3>
          <form action={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                <input
                  name="name"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Nick (Founder)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">ElevenLabs Voice ID</label>
                <input
                  name="elevenLabsVoiceId"
                  required
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="21m00Tcm4TlvDq8ikWAM"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Voice Sample URL (optional)</label>
                <input
                  name="voiceSampleUrl"
                  type="url"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="https://..."
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-foreground mb-1">Stability</label>
                  <input
                    name="stability"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    defaultValue="0.5"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-foreground mb-1">Similarity</label>
                  <input
                    name="similarityBoost"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    defaultValue="0.75"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="hidden" name="isFounderVoice" value="false" />
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  onChange={(e) => {
                    const hidden = e.target.previousElementSibling as HTMLInputElement;
                    if (hidden) hidden.value = e.target.checked ? "true" : "false";
                  }}
                  className="rounded border-input"
                />
                Set as founder voice (used by default for video narration)
              </label>
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
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
                Add Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profiles List */}
      {profiles.length === 0 && !showCreate ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-12 text-center">
          <Mic className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">No voice profiles yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add your ElevenLabs cloned voice to enable video narration.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm text-primary"
          >
            Add your first voice
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${profile.isFounderVoice ? "bg-primary/10" : "bg-muted"}`}>
                    <Mic className={`w-4 h-4 ${profile.isFounderVoice ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{profile.name}</p>
                      {profile.isFounderVoice && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          <Star className="w-3 h-3" /> Founder
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono">{profile.elevenLabsVoiceId}</span>
                      <span className="inline-flex items-center gap-1">
                        <Sliders className="w-3 h-3" />
                        S:{profile.stability} / B:{profile.similarityBoost}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!profile.isFounderVoice && (
                    <button
                      onClick={() => handleSetFounder(profile.id)}
                      disabled={isPending}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                      title="Set as founder voice"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(profile.id)}
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
