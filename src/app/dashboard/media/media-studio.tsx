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
  generateVideoScript,
  createVoiceoverVideoJob,
  listMediaJobs as listVideoJobs,
  scheduleVideoPost,
  scheduleImagePost,
  scheduleCarouselPost,
  generateCarouselSlides,
  createCarouselJob,
  createAvatarJob,
  type CarouselSlide,
} from "./video-studio-actions";
import type { MediaJob } from "@/lib/db/schema";

// Defined here (not imported from server actions file) so they're available on the client
const REUNION_VOICE_PRESETS = [
  {
    id: "21m00Tcm4TlvDq8ikWAM",
    name: "Rachel",
    description: "Calm, clear, warm — perfect for family storytelling",
    gender: "female",
    recommended: true,
  },
  {
    id: "ErXwobaYiN019PkySvjV",
    name: "Antoni",
    description: "Well-rounded, natural, trustworthy — great for advice content",
    gender: "male",
    recommended: true,
  },
  {
    id: "TxGEqnHWrfWFTfGW9XjX",
    name: "Josh",
    description: "Deep, confident, warm — strong for motivational content",
    gender: "male",
    recommended: false,
  },
  {
    id: "AZnzlk1XvdvUeBnXmlld",
    name: "Domi",
    description: "Strong, engaging, energetic — good for challenge/activity posts",
    gender: "female",
    recommended: false,
  },
  {
    id: "MF3mGyEYCl7XYWbV9V6O",
    name: "Elli",
    description: "Young, bright, approachable — great for humor and relatable content",
    gender: "female",
    recommended: false,
  },
  {
    id: "pNInz6obpgDQGcFmaJgB",
    name: "Adam",
    description: "Neutral, professional, clear — versatile for any content",
    gender: "male",
    recommended: false,
  },
] as const;

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

type TabType = "image" | "video" | "carousel" | "avatar";
type VideoStep = 1 | 2 | 3;

const VIDEO_PLATFORMS = [
  { value: "instagram", label: "Instagram", icon: "📸" },
  { value: "facebook", label: "Facebook", icon: "📘" },
  { value: "threads", label: "Threads", icon: "🧵" },
  { value: "x", label: "X", icon: "𝕏" },
  { value: "linkedin", label: "LinkedIn", icon: "💼" },
  { value: "youtube", label: "YouTube", icon: "▶️" },
  { value: "tiktok", label: "TikTok", icon: "🎵" },
];

