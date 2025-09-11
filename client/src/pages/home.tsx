import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/use-tenant";
import TenantSelector from "./tenant-selector";
import MainLayout from "@/components/layout/main-layout";
import Dashboard from "./dashboard";

export default function Home() {
  const { user } = useAuth();
  const { currentTenant, selectTenant } = useTenant();

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show tenant selector if no tenant is selected
  if (!currentTenant) {
    return <TenantSelector onTenantSelect={selectTenant} />;
  }

  // Show main application with dashboard as default
  return (
    <MainLayout>
      <Dashboard />
    </MainLayout>
  );
}
