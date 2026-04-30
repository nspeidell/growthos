"use client";

import { useState, useEffect, useTransition } from "react";
import {
  Mail,
  Plus,
  Send,
  Trash2,
  Users,
  TrendingUp,
  Clock,
  CheckCircle2,
  Loader2,
  UserPlus,
} from "lucide-react";
import {
  listSubscribers,
  getSubscriberStats,
  addSubscriber,
  listNewsletters,
  createNewsletter,
  sendNewsletter,
  deleteNewsletter,
  type SubscriberStats,
} from "./actions";
import type { Subscriber, Newsletter } from "@/lib/db/schema";

export default function NewsletterDashboard() {
  const [subs, setSubs] = useState<Subscriber[]>([]);
  const [stats, setStats] = useState<SubscriberStats | null>(null);
  const [nls, setNls] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"newsletters" | "subscribers" | "compose">("newsletters");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [subsRes, statsRes, nlsRes] = await Promise.all([
      listSubscribers(),
      getSubscriberStats(),
      listNewsletters(),
    ]);
    if (subsRes.success && subsRes.data) setSubs(subsRes.data);
    if (statsRes.success && statsRes.data) setStats(statsRes.data);
    if (nlsRes.success && nlsRes.data) setNls(nlsRes.data);
    setLoading(false);
  }

  function handleAddSubscriber(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addSubscriber(formData);
      if (result.success) await load();
      else setError(result.error ?? "Failed");
    });
  }

  function handleCreateNewsletter(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createNewsletter(formData);
      if (result.success) {
        setActiveTab("newsletters");
        await load();
      } else {
        setError(result.error ?? "Failed");
      }
    });
  }

  function handleSend(id: string) {
    if (!confirm("Send this newsletter to all matching subscribers?")) return;
    startTransition(async () => {
      await sendNewsletter(id);
      await load();
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this newsletter?")) return;
    startTransition(async () => {
      await deleteNewsletter(id);
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
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users className="w-4 h-4" />} label="Total" value={stats.total} />
          <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Active" value={stats.active} />
          <StatCard icon={<TrendingUp className="w-4 h-4" />} label="This Week" value={`+${stats.thisWeek}`} />
          <StatCard icon={<Mail className="w-4 h-4" />} label="Newsletters" value={nls.length} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(["newsletters", "subscribers", "compose"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors capitalize ${
              activeTab === tab
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "compose" ? "+ Compose" : tab}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Compose */}
      {activeTab === "compose" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Compose Newsletter</h3>
          <form action={handleCreateNewsletter} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Subject</label>
                <input name="subject" required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" placeholder="Weekly Growth Update" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Preview Text</label>
                <input name="previewText" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" placeholder="Shows in inbox preview" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">From Name</label>
                <input name="fromName" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" placeholder="Nick at GrowthOS" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Target Tags (comma-separated)</label>
                <input name="targetTags" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" placeholder="Leave empty for all subscribers" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Body (HTML supported)</label>
              <textarea name="body" required rows={8} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono focus:border-ring focus:ring-1 focus:ring-ring" placeholder="<p>Hey there!</p>" />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={isPending} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Save Draft
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Newsletters List */}
      {activeTab === "newsletters" && (
        <div className="space-y-3">
          {nls.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-card/50 py-12 text-center">
              <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No newsletters yet</p>
              <button onClick={() => setActiveTab("compose")} className="mt-2 text-sm text-primary">
                Compose your first newsletter
              </button>
            </div>
          ) : (
            nls.map((nl) => (
              <div key={nl.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        nl.newsletterStatus === "sent" ? "bg-success/10 text-success" :
                        nl.newsletterStatus === "sending" ? "bg-warning/10 text-warning" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {nl.newsletterStatus === "sent" ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {nl.newsletterStatus}
                      </span>
                    </div>
                    <p className="font-medium text-foreground">{nl.subject}</p>
                    {nl.previewText && <p className="text-sm text-muted-foreground mt-0.5">{nl.previewText}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {nl.newsletterStatus === "draft" && (
                      <button onClick={() => handleSend(nl.id)} disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-success-foreground hover:bg-success/90 disabled:opacity-50">
                        <Send className="w-3.5 h-3.5" /> Send
                      </button>
                    )}
                    <button onClick={() => handleDelete(nl.id)} disabled={isPending} className="rounded-lg border border-destructive/20 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {nl.sentCount != null && nl.sentCount > 0 && (
                  <div className="grid grid-cols-4 gap-4 mt-3 pt-3 border-t border-border text-xs">
                    <div><span className="text-muted-foreground">Sent</span><p className="font-semibold text-foreground">{nl.sentCount}</p></div>
                    <div><span className="text-muted-foreground">Opened</span><p className="font-semibold text-foreground">{nl.openedCount ?? 0}</p></div>
                    <div><span className="text-muted-foreground">Clicked</span><p className="font-semibold text-foreground">{nl.clickedCount ?? 0}</p></div>
                    <div><span className="text-muted-foreground">Open Rate</span><p className="font-semibold text-foreground">{nl.sentCount > 0 ? ((nl.openedCount ?? 0) / nl.sentCount * 100).toFixed(1) : 0}%</p></div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Subscribers */}
      {activeTab === "subscribers" && (
        <div className="space-y-4">
          {/* Add Subscriber */}
          <form action={handleAddSubscriber} className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-foreground mb-1">Email</label>
              <input name="email" type="email" required className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" placeholder="user@example.com" />
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-foreground mb-1">Name</label>
              <input name="name" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" />
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-foreground mb-1">Tags</label>
              <input name="tags" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:border-ring focus:ring-1 focus:ring-ring" placeholder="vip, beta" />
            </div>
            <input type="hidden" name="source" value="manual" />
            <button type="submit" disabled={isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <UserPlus className="w-4 h-4" /> Add
            </button>
          </form>

          {/* Subscriber List */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tags</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No subscribers yet
                    </td>
                  </tr>
                ) : (
                  subs.slice(0, 50).map((sub) => {
                    const tags = sub.tags ? (JSON.parse(sub.tags) as string[]) : [];
                    return (
                      <tr key={sub.id}>
                        <td className="px-4 py-3 text-foreground">{sub.email}</td>
                        <td className="px-4 py-3 text-muted-foreground">{sub.name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {tags.map((tag) => (
                              <span key={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{sub.source}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            sub.subscriberStatus === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                          }`}>
                            {sub.subscriberStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">{icon}<span className="text-xs">{label}</span></div>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );
}
