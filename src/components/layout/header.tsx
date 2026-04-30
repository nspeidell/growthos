"use client";

import { useState } from "react";
import { Bell, LogOut, User } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

interface HeaderProps {
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  className?: string;
}

export function Header({
  userName,
  userEmail,
  avatarUrl,
  className = "",
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.redirected) {
      window.location.href = response.url;
    } else {
      window.location.href = "/login";
    }
  }

  return (
    <header
      className={`flex h-14 items-center justify-between border-b border-border bg-card px-4 ${className}`}
    >
      {/* Left: Mobile logo (visible only on mobile where sidebar is hidden) */}
      <div className="md:hidden">
        <span className="text-lg font-bold text-foreground">GrowthOS</span>
      </div>

      {/* Left: Spacer on desktop */}
      <div className="hidden md:block" />

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications */}
        <button className="relative rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
          <Bell className="h-5 w-5" />
        </button>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-full p-1 hover:bg-accent transition-colors"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={userName}
                className="h-8 w-8 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="h-4 w-4" />
              </div>
            )}
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-popover text-popover-foreground py-1 shadow-lg">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-sm font-medium">
                    {userName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
