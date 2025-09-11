import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFeatureFlags } from "@/hooks/use-feature-flags";

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
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

export default function MobileSidebar({ isOpen, onClose, tenantId }: MobileSidebarProps) {
  const [location] = useLocation();
  const { data: featureFlags = {} } = useFeatureFlags(tenantId);

  const filteredNavItems = navItems.filter(item => {
    if (!item.flagKey) return true;
    return featureFlags[item.flagKey] === true;
  });

  if (!isOpen) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-50">
      <div 
        className="fixed inset-0 bg-black bg-opacity-50" 
        onClick={onClose}
        data-testid="overlay-mobile-sidebar"
      />
      <nav className="fixed left-0 top-0 bottom-0 flex flex-col w-64 bg-card border-r border-border">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <i className="fas fa-pills text-primary-foreground text-sm"></i>
            </div>
            <h1 className="text-lg font-semibold text-foreground">PharmaCare</h1>
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            className="p-2"
            onClick={onClose}
            data-testid="button-close-mobile-sidebar"
          >
            <i className="fas fa-times text-xl"></i>
          </Button>
        </div>
        
        <div className="flex-1 px-3 pt-4 space-y-1 overflow-y-auto">
          {filteredNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                location === item.href
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              data-testid={`link-mobile-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <i className={`${item.icon} mr-3 text-base`}></i>
              {item.label}
            </Link>
          ))}
          
          <div className="pt-4 border-t border-border mt-6">
            <Link
              href="/settings"
              onClick={onClose}
              className={cn(
                "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                location === "/settings"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              data-testid="link-mobile-settings"
            >
              <i className="fas fa-cog mr-3 text-base"></i>
              Settings
            </Link>
            
            <Link
              href="/super-admin"
              onClick={onClose}
              className={cn(
                "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                location === "/super-admin"
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              data-testid="link-mobile-super-admin"
            >
              <i className="fas fa-crown mr-3 text-base"></i>
              Super Admin
            </Link>
          </div>
        </div>
      </nav>
    </div>
  );
}
