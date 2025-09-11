import { useQuery } from "@tanstack/react-query";

export function useFeatureFlags(tenantId: string | null) {
  return useQuery<Record<string, boolean>>({
    queryKey: ["/api/tenants", tenantId, "feature-flags"],
    enabled: !!tenantId,
  });
}
