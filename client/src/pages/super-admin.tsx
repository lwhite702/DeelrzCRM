import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface Tenant {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface TenantWithUsers extends Tenant {
  userCount: number;
}

interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
}

interface UserTenant {
  userId: string;
  tenantId: string;
  role: string;
  createdAt: string;
  user: User;
  tenant: Tenant;
}

interface FeatureFlag {
  id: number;
  key: string;
  description?: string;
  defaultEnabled: boolean;
}

interface FeatureFlagOverride {
  id: number;
  tenantId: string;
  flagKey: string;
  enabled: boolean;
  updatedAt: string;
}

export default function SuperAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tenants");
  const [newTenantName, setNewTenantName] = useState("");
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("staff");

  // Fetch tenants
  const { data: tenants, isLoading: tenantsLoading } = useQuery<TenantWithUsers[]>({
    queryKey: ["/api/tenants"],
  });

  // Fetch users (simplified - would need proper endpoint)
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: false, // Would need proper super admin endpoint
  });

  // Fetch feature flags
  const { data: featureFlags, isLoading: flagsLoading } = useQuery<FeatureFlag[]>({
    queryKey: ["/api/feature-flags"],
  });

  // Fetch user-tenant relationships
  const { data: userTenants, isLoading: userTenantsLoading } = useQuery<UserTenant[]>({
    queryKey: ["/api/user-tenants"],
    enabled: false, // Would need proper super admin endpoint
  });

  // Create tenant mutation
  const createTenantMutation = useMutation({
    mutationFn: async (tenantData: { name: string; status: string }) => {
      const res = await apiRequest("POST", "/api/tenants", tenantData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Tenant Created",
        description: "New tenant has been created successfully.",
      });
      setNewTenantName("");
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add user to tenant mutation
  const addUserToTenantMutation = useMutation({
    mutationFn: async (data: { userId: string; tenantId: string; role: string }) => {
      const res = await apiRequest("POST", "/api/user-tenants", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "User Added",
        description: "User has been added to tenant successfully.",
      });
      setSelectedTenant("");
      setSelectedUser("");
      setSelectedRole("staff");
      queryClient.invalidateQueries({ queryKey: ["/api/user-tenants"] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Add User",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update feature flag override mutation
  const updateFeatureFlagMutation = useMutation({
    mutationFn: async (data: { tenantId: string; flagKey: string; enabled: boolean }) => {
      const res = await apiRequest("POST", "/api/feature-flag-overrides", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Feature Flag Updated",
        description: "Feature flag setting has been updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/feature-flags"] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateTenant = () => {
    if (!newTenantName.trim()) {
      toast({
        title: "Invalid Input",
        description: "Please enter a tenant name.",
        variant: "destructive",
      });
      return;
    }

    createTenantMutation.mutate({
      name: newTenantName.trim(),
      status: "active",
    });
  };

  const handleAddUserToTenant = () => {
    if (!selectedTenant || !selectedUser || !selectedRole) {
      toast({
        title: "Invalid Input",
        description: "Please select tenant, user, and role.",
        variant: "destructive",
      });
      return;
    }

    addUserToTenantMutation.mutate({
      userId: selectedUser,
      tenantId: selectedTenant,
      role: selectedRole,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "trial":
        return "bg-blue-100 text-blue-800";
      case "suspended":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-purple-100 text-purple-800";
      case "owner":
        return "bg-blue-100 text-blue-800";
      case "manager":
        return "bg-green-100 text-green-800";
      case "staff":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (tenantsLoading || flagsLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Super Admin Portal</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage tenants, users, and global settings</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="tenants" data-testid="tab-tenants">Tenants</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="feature-flags" data-testid="tab-feature-flags">Feature Flags</TabsTrigger>
            <TabsTrigger value="kb-management" data-testid="tab-kb-management">KB Management</TabsTrigger>
            <TabsTrigger value="system" data-testid="tab-system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="tenants" className="space-y-6">
            {/* Create New Tenant */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Create New Tenant</h3>
                <div className="flex space-x-4">
                  <div className="flex-1">
                    <Label htmlFor="tenant-name" className="text-sm font-medium text-foreground">
                      Tenant Name
                    </Label>
                    <Input
                      id="tenant-name"
                      placeholder="Enter tenant name"
                      value={newTenantName}
                      onChange={(e) => setNewTenantName(e.target.value)}
                      data-testid="input-tenant-name"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button 
                      onClick={handleCreateTenant}
                      disabled={createTenantMutation.isPending}
                      data-testid="button-create-tenant"
                    >
                      {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tenants List */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Tenant Management</h3>
                
                {!tenants || tenants.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-building text-2xl text-muted-foreground"></i>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Tenants Found</h3>
                    <p className="text-muted-foreground">Create your first tenant to get started.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Tenant
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Users
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-card divide-y divide-border">
                        {tenants.map((tenant) => (
                          <tr key={tenant.id} className="hover:bg-accent/50" data-testid={`row-tenant-${tenant.id}`}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center mr-3">
                                  <i className="fas fa-store text-primary"></i>
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-foreground" data-testid={`text-tenant-name-${tenant.id}`}>
                                    {tenant.name}
                                  </div>
                                  <div className="text-sm text-muted-foreground font-mono" data-testid={`text-tenant-id-${tenant.id}`}>
                                    {tenant.id}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge className={getStatusColor(tenant.status)} data-testid={`badge-tenant-status-${tenant.id}`}>
                                {tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1)}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground" data-testid={`text-tenant-users-${tenant.id}`}>
                              {tenant.userCount || 0} users
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-tenant-created-${tenant.id}`}>
                              {new Date(tenant.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="mr-2"
                                data-testid={`button-manage-tenant-${tenant.id}`}
                              >
                                Manage
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                data-testid={`button-configure-tenant-${tenant.id}`}
                              >
                                Configure
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6">
            {/* Add User to Tenant */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Add User to Tenant</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-foreground">Tenant</Label>
                    <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                      <SelectTrigger data-testid="select-tenant-for-user">
                        <SelectValue placeholder="Select tenant" />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants?.map((tenant) => (
                          <SelectItem key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-foreground">User Email</Label>
                    <Input
                      placeholder="Enter user email"
                      value={selectedUser}
                      onChange={(e) => setSelectedUser(e.target.value)}
                      data-testid="input-user-email"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-foreground">Role</Label>
                    <Select value={selectedRole} onValueChange={setSelectedRole}>
                      <SelectTrigger data-testid="select-user-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="owner">Owner</SelectItem>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-end">
                    <Button 
                      onClick={handleAddUserToTenant}
                      disabled={addUserToTenantMutation.isPending}
                      className="w-full"
                      data-testid="button-add-user-to-tenant"
                    >
                      {addUserToTenantMutation.isPending ? "Adding..." : "Add User"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* User-Tenant Relationships */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">User-Tenant Relationships</h3>
                
                <div className="text-center py-8">
                  <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-users text-2xl text-muted-foreground"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">User Management</h3>
                  <p className="text-muted-foreground">
                    User-tenant relationships would be displayed here. This requires additional API endpoints.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feature-flags" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Global Feature Flags</h3>
                
                {!featureFlags || featureFlags.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-flag text-2xl text-muted-foreground"></i>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">No Feature Flags</h3>
                    <p className="text-muted-foreground">No feature flags have been configured yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {featureFlags.map((flag) => (
                      <div 
                        key={flag.id} 
                        className="flex items-center justify-between p-4 border border-border rounded-lg"
                        data-testid={`card-feature-flag-${flag.key}`}
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground" data-testid={`text-flag-name-${flag.key}`}>
                            {flag.key.charAt(0).toUpperCase() + flag.key.slice(1)}
                          </p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-flag-description-${flag.key}`}>
                            {flag.description || `${flag.key} module functionality`}
                          </p>
                        </div>
                        <Switch 
                          checked={flag.defaultEnabled}
                          disabled
                          data-testid={`switch-flag-default-${flag.key}`}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <i className="fas fa-info-circle text-blue-600 mt-0.5"></i>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Feature Flag Management</p>
                      <p className="text-xs text-blue-600 mt-1">
                        These are global default settings. Individual tenants can override these settings 
                        through their tenant-specific feature flag configuration.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tenant-Specific Overrides */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Tenant Feature Flag Overrides</h3>
                
                <div className="text-center py-8">
                  <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-toggle-on text-2xl text-muted-foreground"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Tenant Overrides</h3>
                  <p className="text-muted-foreground">
                    Tenant-specific feature flag overrides would be managed here. 
                    Select a tenant to view and modify their feature flag settings.
                  </p>
                  <div className="mt-4">
                    <Select>
                      <SelectTrigger className="w-64 mx-auto" data-testid="select-tenant-flags">
                        <SelectValue placeholder="Select tenant to manage flags" />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants?.map((tenant) => (
                          <SelectItem key={tenant.id} value={tenant.id}>
                            {tenant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="kb-management" className="space-y-6">
            {/* KB Management Overview */}
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-book-open text-blue-600"></i>
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-blue-900">Knowledge Base Management</h3>
                    <p className="text-sm text-blue-600 font-normal">
                      Manage articles, categories, and help content for all tenants
                    </p>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white/50 rounded-lg p-4 border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-file-text text-blue-600"></i>
                        <span className="font-medium text-blue-900">Create Articles</span>
                      </div>
                      <p className="text-sm text-blue-700">
                        Create global articles or tenant-specific help content with markdown editor
                      </p>
                    </div>
                    
                    <div className="bg-white/50 rounded-lg p-4 border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-search text-blue-600"></i>
                        <span className="font-medium text-blue-900">Manage Content</span>
                      </div>
                      <p className="text-sm text-blue-700">
                        Search, filter, and bulk update articles across all categories and tenants
                      </p>
                    </div>
                    
                    <div className="bg-white/50 rounded-lg p-4 border border-blue-100">
                      <div className="flex items-center gap-2 mb-2">
                        <i className="fas fa-chart-bar text-blue-600"></i>
                        <span className="font-medium text-blue-900">Analytics</span>
                      </div>
                      <p className="text-sm text-blue-700">
                        Track article performance, user feedback, and content usage
                      </p>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-blue-200">
                    <Link href="/admin/kb-management">
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-open-kb-management">
                        <i className="fas fa-external-link-alt mr-2"></i>
                        Open KB Management Console
                      </Button>
                    </Link>
                  </div>
                  
                  <div className="text-xs text-blue-600 bg-blue-50 rounded p-3 border border-blue-100">
                    <div className="flex items-start gap-2">
                      <i className="fas fa-info-circle mt-0.5"></i>
                      <div>
                        <p className="font-medium mb-1">Access Requirements:</p>
                        <p>Knowledge Base Management requires Super Admin privileges. You can create both global articles (visible to all tenants) and tenant-specific articles.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Link href="/admin/kb-management">
                    <Button variant="outline" className="w-full h-auto p-4 flex flex-col items-center gap-2" data-testid="button-create-article">
                      <i className="fas fa-plus-circle text-xl text-green-600"></i>
                      <span className="font-medium">Create New Article</span>
                      <span className="text-xs text-muted-foreground">Write a new help article</span>
                    </Button>
                  </Link>
                  
                  <Link href="/admin/kb-management">
                    <Button variant="outline" className="w-full h-auto p-4 flex flex-col items-center gap-2" data-testid="button-manage-articles">
                      <i className="fas fa-list text-xl text-blue-600"></i>
                      <span className="font-medium">Manage Articles</span>
                      <span className="text-xs text-muted-foreground">Edit existing articles</span>
                    </Button>
                  </Link>
                  
                  <Link href="/admin/kb-management">
                    <Button variant="outline" className="w-full h-auto p-4 flex flex-col items-center gap-2" data-testid="button-bulk-operations">
                      <i className="fas fa-tasks text-xl text-purple-600"></i>
                      <span className="font-medium">Bulk Operations</span>
                      <span className="text-xs text-muted-foreground">Update multiple articles</span>
                    </Button>
                  </Link>
                  
                  <Link href="/admin/kb-management">
                    <Button variant="outline" className="w-full h-auto p-4 flex flex-col items-center gap-2" data-testid="button-analytics">
                      <i className="fas fa-chart-line text-xl text-orange-600"></i>
                      <span className="font-medium">View Analytics</span>
                      <span className="text-xs text-muted-foreground">Article usage stats</span>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* KB Categories Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Article Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="font-medium">Getting Started</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Onboarding and basic tutorials</p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="font-medium">Features</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Feature guides and how-tos</p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <span className="font-medium">Troubleshooting</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Common issues and solutions</p>
                  </div>
                  
                  <div className="p-4 border rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                      <span className="font-medium">Other Categories</span>
                    </div>
                    <p className="text-xs text-muted-foreground">API, Billing, Integrations</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">System Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">Application Status</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Database:</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-green-600">Connected</span>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Authentication:</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-green-600">Active</span>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Background Jobs:</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-green-600">Running</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium text-foreground mb-3">Statistics</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Tenants:</span>
                        <span className="text-foreground font-semibold" data-testid="text-total-tenants">
                          {tenants?.length || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Tenants:</span>
                        <span className="text-foreground font-semibold" data-testid="text-active-tenants">
                          {tenants?.filter(t => t.status === 'active').length || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Trial Tenants:</span>
                        <span className="text-foreground font-semibold" data-testid="text-trial-tenants">
                          {tenants?.filter(t => t.status === 'trial').length || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border">
                  <h4 className="text-sm font-medium text-foreground mb-3">System Actions</h4>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" size="sm" data-testid="button-system-backup">
                      <i className="fas fa-download mr-2"></i>
                      Export System Data
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-system-logs">
                      <i className="fas fa-file-alt mr-2"></i>
                      View System Logs
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-system-health">
                      <i className="fas fa-heartbeat mr-2"></i>
                      Health Check
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Environment Configuration</h3>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Environment:</span>
                      <span className="ml-2 text-foreground font-mono">production</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Version:</span>
                      <span className="ml-2 text-foreground font-mono">1.0.0</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Database:</span>
                      <span className="ml-2 text-foreground font-mono">PostgreSQL</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Authentication:</span>
                      <span className="ml-2 text-foreground font-mono">Replit Auth</span>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      For security reasons, sensitive configuration values are not displayed. 
                      Use environment variables and secure configuration management for production deployments.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}
