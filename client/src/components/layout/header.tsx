import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/use-tenant";

interface HeaderProps {
  onMobileMenuToggle: () => void;
  tenantName?: string;
}

export default function Header({ onMobileMenuToggle, tenantName }: HeaderProps) {
  const { user } = useAuth();
  const { clearTenant } = useTenant();

  const handleLogout = () => {
    clearTenant();
    window.location.href = "/api/logout";
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  return (
    <header className="bg-card border-b border-border sticky top-0 z-40">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden p-2"
              onClick={onMobileMenuToggle}
              data-testid="button-mobile-menu"
            >
              <i className="fas fa-bars text-xl"></i>
            </Button>
            <div className="flex items-center space-x-3 ml-2 lg:ml-0">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
                <i className="fas fa-pills text-primary-foreground text-sm"></i>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-semibold text-foreground" data-testid="text-tenant-name">
                  {tenantName || "PharmaCare SaaS"}
                </h1>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" className="p-2">
              <i className="fas fa-bell text-lg"></i>
              <span className="sr-only">Notifications</span>
            </Button>
            
            <div className="flex items-center space-x-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-foreground" data-testid="text-user-name">
                  {user?.firstName || user?.lastName ? 
                    `${user.firstName || ""} ${user.lastName || ""}`.trim() : 
                    user?.email || "User"
                  }
                </p>
                <p className="text-xs text-muted-foreground" data-testid="text-user-role">Owner</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-medium p-0"
                onClick={handleLogout}
                data-testid="button-user-menu"
              >
                <span data-testid="text-user-initials">
                  {getInitials(user?.firstName || undefined, user?.lastName || undefined)}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
