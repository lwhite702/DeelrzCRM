import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/hooks/use-tenant";
import { useLocation } from "@/lib/router";

interface DashboardKPIs {
  todayRevenue: string;
  ordersToday: number;
  lowStockItems: number;
  overdueCredits: string;
}

export default function Dashboard() {
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  
  const { data: kpis, isLoading } = useQuery<DashboardKPIs>({
    queryKey: ["/api/tenants", currentTenant, "dashboard", "kpis"],
    enabled: !!currentTenant,
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview of your pharmacy operations</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-dollar-sign text-green-600 text-xl"></i>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Today's Revenue</p>
                <p className="text-2xl font-semibold text-foreground" data-testid="text-revenue-today">
                  ${kpis?.todayRevenue || "0"}
                </p>
                <p className="text-xs text-green-600">+12.5% from yesterday</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-shopping-cart text-blue-600 text-xl"></i>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Orders Today</p>
                <p className="text-2xl font-semibold text-foreground" data-testid="text-orders-today">
                  {kpis?.ordersToday || 0}
                </p>
                <p className="text-xs text-blue-600">+8.2% from yesterday</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-exclamation-triangle text-yellow-600 text-xl"></i>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Low Stock Items</p>
                <p className="text-2xl font-semibold text-foreground" data-testid="text-low-stock">
                  {kpis?.lowStockItems || 0}
                </p>
                <p className="text-xs text-yellow-600">Needs attention</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <i className="fas fa-clock text-red-600 text-xl"></i>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-muted-foreground">Overdue Credits</p>
                <p className="text-2xl font-semibold text-foreground" data-testid="text-overdue-credits">
                  ${kpis?.overdueCredits || "0"}
                </p>
                <p className="text-xs text-red-600">7 customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts and Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-medium text-foreground mb-4">Recent Alerts</h3>
            <div className="space-y-4">
              <div className="flex items-start space-x-3 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                <i className="fas fa-exclamation-triangle text-yellow-600 mt-0.5"></i>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Metformin 500mg - Restock Required</p>
                  <p className="text-xs text-muted-foreground">Current stock: 45 units. Projected stockout in 3 days.</p>
                  <p className="text-xs text-muted-foreground mt-1">2 hours ago</p>
                </div>
                <Button size="sm" variant="outline" className="text-xs">
                  Acknowledge
                </Button>
              </div>
              
              <div className="flex items-start space-x-3 p-3 bg-red-50 rounded-lg border-l-4 border-red-400">
                <i className="fas fa-exclamation-circle text-red-600 mt-0.5"></i>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Credit Payment Overdue</p>
                  <p className="text-xs text-muted-foreground">John Smith - $150 payment is 3 days overdue</p>
                  <p className="text-xs text-muted-foreground mt-1">5 hours ago</p>
                </div>
                <Button size="sm" variant="outline" className="text-xs">
                  Acknowledge
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-medium text-foreground mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant="outline" 
                className="h-20 flex flex-col items-center justify-center space-y-2"
                data-testid="button-new-sale"
                onClick={() => setLocation("/sales")}
              >
                <i className="fas fa-plus text-primary text-xl"></i>
                <span className="text-sm font-medium">New Sale</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-20 flex flex-col items-center justify-center space-y-2"
                data-testid="button-add-inventory"
                onClick={() => setLocation("/inventory")}
              >
                <i className="fas fa-box text-primary text-xl"></i>
                <span className="text-sm font-medium">Add Inventory</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-20 flex flex-col items-center justify-center space-y-2"
                data-testid="button-add-customer"
                onClick={() => setLocation("/customers")}
              >
                <i className="fas fa-user-plus text-primary text-xl"></i>
                <span className="text-sm font-medium">Add Customer</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-20 flex flex-col items-center justify-center space-y-2"
                data-testid="button-view-reports"
                onClick={() => setLocation("/reports")}
              >
                <i className="fas fa-chart-bar text-primary text-xl"></i>
                <span className="text-sm font-medium">View Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-medium text-foreground mb-4">Recent Activity</h3>
          <div className="space-y-4">
            <div className="flex items-center space-x-4 py-3 border-b border-border last:border-b-0">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <i className="fas fa-check text-green-600"></i>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Sale completed - Order #1247 ($85.50)</p>
                <p className="text-xs text-muted-foreground">5 minutes ago</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Sale
              </span>
            </div>
            
            <div className="flex items-center space-x-4 py-3 border-b border-border last:border-b-0">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <i className="fas fa-box text-blue-600"></i>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Inventory updated - Amoxicillin 250mg</p>
                <p className="text-xs text-muted-foreground">15 minutes ago</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                Inventory
              </span>
            </div>
            
            <div className="flex items-center space-x-4 py-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <i className="fas fa-user text-purple-600"></i>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">New customer registered - Jane Wilson</p>
                <p className="text-xs text-muted-foreground">1 hour ago</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                Customer
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
