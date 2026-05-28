"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  PenSquare,
  Send,
  Calendar,
  Search,
  Users,
  BarChart3,
  Megaphone,
  Target,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
  UsersRound,
  MessagesSquare,
  Mail,
  Zap,
  Workflow,
  Mic,
  Brain,
  FlaskConical,
  Radio,
  Star,
  Handshake,
} from "lucide-react";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";

interface SidebarProps {
  workspaceName: string;
  className?: string;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/content", label: "Create", icon: PenSquare },
  { href: "/dashboard/publisher", label: "Publisher", icon: Send },
  { href: "/dashboard/communities", label: "Communities", icon: MessagesSquare },
  { href: "/dashboard/newsletter", label: "Newsletter", icon: Mail },
  { href: "/dashboard/funnels", label: "Funnels", icon: Zap },
  { href: "/dashboard/automations", label: "Automations", icon: Workflow },
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/seo", label: "SEO", icon: Search },
  { href: "/dashboard/competitors", label: "Competitors", icon: Target },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/ads", label: "Ads", icon: Megaphone },
  { href: "/dashboard/signals", label: "Signals", icon: Radio },
  { href: "/dashboard/influencers", label: "Influencers", icon: Star },
  { href: "/dashboard/jv", label: "JV Marketing", icon: Handshake },
  { href: "/dashboard/swarm", label: "Swarm", icon: Brain },
  { href: "/dashboard/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/dashboard/reunion", label: "Reunion", icon: Users },
  { href: "/dashboard/team", label: "Team", icon: UsersRound },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings/voices", label: "Voices", icon: Mic },
  { href: "/dashboard/settings", label: "Brand Vault", icon: Settings },
];

export function Sidebar({ workspaceName, className = "" }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`flex h-full flex-col border-r border-border bg-card transition-all duration-200 ${
        collapsed ? "w-16" : "w-60"
      } ${className}`}
    >
      {/* Workspace Header */}
      <div className="flex items-center justify-between border-b border-border px-2 py-2">
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <WorkspaceSwitcher currentWorkspaceName={workspaceName} />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground shrink-0"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              } ${collapsed ? "justify-center" : ""}`}
              title={collapsed ? label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="border-t border-border px-3 py-3">
          <p className="text-xs text-muted-foreground">GrowthOS v0.7</p>
        </div>
      )}
    </aside>
  );
}
