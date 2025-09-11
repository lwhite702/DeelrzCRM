import { useState, useEffect } from "react";

export function useTenant() {
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

  return {
    currentTenant,
    selectTenant,
    clearTenant,
  };
}
