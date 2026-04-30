import { requireAuth } from "@/lib/auth/middleware";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAuth();

  return (
    <div className="flex h-dvh flex-col md:flex-row bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar
        workspaceName={session.workspaceName}
        className="hidden md:flex"
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          userName={session.name}
          userEmail={session.email}
          avatarUrl={session.avatarUrl}
          className="sticky top-0 z-10"
        />

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
        </main>
      </div>

      {/* Mobile bottom nav — hidden on desktop */}
      <BottomNav className="fixed bottom-0 left-0 right-0 md:hidden" />
    </div>
  );
}
