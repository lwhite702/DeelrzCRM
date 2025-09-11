import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/use-tenant";
import TenantSelector from "./tenant-selector";
import Dashboard from "@/pages/dashboard";

export default function Home() {
  const { user } = useAuth();
  const { currentTenant, selectTenant } = useTenant();

  console.log("🏠 Home component - currentTenant:", currentTenant);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Always show tenant selector - if tenant is selected, main routing in App.tsx handles it
  return <TenantSelector onTenantSelect={(tenantId) => {
    console.log("🎯 Tenant selected:", tenantId);
    selectTenant(tenantId);
  }} />;
}
