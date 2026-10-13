import { Link, useLocation } from "wouter";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";
import { getListTasksQueryKey, useListMarketingDrafts, useListTasks, useUnreviewedWidgetCount } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Phone,
  CalendarDays,
  BriefcaseBusiness,
  Bot,
  Users,
  Settings,
  Calculator,
  Award,
  Inbox,
  Receipt,
  ClipboardList,
  Database,
  CreditCard,
  WandSparkles,
  X,
} from "lucide-react";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const navGroups = [
  {
    title: "Daily work",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tasks", label: "Tasks", icon: ClipboardList },
      { href: "/calls", label: "Enquiries", icon: Phone },
      { href: "/sales", label: "Sales", icon: BriefcaseBusiness },
    ],
  },
  {
    title: "Customers & jobs",
    items: [
      { href: "/contacts", label: "Customers", icon: Users },
        { href: "/schedule", label: "Schedule", icon: CalendarDays },
        { href: "/jobs", label: "Jobs", icon: ClipboardList },
    ],
  },
  {
    title: "Money & documents",
    items: [
      { href: "/quotes", label: "Quote Builder", icon: Calculator },
      { href: "/invoices", label: "Invoices", icon: Receipt },
        { href: "/certificates", label: "Certificates", icon: Award },
    ],
  },
  {
    title: "Communications & AI",
    items: [
      { href: "/email-inbox", label: "Email Inbox", icon: Inbox },
      { href: "/assistants", label: "AI Receptionist", icon: Bot },
    ],
  },
  {
    title: "Business admin",
    items: [
      { href: "/business-setup", label: "Business Setup", icon: WandSparkles },
      { href: "/data-import", label: "Data Import", icon: Database },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function Sidebar({ open, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { data: badgeData } = useUnreviewedWidgetCount();
  const unreviewedCount = badgeData?.count ?? 0;
  const { data: tasks = [] } = useListTasks({
    query: { queryKey: getListTasksQueryKey(), refetchInterval: 30_000, refetchOnWindowFocus: true },
  });
  const pendingTaskCount = tasks.filter((task) => task.status === "pending").length;
  const { data: marketingDrafts = [] } = useListMarketingDrafts(undefined, {
    query: { refetchInterval: 15_000, refetchOnWindowFocus: true },
  });
  const pendingMarketingCount = marketingDrafts.filter((draft) => draft.status === "pending").length;

  const sidebarContent = (
    <div className="flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border/70 px-5 py-4">
        <Link href="/dashboard" onClick={onClose} className="flex items-center transition-opacity hover:opacity-85" data-testid="link-sidebar-home">
          <BrandLogo className="h-10 w-auto" />
        </Link>
        {onClose && (
          <button onClick={onClose} className="rounded-sm p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden" aria-label="Close menu" data-testid="button-close-sidebar">
            <X size={19} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 pb-5 pt-3" aria-label="Main navigation">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-4" data-testid={`nav-group-${group.title.toLowerCase().replaceAll(/[^a-z]+/g, "-")}`}>
            <p className="mb-1.5 px-3 pt-2 text-[9px] font-semibold uppercase tracking-[.16em] text-sidebar-foreground/40">{group.title}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location === item.href || location.startsWith(`${item.href}/`);
                const badgeCount = item.href === "/tasks" ? pendingTaskCount : item.href === "/calls" ? unreviewedCount : item.href === "/assistants" ? pendingMarketingCount : 0;
                return (
                  <Link key={item.href} href={item.href} onClick={onClose} data-testid={`nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                    className={cn(
                      "relative flex items-center gap-3 rounded-sm px-3 py-[9px] text-[13px] font-medium transition-colors",
                      isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    )}>
                    <item.icon size={16} strokeWidth={1.8} className={isActive ? "text-sidebar-primary" : "opacity-75"} />
                    <span className="flex-1">{item.label}</span>
                    {badgeCount > 0 && <span aria-label={item.href === "/assistants" ? `${badgeCount} pending marketing ${badgeCount === 1 ? "draft" : "drafts"}` : item.href === "/tasks" ? `${badgeCount} pending tasks` : `${badgeCount} unreviewed calls`}
                      data-testid={`badge-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                      className={cn(
                        "ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-sm px-1 text-[10px] font-semibold leading-none",
                        item.href === "/assistants" ? "bg-red-600 text-white" : "bg-primary/15 text-primary",
                      )}>
                      {item.href === "/calls" && badgeCount > 99 ? "99+" : badgeCount}
                    </span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-auto border-t border-sidebar-border p-3">
        <Link href="/business-setup" onClick={onClose} data-testid="link-sidebar-pilot-setup"
          className="block rounded-sm border border-sidebar-border/80 bg-sidebar-accent/35 px-3 py-3 transition-colors hover:bg-sidebar-accent/70">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary/70" />
            <span className="text-[11px] font-semibold">Business setup</span>
          </div>
          <p className="text-[10px] leading-relaxed text-sidebar-foreground/50">Company profile, phone and email connections.</p>
        </Link>
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden h-screen md:flex">{sidebarContent}</div>
      {open && (
        <>
          <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-background/75 md:hidden" onClick={onClose} data-testid="button-sidebar-backdrop" />
          <div className="fixed inset-y-0 left-0 z-50 h-full md:hidden">{sidebarContent}</div>
        </>
      )}
    </>
  );
}
