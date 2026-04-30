"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  PenSquare,
  Send,
  BarChart3,
  Menu,
  X,
  Calendar,
  Search,
  Target,
  Megaphone,
  Users,
  Layers,
  CreditCard,
  Settings,
  Brain,
  FlaskConical,
  Radio,
} from "lucide-react";

interface BottomNavProps {
  className?: string;
}

const PRIMARY_TABS = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/content", label: "Create", icon: PenSquare },
  { href: "/dashboard/publisher", label: "Publish", icon: Send },
  { href: "/dashboard/analytics", label: "Stats", icon: BarChart3 },
];

const MORE_ITEMS = [
  { href: "/dashboard/calendar", label: "Calendar", icon: Calendar },
  { href: "/dashboard/seo", label: "SEO", icon: Search },
  { href: "/dashboard/competitors", label: "Competitors", icon: Target },
  { href: "/dashboard/ads", label: "Ads", icon: Megaphone },
  { href: "/dashboard/signals", label: "Signals", icon: Radio },
  { href: "/dashboard/swarm", label: "Swarm", icon: Brain },
  { href: "/dashboard/experiments", label: "Experiments", icon: FlaskConical },
  { href: "/dashboard/opportunities", label: "Outreach", icon: Users },
  { href: "/dashboard/team", label: "Team", icon: Layers },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function BottomNav({ className = "" }: BottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = MORE_ITEMS.some(
    (item) =>
      item.href === pathname || pathname.startsWith(item.href + "/")
  );

  return (
    <>
      {/* More Menu Sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-16 left-0 right-0 rounded-t-2xl bg-white px-4 pb-4 pt-3 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">More</h3>
              <button
                onClick={() => setMoreOpen(false)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {MORE_ITEMS.map(({ href, label, icon: Icon }) => {
                const isActive =
                  pathname === href || pathname.startsWith(href + "/");
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs transition-colors ${
                      isActive
                        ? "bg-brand-50 text-brand-700"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <nav
        className={`z-30 flex h-16 items-center justify-around border-t border-gray-200 bg-white ${className}`}
      >
        {PRIMARY_TABS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors ${
                isActive
                  ? "text-brand-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}

        {/* More Button */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors ${
            isMoreActive || moreOpen
              ? "text-brand-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Menu className="h-5 w-5" />
          <span className="font-medium">More</span>
        </button>
      </nav>
    </>
  );
}
