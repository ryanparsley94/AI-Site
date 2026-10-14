import { Link, useLocation } from "wouter";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";
import {
  getListMarketingDraftsQueryKey,
  getListTasksQueryKey,
  useListMarketingDrafts,
  useListTasks,
  useUnreviewedWidgetCount,
} from "@workspace/api-client-react";
import {
  Award,
  Bot,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Database,
  Inbox,
  LayoutDashboard,
  Phone,
  Receipt,
  Settings,
  Users,
  WandSparkles,
  X,
} from "lucide-react";

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

const navGroups = [
  {
    title: "OPERATIONS",
    items: [
      { href: "/dashboard", label: "Control Centre", icon: LayoutDashboard },
      { href: "/tasks", label: "Tasks", icon: ClipboardList },
      { href: "/calls", label: "Enquiries", icon: Phone },
      { href: "/sales", label: "Sales", icon: BriefcaseBusiness },
    ],
  },
  {
    title: "FIELD",
    items: [
      { href: "/schedule", label: "Scheduler", icon: CalendarDays },
      { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
      { href: "/contacts", label: "Customers", icon: Users },
    ],
  },
  {
    title: "COMMERCIAL",
    items: [
      { href: "/quotes", label: "Quotes", icon: Calculator },
      { href: "/invoices", label: "Invoices", icon: Receipt },
      { href: "/certificates", label: "Certificates", icon: Award },
    ],
  },
  {
    title: "AI OFFICE",
    items: [
      { href: "/email-inbox", label: "Email Desk", icon: Inbox },
      { href: "/assistants", label: "AI Receptionist", icon: Bot },
    ],
  },
  {
    title: "SYSTEM",
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
    query: {
      queryKey: getListTasksQueryKey(),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const pendingTaskCount = tasks.filter((task) => task.status === "pending").length;

  const { data: marketingDrafts = [] } = useListMarketingDrafts(undefined, {
    query: {
      queryKey: getListMarketingDraftsQueryKey(),
      refetchInterval: 15_000,
      refetchOnWindowFocus: true,
    },
  });
  const pendingMarketingCount = marketingDrafts.filter((draft) => draft.status === "pending").length;

  const sidebarContent = (
    <aside className="flex h-full w-[268px] shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-5 pb-4 pt-5">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="block transition-opacity hover:opacity-90"
          data-testid="link-sidebar-home"
        >
          <BrandLogo className="h-10 w-auto" />
        </Link>
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[.22em] text-sidebar-foreground/40">
            OFFICE OS
          </span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.16em] text-sidebar-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary shadow-[0_0_10px_rgba(54,198,213,.7)]" />
            ACTIVE
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-3 top-3 rounded-sm p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
            aria-label="Close menu"
            data-testid="button-close-sidebar"
          >
            <X size={19} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-3" aria-label="Main navigation">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="mb-1.5 px-3 pt-1 font-mono text-[8px] font-semibold tracking-[.22em] text-sidebar-foreground/30">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = location === item.href || location.startsWith(`${item.href}/`);
                const badgeCount =
                  item.href === "/tasks"
                    ? pendingTaskCount
                    : item.href === "/calls"
                      ? unreviewedCount
                      : item.href === "/assistants"
                        ? pendingMarketingCount
                        : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    data-testid={`nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                    className={cn(
                      "group relative flex min-h-10 items-center gap-3 border-l-2 px-3 py-2 text-[13px] font-medium transition-colors",
                      isActive
                        ? "border-sidebar-primary bg-sidebar-accent/85 text-sidebar-accent-foreground"
                        : "border-transparent text-sidebar-foreground/60 hover:border-sidebar-foreground/15 hover:bg-sidebar-accent/45 hover:text-sidebar-foreground",
                    )}
                  >
                    <item.icon
                      size={16}
                      strokeWidth={isActive ? 2.1 : 1.7}
                      className={isActive ? "text-sidebar-primary" : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/70"}
                    />
                    <span className="flex-1">{item.label}</span>
                    {badgeCount > 0 && (
                      <span
                        className={cn(
                          "min-w-[20px] px-1.5 py-0.5 text-center font-mono text-[9px] font-semibold",
                          item.href === "/calls"
                            ? "bg-amber-400/10 text-amber-300"
                            : item.href === "/assistants"
                              ? "bg-primary/10 text-primary"
                              : "bg-sidebar-accent text-sidebar-foreground/70",
                        )}
                      >
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto border-t border-sidebar-border p-3">
        <Link
          href="/business-setup"
          onClick={onClose}
          className="block border border-sidebar-border bg-sidebar-accent/25 px-3 py-3 transition-colors hover:border-sidebar-primary/30 hover:bg-sidebar-accent/55"
          data-testid="link-sidebar-pilot-setup"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[.16em] text-sidebar-foreground/45">
              Workspace
            </span>
            <span className="text-[9px] text-sidebar-primary">Configure</span>
          </div>
          <p className="mt-2 text-[11px] font-medium text-sidebar-foreground/80">Business profile & connections</p>
          <p className="mt-1 text-[10px] leading-relaxed text-sidebar-foreground/40">Phone, email, company details and service setup.</p>
        </Link>
      </div>
    </aside>
  );

  return (
    <>
      <div className="hidden h-screen md:flex">{sidebarContent}</div>
      {open && (
        <>
          <button
            aria-label="Close navigation"
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
            onClick={onClose}
            data-testid="button-sidebar-backdrop"
          />
          <div className="fixed inset-y-0 left-0 z-50 h-full md:hidden">{sidebarContent}</div>
        </>
      )}
    </>
  );
}
