"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Zap,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Mail,
  Tag,
  Clock,
  Webhook,
  UserPlus,
  Download,
  Play,
} from "lucide-react";
import {
  listAutomations,
  createAutomation,
  toggleAutomation,
  deleteAutomation,
} from "./actions";
import type { Automation } from "@/lib/db/schema";

const TRIGGERS = [
  { value: "subscriber_added", label: "New Subscriber", icon: UserPlus, description: "When someone subscribes" },
  { value: "tag_added", label: "Tag Added", icon: Tag, description: "When a tag is applied" },
  { value: "lead_magnet_downloaded", label: "Lead Magnet", icon: Download, description: "When a lead magnet is downloaded" },
  { value: "manual", label: "Manual", icon: Play, description: "Triggered manually" },
];

const ACTIONS = [
  { value: "send_email", label: "Send Email", icon: Mail, description: "Send a templated email" },
  { value: "add_tag", label: "Add Tag", icon: Tag, description: "Apply a tag to the subscriber" },
  { value: "wait", label: "Wait/Delay", icon: Clock, description: "Wait before next action" },
  { value: "webhook", label: "Webhook", icon: Webhook, description: "Call an external URL" },
];

export default function AutomationsDashboard() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [selectedTrigger, setSelectedTrigger] = useState("");
  const [selectedAction, setSelectedAction] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const result = await listAutomations();
    if (result.success && result.data) setItems(result.data);
    setLoading(false);
  }

  function handleCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createAutomation(formData);
      if (result.success) {
        setShowCreate(false);
        setSelectedTrigger("");
        setSelectedAction("");
        await load();
      } else {
        setError(result.error ?? "Failed to create automation");
      }
    });
  }

  function handleToggle(id: string) {
    startTransition(async () => {
      await toggleAutomation(id);
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

  const activeCount = items.filter((a) => a.isActive).length;
  const totalExecutions = items.reduce((sum, a) => sum + (a.executionCount ?? 0), 0);

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
            <Play className="w-4 h-4" /><span className="text-xs">Executions</span>
          </div>
          <p className="text-xl font-bold text-foreground">{totalExecutions}</p>
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
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h3 className="text-lg font-semibold text-foreground">Create Automation</h3>
          <form action={handleCreate} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Name</label>
              <input
                name="name"
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Welcome email sequence"
              />
            </div>

            {/* Trigger Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">When this happens...</label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGERS.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSelectedTrigger(t.value)}
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
              <input type="hidden" name="trigger" value={selectedTrigger} />
            </div>

            {/* Trigger Config */}
            {selectedTrigger === "tag_added" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tag Name</label>
                <input
                  name="triggerConfig"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder='{"tag": "vip"}'
                />
              </div>
            )}
            {selectedTrigger === "lead_magnet_downloaded" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Lead Magnet Slug (optional)</label>
                <input
                  name="triggerConfig"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder='{"slug": "growth-playbook"}'
                />
              </div>
            )}

            {/* Action Selection */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">...do this:</label>
              <div className="grid grid-cols-2 gap-2">
                {ACTIONS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setSelectedAction(a.value)}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-left transition-colors ${
                        selectedAction === a.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.label}</p>
                        <p className="text-xs text-muted-foreground">{a.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <input type="hidden" name="action" value={selectedAction} />
            </div>

            {/* Action Config */}
            {selectedAction === "send_email" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Email Config (JSON)</label>
                <textarea
                  name="actionConfig"
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder='{"subject": "Welcome!", "body": "<p>Hey {{name}}!</p>"}'
                />
              </div>
            )}
            {selectedAction === "add_tag" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Tag to add</label>
                <input
                  name="actionConfig"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder='{"tag": "engaged"}'
                />
              </div>
            )}
            {selectedAction === "wait" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Delay (JSON)</label>
                <input
                  name="actionConfig"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder='{"delayHours": 24}'
                />
              </div>
            )}
            {selectedAction === "webhook" && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Webhook URL</label>
                <input
                  name="actionConfig"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring"
                  placeholder='{"url": "https://hooks.example.com/...", "method": "POST"}'
                />
              </div>
            )}

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
                disabled={isPending || !selectedTrigger || !selectedAction}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Automations List */}
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
            const trigger = TRIGGERS.find((t) => t.value === automation.trigger);
            const action = ACTIONS.find((a) => a.value === automation.action);
            const TriggerIcon = trigger?.icon ?? Zap;
            const ActionIcon = action?.icon ?? Zap;

            return (
              <div key={automation.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          automation.isActive
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {automation.isActive ? "Active" : "Paused"}
                      </span>
                      {automation.executionCount != null && automation.executionCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {automation.executionCount} runs
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-foreground">{automation.name}</p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <TriggerIcon className="w-3 h-3" />
                        {trigger?.label ?? automation.trigger}
                      </span>
                      <span>→</span>
                      <span className="inline-flex items-center gap-1">
                        <ActionIcon className="w-3 h-3" />
                        {action?.label ?? automation.action}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(automation.id)}
                      disabled={isPending}
                      className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {automation.isActive ? (
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