export function MediaStudio({ showSchedule = false }: { showSchedule?: boolean }) {
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
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>(REUNION_VOICE_PRESETS[0]!.id);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>(REUNION_VOICE_PRESETS[0]!.name);
  const [videoFormat, setVideoFormat] = useState<"vertical" | "square" | "horizontal">("vertical");
  const [contentPillar, setContentPillar] = useState("family_connection");
  const [generatingScript, setGeneratingScript] = useState(false);
  const [videoJobs, setVideoJobs] = useState<MediaJob[]>([]);

  // Shared
  const [status, setStatus] = useState<"idle" | "submitting" | "queued" | "error">("idle");
  const [error, setError] = useState("");
  const [recentJobs, setRecentJobs] = useState<MediaJob[]>([]);

  // Schedule state (shown when showSchedule=true and a video is completed)
  const [schedulingJobId, setSchedulingJobId] = useState<string | null>(null);
  const [scheduleCaption, setScheduleCaption] = useState("");
  const [schedulePlatforms, setSchedulePlatforms] = useState<string[]>(["instagram", "facebook", "threads"]);
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<{ scheduled: number; skipped: string[] } | null>(null);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);

  // Carousel state
  const [carouselTopic, setCarouselTopic] = useState("");
  const [carouselSlideCount, setCarouselSlideCount] = useState(5);
  const [carouselPillar, setCarouselPillar] = useState("family_connection");
  const [carouselSlides, setCarouselSlides] = useState<Array<{slideNumber: number; headline: string; body: string; imagePrompt: string}>>([]);
  const [carouselCaption, setCarouselCaption] = useState("");
  const [carouselTitle, setCarouselTitle] = useState("");
  const [generatingCarousel, setGeneratingCarousel] = useState(false);
  const [carouselJobs, setCarouselJobs] = useState<MediaJob[]>([]);

  // Avatar (D-ID) state
  const [avatarScript, setAvatarScript] = useState("");
  const [avatarImageUrl, setAvatarImageUrl] = useState("");
  const [avatarVoiceId, setAvatarVoiceId] = useState<string>(REUNION_VOICE_PRESETS[0]!.id);
  const [avatarTitle, setAvatarTitle] = useState("");
  const [avatarJobs, setAvatarJobs] = useState<MediaJob[]>([]);

  // Inline video player — avoids navigating to the raw /api/media/serve endpoint
  // (which returns JSON on any 404/auth hiccup). The <video> element loads/retries gracefully.
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [jobsResult, voicesResult, videoJobsResult, carouselJobsResult, avatarJobsResult] = await Promise.all([
      listMediaJobs(),
      listVoiceProfiles(),
      listVideoJobs("video_composite"),
      listVideoJobs("carousel"),
      listVideoJobs("avatar_video" as "video_composite"),
    ]);
    if (jobsResult.success) setRecentJobs(jobsResult.data.slice(0, 10));
    if (voicesResult.success) setVoiceProfiles(voicesResult.data);
    if (videoJobsResult.success) setVideoJobs(videoJobsResult.data);
    if (carouselJobsResult.success) setCarouselJobs(carouselJobsResult.data);
    if (avatarJobsResult.success) setAvatarJobs(avatarJobsResult.data.filter(j => j.type === "avatar_video"));
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
      try {
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Script generation failed — please try again");
      } finally {
        setGeneratingScript(false);
      }
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
      try {
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
          setTimeout(() => { setStatus("idle"); void loadData(); }, 3000);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to queue video — please try again");
        setStatus("error");
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
      {/* Inline video player overlay */}
      {playingUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPlayingUrl(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPlayingUrl(null)}
              className="absolute -top-10 right-0 text-white text-sm inline-flex items-center gap-1 hover:opacity-80"
            >
              ✕ Close
            </button>
            <video
              src={playingUrl}
              controls
              autoPlay
              className="w-full rounded-lg bg-black shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        <button onClick={() => setActiveTab("video")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "video" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Video className="w-4 h-4" /> Video
        </button>
        <button onClick={() => setActiveTab("carousel")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "carousel" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Palette className="w-4 h-4" /> Carousel
        </button>
        <button onClick={() => setActiveTab("avatar")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "avatar" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <Mic className="w-4 h-4" /> Avatar
        </button>
        <button onClick={() => setActiveTab("image")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === "image" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          <ImagePlus className="w-4 h-4" /> Image
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ─── Avatar Tab (D-ID) ─── */}
      {activeTab === "avatar" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Video title</label>
              <input value={avatarTitle} onChange={e => setAvatarTitle(e.target.value)}
                placeholder="e.g. Why family traditions matter"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Presenter image URL</label>
              <input value={avatarImageUrl} onChange={e => setAvatarImageUrl(e.target.value)}
                placeholder="https://... (publicly accessible photo of the presenter)"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              <p className="text-xs text-muted-foreground mt-1">Upload a photo to R2 or use any public image URL. Face should be clearly visible, front-facing.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Script</label>
              <textarea value={avatarScript} onChange={e => setAvatarScript(e.target.value)}
                placeholder="Write what the avatar will say…"
                rows={5}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              <p className="text-xs text-muted-foreground mt-1">~130 words = 60 seconds</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Voice (ElevenLabs)</label>
              <div className="grid grid-cols-2 gap-2">
                {REUNION_VOICE_PRESETS.map(v => (
                  <button key={v.id} onClick={() => setAvatarVoiceId(v.id)}
                    className={`rounded-lg border p-2.5 text-left transition-colors ${avatarVoiceId === v.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background hover:border-primary/40"}`}>
                    <p className="text-sm font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={!avatarScript.trim() || !avatarImageUrl.trim() || isPending}
              onClick={() => {
                const fd = new FormData();
                fd.set("script", avatarScript);
                fd.set("presenterImageUrl", avatarImageUrl);
                fd.set("voiceId", avatarVoiceId);
                fd.set("title", avatarTitle || avatarScript.substring(0, 50));
                startTransition(async () => {
                  try {
                    const res = await createAvatarJob(fd);
                    if (res.success) {
                      setAvatarScript("");
                      setAvatarTitle("");
                      void loadData();
                    } else setError(res.error ?? "Failed to queue avatar job");
                  } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
                });
              }}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isPending ? "Queuing…" : "Generate Avatar Video"}
            </button>
          </div>

          {/* Avatar Jobs Library */}
          {avatarJobs.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="text-sm font-semibold">Avatar Library</h3>
              <div className="space-y-2">
                {avatarJobs.map(job => (
                  <div key={job.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{job.prompt}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {job.status === "queued" ? "⏳ Queued"
                           : job.status === "processing" ? "🎭 D-ID rendering…"
                           : job.status === "completed" ? "✅ Ready"
                           : `❌ ${job.errorMessage ?? "Failed"}`}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {(job.status === "queued" || job.status === "processing") && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                        {job.status === "completed" && job.resultR2Key && (
                          <>
                            <button onClick={() => setPlayingUrl(`/api/media/serve/${job.resultR2Key}`)}
                              className="inline-flex items-center gap-1 rounded-md bg-muted border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/80">
                              <Play className="w-3 h-3" /> Play
                            </button>
                            {showSchedule && (
                              <button onClick={() => { setSchedulingJobId(job.id); setScheduleCaption(""); setScheduleResult(null); }}
                                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:bg-primary/90">
                                <Send className="w-3 h-3" /> Schedule
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {/* Schedule panel reuses video scheduling (same mediaType: video) */}
                    {showSchedule && schedulingJobId === job.id && !scheduleResult && (
                      <div className="pt-2 border-t border-border space-y-3">
                        <textarea value={scheduleCaption} onChange={e => setScheduleCaption(e.target.value)}
                          placeholder="Caption…" rows={2}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                        <div className="flex flex-wrap gap-2">
                          {VIDEO_PLATFORMS.map(p => (
                            <button key={p.value}
                              onClick={() => setSchedulePlatforms(prev => prev.includes(p.value) ? prev.filter(x => x !== p.value) : [...prev, p.value])}
                              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${schedulePlatforms.includes(p.value) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                              {p.icon} {p.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 items-center">
                          <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                          <button onClick={() => setSchedulingJobId(null)} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">Cancel</button>
                          <button
                            disabled={scheduling || !scheduleCaption.trim() || !schedulePlatforms.length || !scheduleTime}
                            onClick={() => {
                              setScheduling(true);
                              const fd = new FormData();
                              fd.set("jobId", job.id);
                              fd.set("caption", scheduleCaption);
                              fd.set("scheduledFor", new Date(scheduleTime).toISOString());
                              fd.set("platforms", JSON.stringify(schedulePlatforms));
                              scheduleVideoPost(fd).then(res => {
                                if (res.success) setScheduleResult(res.data);
                                else setError(res.error ?? "Scheduling failed");
                              }).catch(e => setError(e instanceof Error ? e.message : "Failed"))
                              .finally(() => setScheduling(false));
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium disabled:opacity-50 hover:bg-primary/90">
                            {scheduling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {scheduling ? "Scheduling…" : "Schedule"}
                          </button>
                        </div>
                      </div>
                    )}
                    {showSchedule && schedulingJobId === job.id && scheduleResult && (
                      <p className="text-xs text-green-700 font-medium pt-2 border-t border-border">
                        ✅ Scheduled to {scheduleResult.scheduled} platform{scheduleResult.scheduled !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {/* ─── Carousel Tab ─── */}
      {activeTab === "carousel" && (
        <div className="space-y-5">
          {carouselSlides.length === 0 ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Topic</label>
                <input value={carouselTopic} onChange={e => setCarouselTopic(e.target.value)}
                  placeholder="e.g. 5 ways to start a family tradition"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-foreground mb-1.5">Slides</label>
                  <select value={carouselSlideCount} onChange={e => setCarouselSlideCount(parseInt(e.target.value))}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    {[3,4,5,6,7].map(n => <option key={n} value={n}>{n} slides</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-foreground mb-1.5">Content pillar</label>
                  <select value={carouselPillar} onChange={e => setCarouselPillar(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                    <option value="family_connection">Family Connection</option>
                    <option value="legacy_memory">Legacy & Memory</option>
                    <option value="engagement">Engagement</option>
                    <option value="humor">Humor</option>
                    <option value="product_awareness">Reunion App</option>
                  </select>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!carouselTopic.trim()) return;
                  setGeneratingCarousel(true);
                  const fd = new FormData();
                  fd.set("topic", carouselTopic);
                  fd.set("slideCount", String(carouselSlideCount));
                  fd.set("contentPillar", carouselPillar);
                  startTransition(async () => {
                    try {
                      const res = await generateCarouselSlides(fd);
                      if (res.success) {
                        setCarouselSlides(res.data.slides);
                        setCarouselCaption(res.data.caption);
                        setCarouselTitle(res.data.title);
                      } else setError(res.error ?? "Failed to generate carousel");
                    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
                    finally { setGeneratingCarousel(false); }
                  });
                }}
                disabled={!carouselTopic.trim() || generatingCarousel || isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
                {generatingCarousel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {generatingCarousel ? "Writing slides…" : "AI Write Carousel"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{carouselTitle}</h3>
                <button onClick={() => setCarouselSlides([])} className="text-xs text-muted-foreground hover:text-foreground">← Start over</button>
              </div>

              {/* Slide previews */}
              <div className="space-y-2">
                {carouselSlides.map((slide, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{slide.slideNumber}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{slide.headline}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{slide.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Caption */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Caption</label>
                <textarea value={carouselCaption} onChange={e => setCarouselCaption(e.target.value)} rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
              </div>

              <button
                onClick={() => {
                  const fd = new FormData();
                  fd.set("slides", JSON.stringify(carouselSlides));
                  fd.set("caption", carouselCaption);
                  fd.set("title", carouselTitle);
                  startTransition(async () => {
                    try {
                      const res = await createCarouselJob(fd);
                      if (res.success) {
                        setCarouselSlides([]);
                        setCarouselTopic("");
                        void loadData();
                      } else setError(res.error ?? "Failed to queue carousel");
                    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); }
                  });
                }}
                disabled={isPending}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isPending ? "Queuing…" : "Generate Carousel"}
              </button>
            </div>
          )}

          {/* Carousel Jobs Library */}
          {carouselJobs.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-border">
              <h3 className="text-sm font-semibold">Carousel Library</h3>
              <div className="space-y-2">
                {carouselJobs.map(job => (
                  <div key={job.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{job.prompt}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {job.status === "queued" ? "⏳ Queued"
                           : job.status === "processing" ? "🎨 Rendering slides…"
                           : job.status === "completed" ? "✅ Ready"
                           : `❌ ${job.errorMessage ?? "Failed"}`}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {(job.status === "queued" || job.status === "processing") && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                        {job.status === "completed" && showSchedule && (
                          <button onClick={() => { setSchedulingJobId(job.id); setScheduleCaption(""); setScheduleResult(null); }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:bg-primary/90">
                            <Send className="w-3 h-3" /> Schedule
                          </button>
                        )}
                      </div>
                    </div>

                    {showSchedule && schedulingJobId === job.id && !scheduleResult && (
                      <div className="pt-2 border-t border-border space-y-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Caption</label>
                          <textarea value={scheduleCaption} onChange={e => setScheduleCaption(e.target.value)}
                            placeholder="Caption for this carousel…" rows={2}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[{ value: "instagram", label: "Instagram", icon: "📸" }].map(p => (
                            <button key={p.value}
                              onClick={() => setSchedulePlatforms(prev => prev.includes(p.value) ? prev.filter(x => x !== p.value) : [...prev, p.value])}
                              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${schedulePlatforms.includes(p.value) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                              {p.icon} {p.label}
                            </button>
                          ))}
                          <p className="text-xs text-muted-foreground self-center">Carousel publishing currently supports Instagram only</p>
                        </div>
                        <div className="flex gap-2 items-center">
                          <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                          <button onClick={() => setSchedulingJobId(null)} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">Cancel</button>
                          <button
                            disabled={scheduling || !scheduleCaption.trim() || !schedulePlatforms.length || !scheduleTime}
                            onClick={() => {
                              setScheduling(true);
                              const fd = new FormData();
                              fd.set("jobId", job.id);
                              fd.set("caption", scheduleCaption);
                              fd.set("scheduledFor", new Date(scheduleTime).toISOString());
                              fd.set("platforms", JSON.stringify(schedulePlatforms.filter(p => p === "instagram")));
                              scheduleCarouselPost(fd).then(res => {
                                if (res.success) setScheduleResult(res.data);
                                else setError(res.error ?? "Scheduling failed");
                              }).catch(e => setError(e instanceof Error ? e.message : "Scheduling failed"))
                              .finally(() => setScheduling(false));
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium disabled:opacity-50 hover:bg-primary/90">
                            {scheduling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {scheduling ? "Scheduling…" : "Schedule"}
                          </button>
                        </div>
                      </div>
                    )}
                    {showSchedule && schedulingJobId === job.id && scheduleResult && (
                      <p className="text-xs text-green-700 font-medium pt-2 border-t border-border">
                        ✅ Scheduled to {scheduleResult.scheduled} platform{scheduleResult.scheduled !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
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
                        {job.status === "completed" && job.resultR2Key && (
                          <>
                            <button onClick={() => setPlayingUrl(`/api/media/serve/${job.resultR2Key}`)}
                              className="inline-flex items-center gap-1 rounded-md bg-muted border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/80">
                              <Play className="w-3 h-3" /> Play
                            </button>
                            {showSchedule && (
                              <button
                                onClick={() => { setSchedulingJobId(job.id); setScheduleCaption(""); setScheduleResult(null); }}
                                className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:bg-primary/90">
                                <Send className="w-3 h-3" /> Schedule
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Inline schedule panel */}
                    {showSchedule && schedulingJobId === job.id && !scheduleResult && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Caption / description</label>
                          <textarea value={scheduleCaption} onChange={e => setScheduleCaption(e.target.value)}
                            placeholder="Write a caption for this video…"
                            rows={3}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Platforms</label>
                          <div className="flex flex-wrap gap-2">
                            {VIDEO_PLATFORMS.map(p => (
                              <button key={p.value}
                                onClick={() => setSchedulePlatforms(prev => prev.includes(p.value) ? prev.filter(x => x !== p.value) : [...prev, p.value])}
                                className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${schedulePlatforms.includes(p.value) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                                {p.icon} {p.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground block mb-1">Schedule for</label>
                          <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setSchedulingJobId(null)} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">Cancel</button>
                          <button
                            disabled={scheduling || !scheduleCaption.trim() || !schedulePlatforms.length || !scheduleTime}
                            onClick={() => {
                              setScheduling(true);
                              const fd = new FormData();
                              fd.set("jobId", job.id);
                              fd.set("caption", scheduleCaption);
                              fd.set("scheduledFor", new Date(scheduleTime).toISOString());
                              fd.set("platforms", JSON.stringify(schedulePlatforms));
                              scheduleVideoPost(fd).then(res => {
                                if (res.success) setScheduleResult(res.data);
                                else setError(res.error ?? "Scheduling failed");
                              }).catch(e => setError(e instanceof Error ? e.message : "Scheduling failed"))
                              .finally(() => setScheduling(false));
                            }}
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium disabled:opacity-50 hover:bg-primary/90">
                            {scheduling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            {scheduling ? "Scheduling…" : `Schedule to ${schedulePlatforms.length} platform${schedulePlatforms.length !== 1 ? "s" : ""}`}
                          </button>
                        </div>
                      </div>
                    )}

                    {showSchedule && schedulingJobId === job.id && scheduleResult && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-sm text-green-700 font-medium">
                          ✅ Scheduled to {scheduleResult.scheduled} platform{scheduleResult.scheduled !== 1 ? "s" : ""}
                          {scheduleResult.skipped.length > 0 && ` (skipped: ${scheduleResult.skipped.join(", ")} — not connected)`}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Image Jobs */}
      {recentJobs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Recent Images</h3>
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={job.status} />
                    <div>
                      <p className="text-sm font-medium text-foreground capitalize">
                        {job.type.replace(/_/g, " ")}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-1 max-w-[240px]">
                        {job.prompt}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === "completed" && job.resultR2Key && (
                      <>
                        <a href={`/api/media/serve/${job.resultR2Key}`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md bg-muted border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/80">
                          <Play className="w-3 h-3" /> View
                        </a>
                        {showSchedule && (
                          <button
                            onClick={() => { setSchedulingJobId(job.id); setScheduleCaption(""); setScheduleResult(null); }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium hover:bg-primary/90">
                            <Send className="w-3 h-3" /> Schedule
                          </button>
                        )}
                      </>
                    )}
                    {job.status !== "completed" && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        job.status === "failed" ? "bg-destructive/10 text-destructive"
                        : job.status === "processing" ? "bg-warning/10 text-warning"
                        : "bg-muted text-muted-foreground"}`}>
                        {job.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Inline schedule panel for image jobs */}
                {showSchedule && schedulingJobId === job.id && !scheduleResult && (
                  <div className="pt-2 border-t border-border space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Caption</label>
                      <textarea value={scheduleCaption} onChange={e => setScheduleCaption(e.target.value)}
                        placeholder="Write a caption…" rows={2}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {VIDEO_PLATFORMS.map(p => (
                        <button key={p.value}
                          onClick={() => setSchedulePlatforms(prev => prev.includes(p.value) ? prev.filter(x => x !== p.value) : [...prev, p.value])}
                          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${schedulePlatforms.includes(p.value) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                          {p.icon} {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 items-center">
                      <input type="datetime-local" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                      <button onClick={() => setSchedulingJobId(null)} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted">Cancel</button>
                      <button
                        disabled={scheduling || !scheduleCaption.trim() || !schedulePlatforms.length || !scheduleTime}
                        onClick={() => {
                          setScheduling(true);
                          const fd = new FormData();
                          fd.set("jobId", job.id);
                          fd.set("caption", scheduleCaption);
                          fd.set("scheduledFor", new Date(scheduleTime).toISOString());
                          fd.set("platforms", JSON.stringify(schedulePlatforms));
                          scheduleImagePost(fd).then(res => {
                            if (res.success) setScheduleResult(res.data);
                            else setError(res.error ?? "Scheduling failed");
                          }).catch(e => setError(e instanceof Error ? e.message : "Scheduling failed"))
                          .finally(() => setScheduling(false));
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium disabled:opacity-50 hover:bg-primary/90">
                        {scheduling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        {scheduling ? "Scheduling…" : "Schedule"}
                      </button>
                    </div>
                  </div>
                )}
                {showSchedule && schedulingJobId === job.id && scheduleResult && (
                  <p className="text-xs text-green-700 font-medium pt-2 border-t border-border">
                    ✅ Scheduled to {scheduleResult.scheduled} platform{scheduleResult.scheduled !== 1 ? "s" : ""}
                    {scheduleResult.skipped.length > 0 && ` (skipped: ${scheduleResult.skipped.join(", ")})`}
                  </p>
                )}
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
