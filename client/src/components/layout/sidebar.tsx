import { Link, useLocation } from "@/lib/router";
import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

interface SidebarProps {
  tenantId: string | null;
}

interface NavItem {
  href: string;
  icon: string;
  label: string;
  flagKey?: string;
}

const navItems: NavItem[] = [
  { href: "/dashboard", icon: "fas fa-chart-line", label: "Dashboard", flagKey: "dashboard" },
  { href: "/inventory", icon: "fas fa-boxes", label: "Inventory", flagKey: "inventory" },
  { href: "/customers", icon: "fas fa-users", label: "Customers", flagKey: "customers" },
  { href: "/sales", icon: "fas fa-cash-register", label: "Sales POS", flagKey: "sales" },
  { href: "/delivery", icon: "fas fa-truck", label: "Delivery", flagKey: "delivery" },
  { href: "/loyalty", icon: "fas fa-star", label: "Loyalty", flagKey: "loyalty" },
  { href: "/credit", icon: "fas fa-credit-card", label: "Credit", flagKey: "credit" },
  { href: "/payments", icon: "fas fa-money-bill-wave", label: "Payments", flagKey: "payments" },
];

export default function Sidebar({ tenantId }: SidebarProps) {
  const [location] = useLocation();
  const { data: featureFlags = {} } = useFeatureFlags(tenantId);

  const filteredNavItems = navItems.filter(item => {
    if (!item.flagKey) return true;
    return featureFlags[item.flagKey] === true;
  });

  return (
    <nav className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-16 bg-card border-r border-border" data-testid="sidebar-navigation">
      <div className="flex-1 flex flex-col min-h-0 pt-4 pb-4">
        <div className="flex-1 px-3 space-y-1">
          {filteredNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                location === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-').replace(' pos', '')}`}
            >
              <i className={`${item.icon} mr-3 text-base`}></i>
              {item.label}
            </Link>
          ))}
        </div>
        
        <div className="px-3 mt-6 border-t border-border pt-4">
          <Link
            href="/settings"
            className={cn(
              "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
              location === "/settings"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            data-testid="link-settings"
          >
            <i className="fas fa-cog mr-3 text-base"></i>
            Settings
          </Link>
          
          <Link
            href="/help"
            className={cn(
              "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
              location === "/help"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            data-testid="nav-help"
          >
            <i className="fas fa-question-circle mr-3 text-base"></i>
            Help
          </Link>
          
          <Link
            href="/super-admin"
            className={cn(
              "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
              location === "/super-admin"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            data-testid="link-super-admin"
          >
            <i className="fas fa-crown mr-3 text-base"></i>
            Super Admin
          </Link>
        </div>
      </div>
    </nav>
  );
}
