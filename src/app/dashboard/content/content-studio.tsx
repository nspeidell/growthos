"use client";

import { useState, useEffect } from "react";
import {
  PenSquare,
  Sparkles,
  Check,
  X,
  Copy,
  Loader2,
  Send,
  Calendar,
  Zap,
  Bot,
  Video,
  Mic,
  Palette,
  Image as ImageIcon,
} from "lucide-react";
import {
  createAndGenerateMultiPlatform,
  updateAssetStatus,
  approveAndScheduleAll,
  autonomousGenerate,
  type MultiPlatformResult,
  type BatchScheduleResult,
  type AutonomousResult,
} from "./actions";
import { listVoiceProfiles } from "@/app/dashboard/media/voice-actions";
import { DOCTRINE_MODES } from "@/lib/ai/doctrine";
import { MediaStudio } from "@/app/dashboard/media/media-studio";

// ─── Steps ───
type CreateStep = "configure" | "generating" | "review";

// ─── Platform Config ───

interface PlatformDef {
  value: string;
  label: string;
  icon: string;
  mediaHint?: "video" | "image";
  demographic: string;
}

const PLATFORMS: PlatformDef[] = [
  { value: "instagram", label: "Instagram", icon: "📸", mediaHint: "image", demographic: "18-34, visual, lifestyle" },
  { value: "facebook", label: "Facebook", icon: "📘", demographic: "35-65+, parents & community" },
  { value: "x", label: "X (Twitter)", icon: "𝕏", demographic: "25-45, news & opinions" },
  { value: "youtube", label: "YouTube", icon: "▶️", mediaHint: "video", demographic: "18-35, tutorials & depth" },
  { value: "linkedin", label: "LinkedIn", icon: "💼", demographic: "28-55, professionals & B2B" },
  { value: "reddit", label: "Reddit", icon: "🤖", demographic: "18-40, skeptical & detail-oriented" },
  { value: "tiktok", label: "TikTok", icon: "🎵", mediaHint: "video", demographic: "16-30, raw & trend-aware" },
  { value: "pinterest", label: "Pinterest", icon: "📌", mediaHint: "image", demographic: "25-45, moms & planners" },
  { value: "threads", label: "Threads", icon: "🧵", demographic: "20-40, casual & conversational" },
  { value: "google_business", label: "Google Business", icon: "📍", demographic: "Local, high purchase intent" },
  { value: "wordpress", label: "WordPress", icon: "📝", demographic: "Search-driven, all ages" },
  { value: "medium", label: "Medium", icon: "✍️", demographic: "25-45, intellectuals" },
  { value: "ghost", label: "Ghost", icon: "👻", demographic: "25-50, premium content" },
  { value: "substack", label: "Substack", icon: "📰", demographic: "25-55, voice-driven" },
  { value: "website", label: "Website", icon: "🌐", demographic: "Search-intent, all ages" },
  { value: "email", label: "Email", icon: "📧", demographic: "25-55, highest conversion" },
];

// Maps each platform to its best default content type
const PLATFORM_DEFAULT_TYPE: Record<string, string> = {
  instagram: "caption",
  facebook: "post",
  x: "thread",
  youtube: "script",
  linkedin: "post",
  reddit: "post",
  tiktok: "reel_script",
  pinterest: "pin",
  threads: "caption",
  google_business: "post",
  wordpress: "blog",
  medium: "blog",
  ghost: "blog",
  substack: "newsletter",
  website: "blog",
  email: "email",
};

