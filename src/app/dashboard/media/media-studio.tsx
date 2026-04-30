"use client";

import { useState, useEffect, useTransition } from "react";
import {
  ImagePlus,
  Video,
  Clock,
  CheckCircle2,
  Loader2,
  Mic,
  Palette,
  Sparkles,
} from "lucide-react";
import { createMediaJob, listMediaJobs } from "./actions";
import { listVoiceProfiles } from "./voice-actions";
import type { MediaJob } from "@/lib/db/schema";

const IMAGE_TYPES = [
  { value: "meme", label: "Meme", description: "Top/bottom text on template" },
  { value: "quote_card", label: "Quote Card", description: "Brand-colored quote graphic" },
  { value: "thumbnail", label: "Thumbnail", description: "YouTube/blog thumbnail" },
  { value: "promo", label: "Promo Image", description: "Promotional graphic" },
  { value: "carousel_slide", label: "Carousel", description: "Instagram carousel slide" },
  { value: "ad_creative", label: "Ad Creative", description: "Meta/Google ad image" },
];

const EMOTIONAL_VIBES = [
  "joyful",
  "nostalgic",
  "energetic",
  "peaceful",
  "inspiring",
  "warm",
  "playful",
  "dramatic",
];

const SUBJECT_TAGS = [
  "elders",
  "kids",
  "family",
  "couples",
  "outdoors",
  "cooking",
  "celebration",
  "fitness",
  "travel",
  "home",
];

interface VoiceProfile {
  id: string;
  name: string;
  isFounderVoice: boolean | null;
}

type TabType = "image" | "video";

