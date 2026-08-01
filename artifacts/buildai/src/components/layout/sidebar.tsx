import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  Phone, 
  CalendarDays, 
  Bot, 
  Users, 
  Settings,
  HardHat,
  Calculator
} from "lucide-react";

export default function Sidebar() {
  const [location] = useLocation();

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/calls", label: "Call Log", icon: Phone },
    { href: "/jobs", label: "Job Schedule", icon: CalendarDays },
    { href: "/quotes", label: "AI Quotes", icon: Calculator },
    { href: "/assistants", label: "AI Assistants", icon: Bot },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-screen overflow-y-auto shrink-0">
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center gap-3 text-sidebar-primary font-bold text-xl hover:opacity-90 transition-opacity">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground p-2 rounded-md">
            <HardHat size={24} />
          </div>
          BuildAI
        </Link>
      </div>
      
      <div className="flex-1 px-4 space-y-1">
        <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">
          Command Center
        </div>
        {navItems.map((item) => {
          const isActive = location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon size={18} className={isActive ? "text-sidebar-primary" : "opacity-70"} />
              {item.label}
            </Link>
          );
        })}
      </div>
      
      <div className="p-4 border-t border-sidebar-border mt-auto">
        <div className="bg-sidebar-accent/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-green-500"></div>
            <span className="text-xs font-medium">All systems operational</span>
          </div>
          <p className="text-xs text-sidebar-foreground/60 leading-relaxed">
            Your AI assistants are currently active and handling calls.
          </p>
        </div>
      </div>
    </div>
  );
}
