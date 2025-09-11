import { Switch, Route, Redirect, useLocation } from "@/lib/router";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StripeProvider } from "@/components/stripe-provider";
import { useAuth } from "@/hooks/useAuth";
import { useTenant, TenantProvider } from "@/contexts/tenant-context";

// Pages
import Landing from "@/pages/landing";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Customers from "@/pages/customers";
import SalesPOS from "@/pages/sales-pos";
import Delivery from "@/pages/delivery";
import Loyalty from "@/pages/loyalty";
import Credit from "@/pages/credit";
import Payments from "@/pages/payments";
import Settings from "@/pages/settings";
import SuperAdmin from "@/pages/super-admin";
import NotFound from "@/pages/not-found";
import MainLayout from "@/components/layout/main-layout";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  const { currentTenant } = useTenant();

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route component={Landing} />
      </Switch>
    );
  }

  // Show home/tenant selector if no tenant is selected
  if (!currentTenant) {
    return (
      <Switch>
        <Route path="/" component={Home} />
        <Route component={() => <Redirect to="/" />} />
      </Switch>
    );
  }

  // Show main application with all routes for authenticated users with selected tenant
  return (
    <MainLayout>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/customers" component={Customers} />
        <Route path="/sales" component={SalesPOS} />
        <Route path="/delivery" component={Delivery} />
        <Route path="/loyalty" component={Loyalty} />
        <Route path="/credit" component={Credit} />
        <Route path="/payments" component={Payments} />
        <Route path="/settings" component={Settings} />
        <Route path="/super-admin" component={SuperAdmin} />
        <Route path="/" component={() => <Redirect to="/dashboard" />} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TenantProvider>
        <StripeProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </StripeProvider>
      </TenantProvider>
    </QueryClientProvider>
  );
}

export default App;
