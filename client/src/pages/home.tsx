import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/tenant-context";
import TenantSelector from "./tenant-selector";
import Dashboard from "@/pages/dashboard";

export default function Home() {
  const { user } = useAuth();
  const { selectTenant } = useTenant();

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Always show tenant selector - if tenant is selected, main routing in App.tsx handles it
  return <TenantSelector onTenantSelect={selectTenant} />;
}
