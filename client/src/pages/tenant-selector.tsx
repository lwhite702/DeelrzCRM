import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface TenantWithRole {
  userId: string;
  tenantId: string;
  role: string;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    status: string;
    createdAt: string;
  };
}

interface TenantSelectorProps {
  onTenantSelect: (tenantId: string) => void;
}

export default function TenantSelector({ onTenantSelect }: TenantSelectorProps) {
  const { data: tenants, isLoading } = useQuery<TenantWithRole[]>({
    queryKey: ["/api/tenants"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground">Select Your Pharmacy</h1>
            <p className="mt-2 text-muted-foreground">Choose which pharmacy you'd like to manage</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-4">
                    <Skeleton className="h-12 w-12 rounded-lg" />
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!tenants || tenants.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-store text-2xl text-muted-foreground"></i>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">No Pharmacies Found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              You don't have access to any pharmacy tenants yet. Contact your administrator to get access.
            </p>
            <Button 
              variant="outline" 
              onClick={() => window.location.href = "/api/logout"}
              data-testid="button-logout"
            >
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Select Your Pharmacy</h1>
          <p className="mt-2 text-muted-foreground">Choose which pharmacy you'd like to manage</p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map(({ tenant, role }) => (
            <Card 
              key={tenant.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onTenantSelect(tenant.id)}
              data-testid={`card-tenant-${tenant.id}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <i className="fas fa-store text-primary text-lg"></i>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground" data-testid={`text-tenant-name-${tenant.id}`}>
                      {tenant.name}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-tenant-role-${tenant.id}`}>
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    tenant.status === 'active' ? 'bg-green-100 text-green-800' :
                    tenant.status === 'trial' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {tenant.status.charAt(0).toUpperCase() + tenant.status.slice(1)}
                  </span>
                  <i className="fas fa-arrow-right text-muted-foreground"></i>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
