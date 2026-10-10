import { Link, useLocation } from "wouter";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";
import { useUnreviewedWidgetCount } from "@workspace/api-client-react";
import { 
  LayoutDashboard, 
  Phone, 
  CalendarDays, 
  Bot, 
  Users, 
  Settings,
  Calculator,
  Award,
  Inbox,
  Receipt,
  ClipboardList,
  Database,
  X
} from "lucide-react";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { data: badgeData } = useUnreviewedWidgetCount();
  const unreviewedCount = badgeData?.count ?? 0;

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tasks", label: "Daily Tasks", icon: ClipboardList },
    { href: "/calls", label: "Call Log", icon: Phone },
    { href: "/jobs", label: "Job Schedule", icon: CalendarDays },
    { href: "/quotes", label: "Quote Builder", icon: Calculator },
    { href: "/invoices", label: "Invoices", icon: Receipt },
    { href: "/certificates", label: "Certificates", icon: Award },
    { href: "/assistants", label: "AI Assistants", icon: Bot },
    { href: "/email-inbox", label: "Email Inbox", icon: Inbox },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/data-import", label: "Data Import", icon: Database },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const sidebarContent = (
    <div className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-full overflow-y-auto shrink-0">
      <div className="p-6 flex items-center justify-between">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex items-center hover:opacity-90 transition-opacity"
        >
          <BrandLogo className="h-12 w-auto" />
        </Link>
        {/* Close button — mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 px-4 space-y-1">
        <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">
          Command Center
        </div>
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          const showBadge = item.href === "/calls" && unreviewedCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon size={18} className={isActive ? "text-sidebar-primary" : "opacity-70"} />
              <span className="flex-1">{item.label}</span>
              {showBadge && (
                <span className="ml-auto min-w-[1.25rem] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center leading-none">
                  {unreviewedCount > 99 ? "99+" : unreviewedCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <div className="bg-sidebar-accent/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-amber-500"></div>
            <span className="text-xs font-medium">Pilot verification required</span>
          </div>
          <p className="text-xs text-sidebar-foreground/60 leading-relaxed">
            Demo activity is not proof of a live receptionist. Phone and email setup must be verified.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden md:flex h-screen">
        {sidebarContent}
      </div>

      {/* Mobile: slide-in overlay */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={onClose}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 h-full md:hidden">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
}
