import { useState } from "react";
import Header from "./header";
import Sidebar from "./sidebar";
import MobileSidebar from "./mobile-sidebar";
import { useTenant } from "@/contexts/tenant-context";
import { useQuery } from "@tanstack/react-query";
import { GuidedTour } from "@/components/help/guided-tour";
import { useTour } from "@/hooks/use-tour";

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

  // Tour management
  const {
    isTourActive,
    shouldShowTourPrompt,
    canResumeTour,
    startTour,
    completeTour,
    skipTour,
    updateTourProgress,
  } = useTour({
    autoStartForNewUsers: true,
    persistProgress: true,
  });

  return (
    <div className="min-h-screen bg-background" data-testid="main-layout">
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

      {/* Guided Tour Component */}
      <GuidedTour
        isActive={isTourActive}
        onStart={() => {
          console.log('Tour started');
        }}
        onComplete={completeTour}
        onSkip={skipTour}
        onProgress={(currentStep, totalSteps, stepId) => {
          console.log(`Tour progress: ${currentStep}/${totalSteps} - ${stepId}`);
          updateTourProgress(stepId, 'completed');
        }}
      />
    </div>
  );
}
