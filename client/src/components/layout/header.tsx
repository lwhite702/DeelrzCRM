import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/tenant-context";
import { HelpOverlay } from "@/components/help/help-overlay";
import { HelpCircle } from "lucide-react";
import { BrandMark } from "@/branding/BrandMark";

interface HeaderProps {
  onMobileMenuToggle: () => void;
  tenantName?: string;
}

export default function Header({ onMobileMenuToggle, tenantName }: HeaderProps) {
  const { user } = useAuth();
  const { clearTenant } = useTenant();
  const [helpOverlayOpen, setHelpOverlayOpen] = useState(false);

  const handleLogout = () => {
    clearTenant();
    window.location.href = "/api/logout";
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    if (!firstName && !lastName) return "U";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  // Global keyboard shortcuts for help
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+? or F1 to open help
      if ((e.ctrlKey && e.key === "?") || e.key === "F1") {
        e.preventDefault();
        setHelpOverlayOpen(true);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

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
              <BrandMark 
                variant="icon" 
                size="sm" 
                theme="auto"
                data-testid="brand-icon"
              />
              <div className="hidden sm:block">
                <h1 className="text-lg font-semibold text-foreground" data-testid="text-tenant-name">
                  {tenantName || "DeelRxCRM"}
                </h1>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className="p-2"
              onClick={() => setHelpOverlayOpen(true)}
              title="Help (Ctrl+? or F1)"
              data-testid="button-global-help"
            >
              <HelpCircle className="w-5 h-5" />
              <span className="sr-only">Help</span>
            </Button>
            
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
      
      <HelpOverlay 
        open={helpOverlayOpen} 
        onOpenChange={setHelpOverlayOpen} 
      />
    </header>
  );
}
