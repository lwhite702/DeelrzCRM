import { createContext, useContext, useState, useEffect } from "react";

interface TenantContextType {
  currentTenant: string | null;
  selectTenant: (tenantId: string) => void;
  clearTenant: () => void;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [currentTenant, setCurrentTenant] = useState<string | null>(
    localStorage.getItem("currentTenant")
  );

  const selectTenant = (tenantId: string) => {
    setCurrentTenant(tenantId);
    localStorage.setItem("currentTenant", tenantId);
  };

  const clearTenant = () => {
    setCurrentTenant(null);
    localStorage.removeItem("currentTenant");
  };

  useEffect(() => {
    const stored = localStorage.getItem("currentTenant");
    if (stored && stored !== currentTenant) {
      setCurrentTenant(stored);
    }
  }, [currentTenant]);

  return (
    <TenantContext.Provider value={{ currentTenant, selectTenant, clearTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}