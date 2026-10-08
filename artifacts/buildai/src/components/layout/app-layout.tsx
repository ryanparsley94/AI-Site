import { useState } from "react";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import Sidebar from "@/components/layout/sidebar";
import { AuthGate } from "@/components/auth-gate";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] w-full bg-background">
      {/* Sidebar (desktop: static, mobile: overlay) */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-sidebar border-b border-sidebar-border shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} className="text-sidebar-foreground" />
          </button>
          <BrandLogo className="h-10 w-auto" />
        </header>

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate><AuthenticatedLayout>{children}</AuthenticatedLayout></AuthGate>;
}
