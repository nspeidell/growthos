"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  ImagePlus,
  Video,
  Clock,
  CheckCircle2,
  Loader2,
  Mic,
  Palette,
  Sparkles,
  Wand2,
  Play,
  Download,
  Send,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { createMediaJob, listMediaJobs } from "./actions";
import { listVoiceProfiles } from "./voice-actions";
import {
  REUNION_VOICE_PRESETS,
  generateVideoScript,
  createVoiceoverVideoJob,
  listMediaJobs as listVideoJobs,
} from "./video-studio-actions";
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
type VideoStep = 1 | 2 | 3;

export function MediaStudio() {
  const [activeTab, setActiveTab] = useState<TabType>("video");
  const [isPending, startTransition] = useTransition();

  // Image state
  const [mediaType, setMediaType] = useState("");
  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState("replicate");

  // Video Studio state — 3-step wizard
  const [videoStep, setVideoStep] = useState<VideoStep>(1);
  const [videoTopic, setVideoTopic] = useState("");
  const [videoScript, setVideoScript] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoImagePrompts, setVideoImagePrompts] = useState<string[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState(REUNION_VOICE_PRESETS[0]!.id);
  const [selectedVoiceName, setSelectedVoiceName] = useState(REUNION_VOICE_PRESETS[0]!.name);
  const [videoFormat, setVideoFormat] = useState<"vertical" | "square" | "horizontal">("vertical");
  const [contentPillar, setContentPillar] = useState("family_connection");
  const [generatingScript, setGeneratingScript] = useState(false);
  const [videoJobs, setVideoJobs] = useState<MediaJob[]>([]);

  // Shared
  const [status, setStatus] = useState<"idle" | "submitting" | "queued" | "error">("idle");
  const [error, setError] = useState("");
  const [recentJobs, setRecentJobs] = useState<MediaJob[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);

  const loadData = useCallback(async () => {
    const [jobsResult, voicesResult, videoJobsResult] = await Promise.all([
      listMediaJobs(),
      listVoiceProfiles(),
      listVideoJobs("video_composite"),
    ]);
    if (jobsResult.success) setRecentJobs(jobsResult.data.slice(0, 10));
    if (voicesResult.success) setVoiceProfiles(voicesResult.data);
    if (videoJobsResult.success) setVideoJobs(videoJobsResult.data);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Poll in-progress video jobs every 10s
  useEffect(() => {
    const hasActive = videoJobs.some(j => j.status === "queued" || j.status === "processing");
    if (!hasActive) return;
    const interval = setInterval(() => loadData(), 10_000);
    return () => clearInterval(interval);
  }, [videoJobs, loadData]);

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

  function handleAIGenerateScript() {
    if (!videoTopic.trim()) { setError("Enter a topic first."); return; }
    setError("");
    setGeneratingScript(true);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("topic", videoTopic);
      fd.set("format", videoFormat);
      fd.set("contentPillar", contentPillar);
      fd.set("targetDurationSeconds", "45");
      const result = await generateVideoScript(fd);
      if (result.success) {
        setVideoScript(result.data.script);
        setVideoTitle(result.data.title);
        setVideoImagePrompts(result.data.imagePrompts);
        setVideoStep(2);
      } else {
        setError(result.error ?? "Script generation failed");
      }
      setGeneratingScript(false);
    });
  }

  function handleVideoSubmit() {
    if (!videoScript.trim()) { setError("Script is required."); return; }
    if (!selectedVoiceId) { setError("Select a voice."); return; }
    setError("");
    setStatus("submitting");

    const fd = new FormData();
    fd.set("script", videoScript);
    fd.set("voiceId", selectedVoiceId);
    fd.set("voiceName", selectedVoiceName);
    fd.set("format", videoFormat);
    fd.set("title", videoTitle || videoTopic);
    fd.set("imagePrompts", JSON.stringify(videoImagePrompts));

    startTransition(async () => {
      const result = await createVoiceoverVideoJob(fd);
      if (!result.success) {
        setError(result.error ?? "Failed to queue video");
        setStatus("error");
      } else {
        setStatus("queued");
        setVideoStep(1);
        setVideoTopic("");
        setVideoScript("");
        setVideoTitle("");
        setTimeout(() => { setStatus("idle"); loadData(); }, 3000);
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

      {/* ─── Video Studio Tab ─── */}
      {activeTab === "video" && (
        <div className="space-y-5">

          {/* Step progress */}
          <div className="flex items-center gap-2">
            {([1, 2, 3] as VideoStep[]).map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  videoStep === s ? "bg-primary text-primary-foreground"
                  : videoStep > s ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
                }`}>{s}</div>
                <span className={`text-xs font-medium ${videoStep === s ? "text-foreground" : "text-muted-foreground"}`}>
                  {s === 1 ? "Script" : s === 2 ? "Voice" : "Generate"}
                </span>
                {i < 2 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {/* ── Step 1: Script ── */}
          {videoStep === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Format</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "vertical", label: "Reel", sub: "9:16 · Instagram / Facebook" },
                    { value: "square", label: "Square", sub: "1:1 · Feed / Stories" },
                    { value: "horizontal", label: "Horizontal", sub: "16:9 · LinkedIn" },
                  ].map(f => (
                    <button key={f.value} onClick={() => setVideoFormat(f.value as typeof videoFormat)}
                      className={`rounded-lg border p-3 text-left transition-colors ${videoFormat === f.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/40"}`}>
                      <p className="text-sm font-semibold">{f.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{f.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Content Pillar</label>
                <select value={contentPillar} onChange={e => setContentPillar(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="family_connection">Family Connection & Activities</option>
                  <option value="legacy_memory">Legacy & Memory Keeping</option>
                  <option value="current_events">Current Events (Family Lens)</option>
                  <option value="engagement">Community Engagement</option>
                  <option value="humor">Family Humor</option>
                  <option value="product_awareness">Reunion App Awareness</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Topic / Idea</label>
                <input value={videoTopic} onChange={e => setVideoTopic(e.target.value)}
                  placeholder="e.g. 5 questions to ask your grandparents before it's too late"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>

              <div className="flex gap-2">
                <button onClick={handleAIGenerateScript} disabled={isPending || generatingScript || !videoTopic.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
                  {generatingScript ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {generatingScript ? "Writing script…" : "AI Write Script"}
                </button>
                <button onClick={() => { setVideoScript(""); setVideoStep(2); }}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-muted">
                  Write My Own
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Script Review + Voice ── */}
          {videoStep === 2 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-muted-foreground">Script</label>
                  <span className="text-xs text-muted-foreground">
                    ~{Math.ceil(videoScript.split(/\s+/).filter(Boolean).length / 130 * 60)}s
                  </span>
                </div>
                <textarea value={videoScript} onChange={e => setVideoScript(e.target.value)} rows={7}
                  placeholder="Write or paste your video narration here…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">
                  <Mic className="w-3 h-3 inline mr-1" /> Choose Voice
                </label>
                <div className="space-y-2">
                  {REUNION_VOICE_PRESETS.map(voice => (
                    <button key={voice.id}
                      onClick={() => { setSelectedVoiceId(voice.id); setSelectedVoiceName(voice.name); }}
                      className={`w-full rounded-lg border p-3 text-left flex items-start justify-between transition-colors ${selectedVoiceId === voice.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/40"}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{voice.name}</span>
                          {voice.recommended && <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">Recommended</span>}
                          <span className="text-xs text-muted-foreground capitalize">{voice.gender}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{voice.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setVideoStep(1)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
                  Back
                </button>
                <button onClick={() => setVideoStep(3)} disabled={!videoScript.trim() || !selectedVoiceId}
                  className="flex-1 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
                  Next → Review & Generate
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Review & Submit ── */}
          {videoStep === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <h3 className="text-sm font-semibold">Review</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Format</p>
                    <p className="text-sm font-semibold mt-1 capitalize">{videoFormat}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Voice</p>
                    <p className="text-sm font-semibold mt-1">{selectedVoiceName}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-semibold mt-1">~{Math.ceil(videoScript.split(/\s+/).filter(Boolean).length / 130 * 60)}s</p>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Script preview</p>
                  <p className="text-xs line-clamp-3">{videoScript}</p>
                </div>
              </div>

              <div className="rounded-xl border border-[#E2AC54]/30 bg-[#E2AC54]/5 p-4">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">What happens next:</strong> GrowthOS generates the voiceover via ElevenLabs, creates branded background visuals, then sends everything to Creatomate for rendering. The finished MP4 (with animated captions + Reunion branding) appears in your media library below when ready — usually 2–5 minutes.
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setVideoStep(2)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
                  Back
                </button>
                <button onClick={handleVideoSubmit} disabled={isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isPending ? "Queuing…" : "Generate Video"}
                </button>
              </div>
            </div>
          )}

          {/* Video Jobs Gallery */}
          {videoJobs.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Video Library</h3>
                <button onClick={loadData} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              <div className="space-y-2">
                {videoJobs.map(job => (
                  <div key={job.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{job.prompt}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {job.status === "queued" ? "⏳ Queued — rendering will begin shortly"
                           : job.status === "processing" ? "🎬 Rendering… check back in 2–5 min"
                           : job.status === "completed" ? "✅ Ready"
                           : `❌ Failed: ${job.errorMessage ?? "unknown error"}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(job.status === "queued" || job.status === "processing") && (
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        )}
                        {job.status === "completed" && job.outputUrl && (
                          <>
                            <a href={job.outputUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:bg-primary/90">
                              <Play className="w-3 h-3" /> Play
                            </a>
                            <a href={job.outputUrl} download
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                              <Download className="w-3 h-3" /> Save
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
