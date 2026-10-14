import { useState } from "react";
import { Menu } from "lucide-react";
import { BriefcaseBusiness, CalendarDays, LayoutDashboard, MoreHorizontal, TrendingUp } from "lucide-react";
import { Link, useLocation } from "wouter";
import { BrandLogo } from "@/components/brand-logo";
import Sidebar from "@/components/layout/sidebar";
import { AuthGate } from "@/components/auth-gate";
import VoiceAssistant from "@/components/layout/voice-assistant";

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();
  const mobileLinks = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
    { href: "/schedule", label: "Scheduler", icon: CalendarDays },
    { href: "/sales", label: "Sales", icon: TrendingUp },
  ];

  return (
    <div className="flex min-h-[100dvh] w-full bg-background">
      {/* Sidebar (desktop: static, mobile: overlay) */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 h-[100dvh] overflow-hidden">
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

        <main className="flex-1 overflow-auto pb-36 md:pb-0">
          {children}
        </main>
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sidebar-border bg-sidebar/95 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur md:hidden" aria-label="Quick navigation">
          <div className="grid grid-cols-5">
            {mobileLinks.map(({ href, label, icon: Icon }) => {
              const active = location === href || location.startsWith(`${href}/`);
              return <Link key={href} href={href} aria-current={active ? "page" : undefined}
                data-testid={`mobile-nav-${label.toLowerCase()}`}
                className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium transition-colors ${active ? "text-sidebar-primary" : "text-sidebar-foreground/70 hover:text-sidebar-foreground"}`}>
                <Icon size={20} strokeWidth={active ? 2.3 : 1.8} aria-hidden="true" />
                <span>{label}</span>
              </Link>;
            })}
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="More navigation" aria-expanded={sidebarOpen}
              data-testid="mobile-nav-more" className="flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground">
              <MoreHorizontal size={20} aria-hidden="true" /><span>More</span>
            </button>
          </div>
        </nav>
      </div>
      <VoiceAssistant />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate><AuthenticatedLayout>{children}</AuthenticatedLayout></AuthGate>;
}