const CONTENT_TYPES = [
  { value: "caption", label: "Caption", platforms: ["instagram", "facebook", "threads"] },
  { value: "thread", label: "Thread", platforms: ["x"] },
  { value: "post", label: "Post", platforms: ["reddit", "facebook", "linkedin", "threads", "google_business"] },
  { value: "script", label: "Video Script", platforms: ["youtube"] },
  { value: "reel_script", label: "Reel/Short Script", platforms: ["instagram", "tiktok", "youtube"] },
  { value: "blog", label: "Blog Post", platforms: ["website", "wordpress", "ghost", "medium"] },
  { value: "newsletter", label: "Newsletter", platforms: ["substack", "email", "ghost"] },
  { value: "carousel", label: "Carousel", platforms: ["instagram", "linkedin"] },
  { value: "story", label: "Story", platforms: ["instagram", "facebook"] },
  { value: "pin", label: "Pin", platforms: ["pinterest"] },
  { value: "hook", label: "Hooks (10x)", platforms: ["instagram", "facebook", "x", "youtube", "reddit", "linkedin", "tiktok", "threads"] },
  { value: "meme_copy", label: "Meme Copy", platforms: ["instagram", "facebook", "x", "reddit"] },
  { value: "quote_card", label: "Quote Card", platforms: ["instagram", "x", "linkedin"] },
  { value: "landing_copy", label: "Landing Page", platforms: ["website"] },
  { value: "email", label: "Email", platforms: ["email"] },
];

const EMOTIONAL_VIBES = [
  "joyful", "nostalgic", "energetic", "peaceful",
  "inspiring", "warm", "playful", "dramatic",
];

const SUBJECT_TAGS = [
  "elders", "kids", "family", "couples", "outdoors",
  "cooking", "celebration", "fitness", "travel", "home",
];

const DOCTRINE_OPTIONS = Object.values(DOCTRINE_MODES).map((d) => ({
  value: d.key,
  label: d.displayName,
  description: d.description,
}));

const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.value, p.label])
);

const PLATFORM_ICON: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.value, p.icon])
);

const PLATFORM_MEDIA_HINT: Record<string, string | undefined> = Object.fromEntries(
  PLATFORMS.map((p) => [p.value, p.mediaHint])
);

interface VoiceProfile {
  id: string;
  name: string;
  isFounderVoice: boolean | null;
}

// ─── Main Component ───

type StudioMode = "write" | "video";

