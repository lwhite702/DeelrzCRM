import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StripeProvider } from "@/components/stripe-provider";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/use-tenant";

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
        <Route component={Home} />
      </Switch>
    );
  }

  // Show main application with all routes for authenticated users with selected tenant
  return (
    <Switch>
      <Route path="/">
        <MainLayout>
          <Dashboard />
        </MainLayout>
      </Route>
      <Route path="/dashboard">
        <MainLayout>
          <Dashboard />
        </MainLayout>
      </Route>
      <Route path="/inventory">
        <MainLayout>
          <Inventory />
        </MainLayout>
      </Route>
      <Route path="/customers">
        <MainLayout>
          <Customers />
        </MainLayout>
      </Route>
      <Route path="/sales">
        <MainLayout>
          <SalesPOS />
        </MainLayout>
      </Route>
      <Route path="/delivery">
        <MainLayout>
          <Delivery />
        </MainLayout>
      </Route>
      <Route path="/loyalty">
        <MainLayout>
          <Loyalty />
        </MainLayout>
      </Route>
      <Route path="/credit">
        <MainLayout>
          <Credit />
        </MainLayout>
      </Route>
      <Route path="/payments">
        <MainLayout>
          <Payments />
        </MainLayout>
      </Route>
      <Route path="/settings">
        <MainLayout>
          <Settings />
        </MainLayout>
      </Route>
      <Route path="/super-admin">
        <MainLayout>
          <SuperAdmin />
        </MainLayout>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <StripeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </StripeProvider>
    </QueryClientProvider>
  );
}

export default App;
