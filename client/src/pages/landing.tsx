import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/20 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-primary rounded-lg flex items-center justify-center">
            <i className="fas fa-pills text-2xl text-primary-foreground"></i>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-foreground">PharmaCare SaaS</h2>
          <p className="mt-2 text-sm text-muted-foreground">Multi-tenant pharmacy management platform</p>
        </div>
        
        <Card>
          <CardContent className="p-8">
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground">Welcome to PharmaCare</h3>
                <p className="text-sm text-muted-foreground">
                  Comprehensive pharmacy management system with inventory tracking, 
                  customer management, sales POS, and multi-tenant support.
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <i className="fas fa-check text-green-600 mr-3"></i>
                  Inventory Management with FIFO & WAC
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <i className="fas fa-check text-green-600 mr-3"></i>
                  Point of Sale System
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <i className="fas fa-check text-green-600 mr-3"></i>
                  Customer & Loyalty Management
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <i className="fas fa-check text-green-600 mr-3"></i>
                  Delivery & Payment Processing
                </div>
              </div>
              
              <Button 
                onClick={handleLogin}
                className="w-full"
                data-testid="button-login"
              >
                Sign In to Get Started
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
