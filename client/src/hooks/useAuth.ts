import { useQuery } from "@tanstack/react-query";
import type { User, UserTenant, Tenant } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Get user tenant memberships and roles
  const { data: userMemberships = [], isLoading: membershipsLoading } = useQuery<(UserTenant & { tenant: Tenant })[]>({
    queryKey: ["/api/tenants"],
    enabled: !!user,
    retry: false,
  });

  // Check if user has super admin role
  const isSuperAdmin = userMemberships.some(membership => membership.role === "super_admin");

  return {
    user,
    userMemberships,
    isSuperAdmin,
    isLoading: isLoading || membershipsLoading,
    isAuthenticated: !!user,
  };
}
