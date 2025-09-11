import { useState } from "react";
import Header from "./header";
import Sidebar from "./sidebar";
import MobileSidebar from "./mobile-sidebar";
import { useTenant } from "@/hooks/use-tenant";
import { useQuery } from "@tanstack/react-query";

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const { currentTenant } = useTenant();
  
  const { data: tenants } = useQuery<Array<{ tenant: { id: string; name: string } }>>({
    queryKey: ["/api/tenants"],
  });
  
  const currentTenantData = tenants?.find(t => t.tenant.id === currentTenant);
  const tenantName = currentTenantData?.tenant.name;

  return (
    <div className="min-h-screen bg-background">
      <Header 
        onMobileMenuToggle={() => setIsMobileSidebarOpen(true)}
        tenantName={tenantName}
      />
      
      <div className="flex">
        <Sidebar tenantId={currentTenant} />
        <MobileSidebar
          isOpen={isMobileSidebarOpen}
          onClose={() => setIsMobileSidebarOpen(false)}
          tenantId={currentTenant}
        />
        
        <main className="flex-1 lg:ml-64">
          {children}
        </main>
      </div>
    </div>
  );
}