export function MediaStudio() {
  const [activeTab, setActiveTab] = useState<TabType>("image");
  const [isPending, startTransition] = useTransition();

  // Image state
  const [mediaType, setMediaType] = useState("");
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("replicate");

  // Video state
  const [script, setScript] = useState("");
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [emotionalVibe, setEmotionalVibe] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Shared
  const [status, setStatus] = useState<"idle" | "submitting" | "queued" | "error">("idle");
  const [error, setError] = useState("");
  const [recentJobs, setRecentJobs] = useState<MediaJob[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const [jobsResult, voicesResult] = await Promise.all([
      listMediaJobs(),
      listVoiceProfiles(),
    ]);
    if (jobsResult.success && jobsResult.data) setRecentJobs(jobsResult.data.slice(0, 10));
    if (voicesResult.success && voicesResult.data) setVoiceProfiles(voicesResult.data);
  }

  function handleImageSubmit() {
    if (!mediaType || !prompt) {
      setError("Select a type and describe what you want.");
      return;
    }
    setError("");
    setStatus("submitting");

    const formData = new FormData();
    formData.set("type", mediaType);
    formData.set("prompt", prompt);
    formData.set("provider", provider);

    startTransition(async () => {
      const result = await createMediaJob(formData);
      if (!result.success) {
        setError(result.error ?? "Failed");
        setStatus("error");
      } else {
        setStatus("queued");
        setTimeout(() => {
          setStatus("idle");
          setMediaType("");
          setPrompt("");
          loadData();
        }, 2500);
      }
    });
  }

  function handleVideoSubmit() {
    if (!script.trim()) {
      setError("Write a narration script for the video.");
      return;
    }
    setError("");
    setStatus("submitting");

    const formData = new FormData();
    formData.set("type", "video_composite");
    formData.set("prompt", script);
    formData.set("provider", "elevenlabs");
    if (voiceProfileId) formData.set("voiceProfileId", voiceProfileId);
    formData.set(
      "config",
      JSON.stringify({
        script,
        emotionalVibe: emotionalVibe || undefined,
        subjectTags: selectedTags.length > 0 ? selectedTags : undefined,
      })
    );

    startTransition(async () => {
      const result = await createMediaJob(formData);
      if (!result.success) {
        setError(result.error ?? "Failed");
        setStatus("error");
      } else {
        setStatus("queued");
        setTimeout(() => {
          setStatus("idle");
          setScript("");
          loadData();
        }, 2500);
      }
    });
  }

  if (status === "queued") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-success/30 bg-success/5 py-16">
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="mt-4 text-sm font-medium text-success">
          {activeTab === "video" ? "Video composite job queued" : "Image job queued"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {activeTab === "video"
            ? "Generating narration and building composition manifest..."
            : "Your image is being generated. Check back shortly."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button
          onClick={() => setActiveTab("image")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "image"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ImagePlus className="w-4 h-4" /> Image
        </button>
        <button
          onClick={() => setActiveTab("video")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "video"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Video className="w-4 h-4" /> Video Composite
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ─── Image Tab ─── */}
      {activeTab === "image" && (
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Media Type</label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {IMAGE_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setMediaType(t.value)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    mediaType === t.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-medium text-foreground">{t.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">AI Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="cloudflare">Cloudflare AI — Fast, included</option>
              <option value="replicate">Replicate — High quality SDXL</option>
              <option value="together">Together AI — Fast FLUX</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Describe your image</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="e.g. A warm family gathering around a dinner table, soft lighting, modern illustration style..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <button
            onClick={handleImageSubmit}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</>
            ) : (
              <><ImagePlus className="h-4 w-4" /> Generate Image</>
            )}
          </button>
        </div>
      )}

      {/* ─── Video Composite Tab ─── */}
      {activeTab === "video" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">High-Realism Video</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Layered composition: B-roll background + cloned voice narration + branded subtitles.
              Output is a render manifest for your video pipeline.
            </p>
          </div>

          {/* Voice Profile */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Mic className="w-3.5 h-3.5" /> Voice Profile
            </label>
            <select
              value={voiceProfileId}
              onChange={(e) => setVoiceProfileId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            >
              <option value="">Auto (Founder Voice)</option>
              {voiceProfiles.map((vp) => (
                <option key={vp.id} value={vp.id}>
                  {vp.name} {vp.isFounderVoice ? "(Founder)" : ""}
                </option>
              ))}
            </select>
            {voiceProfiles.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No voice profiles yet. Add one in Settings → Voices.
              </p>
            )}
          </div>

          {/* Emotional Vibe */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Palette className="w-3.5 h-3.5" /> Emotional Vibe
            </label>
            <div className="flex flex-wrap gap-2">
              {EMOTIONAL_VIBES.map((vibe) => (
                <button
                  key={vibe}
                  onClick={() => setEmotionalVibe(emotionalVibe === vibe ? "" : vibe)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
                    emotionalVibe === vibe
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {vibe}
                </button>
              ))}
            </div>
          </div>

          {/* Subject Tags */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">B-Roll Subject Tags</label>
            <div className="flex flex-wrap gap-2">
              {SUBJECT_TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
                    selectedTags.includes(tag)
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Script */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Narration Script
            </label>
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={6}
              placeholder="Write the narration for the video. This will be spoken by the cloned voice and displayed as subtitles..."
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {script.length} chars · ~{Math.ceil(script.split(/\s+/).filter(Boolean).length / 150)} min
            </p>
          </div>

          <button
            onClick={handleVideoSubmit}
            disabled={isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating...</>
            ) : (
              <><Video className="h-4 w-4" /> Generate Video Composite</>
            )}
          </button>
        </div>
      )}

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Recent Jobs</h3>
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <StatusIcon status={job.status} />
                  <div>
                    <p className="text-sm font-medium text-foreground capitalize">
                      {job.type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]">
                      {job.prompt}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    job.status === "completed"
                      ? "bg-success/10 text-success"
                      : job.status === "failed"
                      ? "bg-destructive/10 text-destructive"
                      : job.status === "processing"
                      ? "bg-warning/10 text-warning"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-success" />;
    case "processing":
      return <Loader2 className="w-4 h-4 text-warning animate-spin" />;
    case "failed":
      return <Clock className="w-4 h-4 text-destructive" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}