export function ContentStudio() {
  const [mode, setMode] = useState<StudioMode>("write");
  const [step, setStep] = useState<CreateStep>("configure");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [platformTypes, setPlatformTypes] = useState<Record<string, string>>({});
  const [doctrineMode, setDoctrineMode] = useState("balanced");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [result, setResult] = useState<MultiPlatformResult | null>(null);
  const [error, setError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set());

  // Media options (shown when video/image platforms are selected)
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [emotionalVibe, setEmotionalVibe] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);

  // Batch schedule state
  const [batchScheduleTime, setBatchScheduleTime] = useState("");
  const [batchScheduling, setBatchScheduling] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchScheduleResult | null>(null);

  // Autonomous mode state
  const [autonomousMode, setAutonomousMode] = useState(false);
  const [autonomousRunning, setAutonomousRunning] = useState(false);
  const [autonomousResult, setAutonomousResult] = useState<AutonomousResult | null>(null);

  // Derived: do any selected platforms need video or image?
  const hasVideoPlatforms = selectedPlatforms.some((p) => PLATFORM_MEDIA_HINT[p] === "video");
  const hasImagePlatforms = selectedPlatforms.some((p) => PLATFORM_MEDIA_HINT[p] === "image");

  // Load voice profiles when video platforms are selected
  useEffect(() => {
    if (hasVideoPlatforms && voiceProfiles.length === 0) {
      listVoiceProfiles().then((res) => {
        if (res.success && res.data) setVoiceProfiles(res.data);
      });
    }
  }, [hasVideoPlatforms, voiceProfiles.length]);

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platform)) {
        const next = prev.filter((p) => p !== platform);
        const types = { ...platformTypes };
        delete types[platform];
        setPlatformTypes(types);
        return next;
      } else {
        if (!platformTypes[platform]) {
          setPlatformTypes((prev) => ({
            ...prev,
            [platform]: PLATFORM_DEFAULT_TYPE[platform] ?? "post",
          }));
        }
        return [...prev, platform];
      }
    });
  }

  function changeTypeForPlatform(platform: string, type: string) {
    setPlatformTypes((prev) => ({ ...prev, [platform]: type }));
  }

  function getTypesForPlatform(platform: string) {
    return CONTENT_TYPES.filter((t) => t.platforms.includes(platform));
  }

  async function handleGenerate() {
    if (!title || !brief || selectedPlatforms.length === 0) {
      setError("Add a title, brief, and select at least one platform.");
      return;
    }

    setError("");
    setStep("generating");

    const platforms = selectedPlatforms;
    const contentTypes = platforms.map((p) => platformTypes[p] ?? PLATFORM_DEFAULT_TYPE[p] ?? "post");

    const res = await createAndGenerateMultiPlatform({
      title,
      brief,
      doctrineMode,
      platforms,
      contentTypes,
      voiceProfileId: voiceProfileId || undefined,
      emotionalVibe: emotionalVibe || undefined,
      subjectTags: selectedTags.length > 0 ? selectedTags : undefined,
    });

    if (!res.success) {
      setError(res.error);
      setStep("configure");
      return;
    }

    setResult(res.data);
    setApprovedIds(new Set());
    setStep("review");
  }

  async function handleAutonomousGenerate() {
    if (!title || !brief || selectedPlatforms.length === 0) {
      setError("Add a title, brief, and select at least one platform.");
      return;
    }

    setError("");
    setAutonomousRunning(true);
    setStep("generating");

    const res = await autonomousGenerate({
      title,
      brief,
      doctrineMode,
      platforms: selectedPlatforms,
      scheduledFor: batchScheduleTime || undefined,
    });

    setAutonomousRunning(false);

    if (!res.success) {
      setError(res.error);
      setStep("configure");
      return;
    }

    setAutonomousResult(res.data);
    setStep("review");
  }

  async function handleApprove(assetId: string) {
    if (!assetId) return;
    await updateAssetStatus(assetId, "approved");
    setApprovedIds((prev) => new Set([...prev, assetId]));
  }

  async function handleApproveAndScheduleAll() {
    if (!result) return;
    setBatchScheduling(true);
    setError("");

    const validAssetIds = result.assets
      .filter((a) => a.id && a.status !== "error")
      .map((a) => a.id);

    const scheduleTime = batchScheduleTime
      ? new Date(batchScheduleTime).toISOString()
      : new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await approveAndScheduleAll(validAssetIds, scheduleTime);

    setBatchScheduling(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    setBatchResult(res.data);
    setApprovedIds(new Set(validAssetIds));
  }

  async function handleCopy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleStartOver() {
    setStep("configure");
    setTitle("");
    setBrief("");
    setSelectedPlatforms([]);
    setPlatformTypes({});
    setResult(null);
    setError("");
    setApprovedIds(new Set());
    setBatchResult(null);
    setAutonomousResult(null);
  }

  // ─── Mode Toggle (Write / Video) ───
  const modeToggle = (
    <div className="flex rounded-lg border border-border bg-muted/30 p-1 gap-1 w-fit">
      <button
        onClick={() => setMode("write")}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "write" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
      >
        <PenSquare className="w-3.5 h-3.5 inline mr-1.5" />Write
      </button>
      <button
        onClick={() => setMode("video")}
        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "video" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
      >
        <Video className="w-3.5 h-3.5 inline mr-1.5" />Video
      </button>
    </div>
  );

  // ─── Video Mode ───
  if (mode === "video") {
    return (
      <div className="space-y-5">
        {modeToggle}
        <MediaStudio showSchedule />
      </div>
    );
  }

  // ─── Configure Step ───
  if (step === "configure") {
    return (
      <div className="space-y-5">
        {modeToggle}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Project Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Family Game Night Launch"
            className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Content Brief</label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="Describe what you want to post about. The more detail, the better the output..."
            className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Strategy Mode</label>
          <select
            value={doctrineMode}
            onChange={(e) => setDoctrineMode(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white text-gray-900 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {DOCTRINE_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label} — {d.description}
              </option>
            ))}
          </select>
        </div>

        {/* Multi-Platform Selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Platforms ({selectedPlatforms.length} selected)
          </label>
          <p className="text-xs text-gray-500 mb-3">
            Select every platform you want content for. Each gets optimized for that platform&apos;s audience and format — including auto-generated video for YouTube/TikTok.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PLATFORMS.map((p) => {
              const isSelected = selectedPlatforms.includes(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePlatform(p.value)}
                  className={`relative flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-brand-500 bg-brand-50 text-brand-800 ring-1 ring-brand-500"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{p.icon}</span>
                    <span className="text-sm font-medium">{p.label}</span>
                    {p.mediaHint === "video" && (
                      <Video className="h-3 w-3 text-purple-500 ml-auto flex-shrink-0" />
                    )}
                    {p.mediaHint === "image" && (
                      <ImageIcon className="h-3 w-3 text-blue-500 ml-auto flex-shrink-0" />
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 pl-6">{p.demographic}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content type overrides for selected platforms */}
        {selectedPlatforms.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Content Types per Platform
            </label>
            <div className="space-y-2">
              {selectedPlatforms.map((platform) => {
                const types = getTypesForPlatform(platform);
                const currentType = platformTypes[platform] ?? PLATFORM_DEFAULT_TYPE[platform] ?? "post";
                const hint = PLATFORM_MEDIA_HINT[platform];
                return (
                  <div key={platform} className="flex items-center gap-2">
                    <span className="text-sm w-28 flex items-center gap-1.5 text-gray-700">
                      {PLATFORM_ICON[platform]} {PLATFORM_LABEL[platform]}
                    </span>
                    <select
                      value={currentType}
                      onChange={(e) => changeTypeForPlatform(platform, e.target.value)}
                      className="flex-1 rounded-md border border-gray-300 bg-white text-gray-900 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                    >
                      {types.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    {hint === "video" && (
                      <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                        <Video className="h-2.5 w-2.5" /> + Video
                      </span>
                    )}
                    {hint === "image" && (currentType === "quote_card" || currentType === "meme_copy") && (
                      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                        <ImageIcon className="h-2.5 w-2.5" /> + Image
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Video Options (shown when YouTube/TikTok selected) ─── */}
        {hasVideoPlatforms && (
          <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-purple-600" />
              <h3 className="text-sm font-semibold text-purple-900">Video Generation</h3>
              <span className="text-xs text-purple-600 bg-purple-100 rounded-full px-2 py-0.5">Auto</span>
            </div>
            <p className="text-xs text-purple-700">
              Video platforms will auto-generate a video composite: AI voice narration + B-roll + branded subtitles.
            </p>

            {/* Voice Profile */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-purple-800">
                <Mic className="w-3 h-3" /> Voice Profile
              </label>
              <select
                value={voiceProfileId}
                onChange={(e) => setVoiceProfileId(e.target.value)}
                className="w-full rounded-lg border border-purple-300 bg-white text-gray-900 px-3 py-1.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              >
                <option value="">Auto (Founder Voice)</option>
                {voiceProfiles.map((vp) => (
                  <option key={vp.id} value={vp.id}>
                    {vp.name} {vp.isFounderVoice ? "(Founder)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Emotional Vibe */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-purple-800">
                <Palette className="w-3 h-3" /> Emotional Vibe
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EMOTIONAL_VIBES.map((vibe) => (
                  <button
                    key={vibe}
                    type="button"
                    onClick={() => setEmotionalVibe(emotionalVibe === vibe ? "" : vibe)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors capitalize ${
                      emotionalVibe === vibe
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-700 border border-purple-200 hover:bg-purple-100"
                    }`}
                  >
                    {vibe}
                  </button>
                ))}
              </div>
            </div>

            {/* B-Roll Subject Tags */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-purple-800">B-Roll Subjects</label>
              <div className="flex flex-wrap gap-1.5">
                {SUBJECT_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors capitalize ${
                      selectedTags.includes(tag)
                        ? "bg-purple-600 text-white"
                        : "bg-white text-purple-700 border border-purple-200 hover:bg-purple-100"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="flex gap-2 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setAutonomousMode(false)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              !autonomousMode
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => setAutonomousMode(true)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              autonomousMode
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Bot className="h-4 w-4" />
            Autopilot
          </button>
        </div>

        {autonomousMode && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-3">
            <div className="flex items-start gap-2">
              <Zap className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-purple-900">Autopilot Mode</p>
                <p className="text-xs text-purple-700 mt-0.5">
                  The swarm agent will generate content + media for all platforms, auto-approve, and schedule to your connected accounts. One click, fully hands-off.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Generate Button */}
        {autonomousMode ? (
          <button
            onClick={handleAutonomousGenerate}
            disabled={selectedPlatforms.length === 0 || !title || !brief}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bot className="h-4 w-4" />
            Generate, Approve & Schedule All
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={selectedPlatforms.length === 0 || !title || !brief}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="h-4 w-4" />
            Generate for {selectedPlatforms.length} Platform{selectedPlatforms.length !== 1 ? "s" : ""}
            {hasVideoPlatforms && " + Video"}
            {hasImagePlatforms && " + Images"}
          </button>
        )}
      </div>
    );
  }

  // ─── Generating Step ───
  if (step === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className={`h-10 w-10 animate-spin rounded-full border-4 ${autonomousMode ? "border-purple-200 border-t-purple-600" : "border-brand-200 border-t-brand-600"}`} />
        <p className="mt-4 text-sm font-medium text-gray-600">
          {autonomousMode ? (
            <>Swarm agent generating, approving & scheduling...</>
          ) : (
            <>Generating content{hasVideoPlatforms ? " + video" : ""} for {selectedPlatforms.length} platform{selectedPlatforms.length !== 1 ? "s" : ""}...</>
          )}
        </p>
        <p className="mt-1 text-xs text-gray-400">
          This may take {selectedPlatforms.length * 10}-{selectedPlatforms.length * 15} seconds
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {selectedPlatforms.map((p) => (
            <span key={p} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
              PLATFORM_MEDIA_HINT[p] === "video"
                ? "bg-purple-100 text-purple-700"
                : "bg-gray-100 text-gray-600"
            }`}>
              {PLATFORM_ICON[p]} {PLATFORM_LABEL[p]}
              {PLATFORM_MEDIA_HINT[p] === "video" && <Video className="h-2.5 w-2.5" />}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ─── Autonomous Result ───
  if (autonomousResult) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-6 text-center">
          <Bot className="h-10 w-10 text-purple-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-purple-900">Autopilot Complete</h3>
          <p className="text-sm text-purple-700 mt-2">
            {autonomousResult.summary}
          </p>
          <div className="flex justify-center gap-6 mt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-900">{autonomousResult.assetsCreated}</p>
              <p className="text-xs text-purple-600">Created</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-900">{autonomousResult.scheduled}</p>
              <p className="text-xs text-purple-600">Scheduled</p>
            </div>
          </div>
          {autonomousResult.skippedPlatforms.length > 0 && (
            <p className="text-xs text-amber-700 mt-3">
              Skipped (no connected account): {autonomousResult.skippedPlatforms.map((p) => PLATFORM_LABEL[p] ?? p).join(", ")}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleStartOver}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            <PenSquare className="h-4 w-4" />
            Create More Content
          </button>
        </div>
      </div>
    );
  }

  // ─── Review Step ───
  if (!result) return null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">
            {result.title} — {result.assets.length} version{result.assets.length !== 1 ? "s" : ""}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Review content, then approve & schedule all at once.
            {result.mediaJobsQueued > 0 && (
              <span className="text-purple-600 ml-1">
                {result.mediaJobsQueued} media job{result.mediaJobsQueued !== 1 ? "s" : ""} queued.
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleStartOver}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <PenSquare className="h-3.5 w-3.5" />
          New Project
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Batch Result Banner */}
      {batchResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <strong>{batchResult.approved} approved</strong>, <strong>{batchResult.scheduled} scheduled</strong> to connected accounts.
          {batchResult.skipped.length > 0 && (
            <span className="text-amber-700 ml-1">
              Skipped (no account connected): {batchResult.skipped.map((p) => PLATFORM_LABEL[p] ?? p).join(", ")}
            </span>
          )}
          <span className="ml-1">Check the <strong>Publisher → Queue</strong> tab.</span>
        </div>
      )}

      {/* Approve All & Schedule Bar */}
      {!batchResult && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-brand-900">
                Approve all & schedule to every connected platform
              </p>
              <p className="text-xs text-brand-600 mt-0.5">
                Each version posts to its matching account automatically
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-xs text-brand-700 mb-1 block">Schedule for</label>
              <input
                type="datetime-local"
                value={batchScheduleTime}
                onChange={(e) => setBatchScheduleTime(e.target.value)}
                className="w-full rounded-md border border-brand-300 bg-white text-gray-900 px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
                placeholder="Default: 1 hour from now"
              />
            </div>
            <div className="flex-shrink-0 pt-5">
              <button
                onClick={handleApproveAndScheduleAll}
                disabled={batchScheduling}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {batchScheduling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Approve & Schedule All
              </button>
            </div>
          </div>
          {!batchScheduleTime && (
            <p className="text-xs text-brand-500">Leave blank to schedule 1 hour from now</p>
          )}
        </div>
      )}

      {/* Platform Cards */}
      <div className="space-y-3">
        {result.assets.map((asset) => {
          const isApproved = approvedIds.has(asset.id);
          const isCopied = copiedId === asset.id;
          const isError = asset.status === "error";

          return (
            <div
              key={asset.id || asset.platform}
              className={`rounded-xl border bg-white overflow-hidden ${
                isError
                  ? "border-red-200"
                  : isApproved
                  ? "border-green-300"
                  : "border-gray-200"
              }`}
            >
              {/* Platform Header */}
              <div className={`flex items-center justify-between px-4 py-2.5 ${
                isError
                  ? "bg-red-50"
                  : isApproved
                  ? "bg-green-50"
                  : "bg-gray-50"
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-base">{PLATFORM_ICON[asset.platform] ?? "📱"}</span>
                  <span className="text-sm font-medium text-gray-900">
                    {PLATFORM_LABEL[asset.platform] ?? asset.platform}
                  </span>
                  <span className="text-xs text-gray-500">· {asset.type}</span>
                  {asset.mediaJobId && (
                    <span className="flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                      {asset.mediaType === "video_composite" ? (
                        <><Video className="h-2.5 w-2.5" /> Video queued</>
                      ) : (
                        <><ImageIcon className="h-2.5 w-2.5" /> Image queued</>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isError ? (
                    <span className="text-xs text-red-600 font-medium">Failed</span>
                  ) : isApproved ? (
                    <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                      <Check className="h-3.5 w-3.5" /> Approved
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => handleCopy(asset.body, asset.id)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:bg-white rounded-md"
                      >
                        {isCopied ? (
                          <><Check className="h-3 w-3 text-green-500" /> Copied</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copy</>
                        )}
                      </button>
                      <button
                        onClick={() => handleApprove(asset.id)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        <Check className="h-3 w-3" /> Approve
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="px-4 py-3">
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 max-h-64 overflow-y-auto">
                  {asset.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
