"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import {
  Zap,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  UserPlus,
  Download,
  Play,
  Tag,
  Mail,
  Clock,
  ChevronDown,
  X,
  GripVertical,
} from "lucide-react";
import {
  listAutomations,
  createAutomation,
  toggleAutomation,
  deleteAutomation,
} from "./actions";
import type { Automation } from "@/lib/db/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailStep {
  type: "send_email";
  subject: string;
  body: string;
  fromName?: string;
  fromEmail?: string;
}
interface WaitStep {
  type: "wait";
  delayHours: number;
}
interface AddTagStep {
  type: "add_tag";
  tag: string;
}
type AnyStep = EmailStep | WaitStep | AddTagStep;

// ─── Constants ───────────────────────────────────────────────────────────────

const TRIGGERS = [
  { value: "subscribe",   label: "New Subscriber",  icon: UserPlus, description: "When someone subscribes" },
  { value: "tag_added",   label: "Tag Added",        icon: Tag,      description: "When a tag is applied" },
  { value: "lead_magnet", label: "Lead Magnet",      icon: Download, description: "When a lead magnet is downloaded" },
  { value: "manual",      label: "Manual",           icon: Play,     description: "Triggered manually" },
];

const STEP_TYPES = [
  { value: "send_email", label: "Send Email",  icon: Mail,    description: "Send a personalised email" },
  { value: "wait",       label: "Wait",        icon: Clock,   description: "Pause before the next step" },
  { value: "add_tag",    label: "Add Tag",     icon: Tag,     description: "Tag the subscriber" },
];

// ─── Step Builder ─────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: AnyStep;
  index: number;
  onChange: (updated: AnyStep) => void;
  onRemove: () => void;
}) {
  const label = STEP_TYPES.find((s) => s.value === step.type)?.label ?? step.type;
  const Icon = STEP_TYPES.find((s) => s.value === step.type)?.icon ?? Zap;

  return (
    <div className="rounded-xl border border-border bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Icon className="w-3.5 h-3.5" />
          Step {index + 1} — {label}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-muted-foreground hover:text-destructive"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="p-4 space-y-3">
        {step.type === "send_email" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">From Name</label>
                <input
                  value={step.fromName ?? ""}
                  onChange={(e) => onChange({ ...step, fromName: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="Reunion Team"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">From Email</label>
                <input
                  value={step.fromEmail ?? ""}
                  onChange={(e) => onChange({ ...step, fromEmail: e.target.value })}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="hello@reunionchallenge.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Subject</label>
              <input
                value={step.subject}
                onChange={(e) => onChange({ ...step, subject: e.target.value })}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Welcome to Reunion, {{name}}!"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Body <span className="text-muted-foreground font-normal">(HTML — use {"{{name}}"} for personalisation)</span>
              </label>
              <textarea
                value={step.body}
                onChange={(e) => onChange({ ...step, body: e.target.value })}
                rows={5}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring font-mono"
                placeholder={"<p>Hey {{name}}, welcome aboard!</p>"}
              />
            </div>
          </>
        )}

        {step.type === "wait" && (
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Delay (hours)</label>
            <input
              type="number"
              min={1}
              value={step.delayHours}
              onChange={(e) =>
                onChange({ ...step, delayHours: Math.max(1, parseInt(e.target.value) || 1) })
              }
              className="w-40 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {step.delayHours >= 24
                ? `${(step.delayHours / 24).toFixed(1)} day(s)`
                : `${step.delayHours} hour(s)`}
            </p>
          </div>
        )}

        {step.type === "add_tag" && (
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Tag</label>
            <input
              value={step.tag}
              onChange={(e) => onChange({ ...step, tag: e.target.value })}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
              placeholder="welcomed"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Step Picker ──────────────────────────────────────────────────────────

function AddStepButton({ onAdd }: { onAdd: (type: AnyStep["type"]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary/50 px-3 py-2 text-sm text-primary hover:border-primary hover:bg-primary/5"
      >
        <Plus className="w-4 h-4" />
        Add Step
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-10 w-56 rounded-xl border border-border bg-card shadow-lg">
          {STEP_TYPES.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  onAdd(s.value as AnyStep["type"]);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted first:rounded-t-xl last:rounded-b-xl"
              >
                <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function AutomationsDashboard() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [selectedTrigger, setSelectedTrigger] = useState("");
  const [triggerConfigValue, setTriggerConfigValue] = useState(""); // human-readable config
  const [steps, setSteps] = useState<AnyStep[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const result = await listAutomations();
    if (result.success && result.data) setItems(result.data);
    setLoading(false);
  }

  function addStep(type: AnyStep["type"]) {
    if (type === "send_email") {
      setSteps((s) => [...s, { type: "send_email", subject: "", body: "" }]);
    } else if (type === "wait") {
      setSteps((s) => [...s, { type: "wait", delayHours: 24 }]);
    } else if (type === "add_tag") {
      setSteps((s) => [...s, { type: "add_tag", tag: "" }]);
    }
  }

  function updateStep(index: number, updated: AnyStep) {
    setSteps((prev) => prev.map((s, i) => (i === index ? updated : s)));
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function handleCreate(formData: FormData) {
    setError(null);

    // Validate steps
    if (steps.length === 0) {
      setError("Add at least one step.");
      return;
    }
    for (const step of steps) {
      if (step.type === "send_email" && (!step.subject.trim() || !step.body.trim())) {
        setError("All Send Email steps need a subject and body.");
        return;
      }
      if (step.type === "add_tag" && !step.tag.trim()) {
        setError("Add Tag steps need a tag name.");
        return;
      }
    }

    // Build triggerConfig JSON from human-readable input
    let triggerConfig: string | null = null;
    if (selectedTrigger === "tag_added" && triggerConfigValue.trim()) {
      triggerConfig = JSON.stringify({ tag: triggerConfigValue.trim() });
    } else if (selectedTrigger === "lead_magnet" && triggerConfigValue.trim()) {
      triggerConfig = JSON.stringify({ slug: triggerConfigValue.trim() });
    }

    formData.set("steps", JSON.stringify(steps));
    if (triggerConfig) formData.set("triggerConfig", triggerConfig);

    startTransition(async () => {
      const result = await createAutomation(formData);
      if (result.success) {
        setShowCreate(false);
        setSelectedTrigger("");
        setTriggerConfigValue("");
        setSteps([]);
        await load();
      } else {
        setError(result.error ?? "Failed to create automation");
      }
    });
  }

  function handleToggle(id: string) {
    startTransition(async () => {
      const result = await toggleAutomation(id);
      if (!result.success) {
        setError(result.error ?? "Failed to update automation status");
        return;
      }
      await load();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this automation?")) return;
    startTransition(async () => {
      await deleteAutomation(id);
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

  const activeCount = items.filter((a) => a.automationStatus === "active").length;
  const totalEnrolled = items.reduce((sum, a) => sum + (a.enrolledCount ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <Zap className="w-4 h-4" /><span className="text-xs">Total</span>
          </div>
          <p className="text-xl font-bold text-foreground">{items.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <ToggleRight className="w-4 h-4" /><span className="text-xs">Active</span>
          </div>
          <p className="text-xl font-bold text-foreground">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
            <Play className="w-4 h-4" /><span className="text-xs">Enrolled</span>
          </div>
          <p className="text-xl font-bold text-foreground">{totalEnrolled}</p>
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-foreground">Workflows</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-4 h-4" /> New Automation
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <h3 className="text-lg font-semibold text-foreground">Create Automation</h3>
          <form action={handleCreate} className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                name="name"
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Welcome email sequence"
              />
            </div>

            {/* Trigger */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">When this happens…</label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGERS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => { setSelectedTrigger(t.value); setTriggerConfigValue(""); }}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                        selectedTrigger === t.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <input type="hidden" name="triggerType" value={selectedTrigger} />
            </div>

            {/* Trigger config — human-readable inputs */}
            {selectedTrigger === "tag_added" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tag Name</label>
                <input
                  value={triggerConfigValue}
                  onChange={(e) => setTriggerConfigValue(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="vip"
                />
                <p className="mt-1 text-xs text-muted-foreground">Trigger fires when this exact tag is added to a subscriber.</p>
              </div>
            )}
            {selectedTrigger === "lead_magnet" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Lead Magnet Slug <span className="text-muted-foreground font-normal">(optional — leave blank to match all)</span></label>
                <input
                  value={triggerConfigValue}
                  onChange={(e) => setTriggerConfigValue(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder="growth-playbook"
                />
              </div>
            )}

            {/* Steps */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">Steps — do this…</label>
              <div className="space-y-3">
                {steps.length === 0 && (
                  <p className="text-sm text-muted-foreground">No steps yet. Add one below.</p>
                )}
                {steps.map((step, i) => (
                  <StepCard
                    key={i}
                    step={step}
                    index={i}
                    onChange={(updated) => updateStep(i, updated)}
                    onRemove={() => removeStep(i)}
                  />
                ))}
                <AddStepButton onAdd={addStep} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setSteps([]); setSelectedTrigger(""); }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !selectedTrigger}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Save Automation
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {items.length === 0 && !showCreate ? (
        <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-12 text-center">
          <Zap className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">No automations yet</p>
          <button onClick={() => setShowCreate(true)} className="mt-2 text-sm text-primary">
            Create your first automation
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((automation) => {
            const trigger = TRIGGERS.find((t) => t.value === automation.triggerType);
            const TriggerIcon = trigger?.icon ?? Zap;

            // Parse steps to show count
            let stepCount = 0;
            try { stepCount = (JSON.parse(automation.steps) as unknown[]).length; } catch { /* */ }

            return (
              <div key={automation.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          automation.automationStatus === "active"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {automation.automationStatus === "active" ? "Active" : automation.automationStatus === "paused" ? "Paused" : "Draft"}
                      </span>
                      {(automation.enrolledCount ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {automation.enrolledCount} enrolled
                        </span>
                      )}
                      {(automation.completedCount ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground">
                          · {automation.completedCount} completed
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-foreground truncate">{automation.name}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <TriggerIcon className="w-3 h-3" />
                        {trigger?.label ?? automation.triggerType}
                      </span>
                      {stepCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          {stepCount} step{stepCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleToggle(automation.id)}
                      disabled={isPending}
                      title={automation.automationStatus === "active" ? "Pause" : "Activate"}
                      className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {automation.automationStatus === "active" ? (
                        <ToggleRight className="w-4 h-4 text-success" />
                      ) : (
                        <ToggleLeft className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(automation.id)}
                      disabled={isPending}
                      className="rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
