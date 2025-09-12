import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/branding/BrandMark";
import { BRAND } from "@/branding/branding";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/20 px-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto">
            <BrandMark 
              variant="logo" 
              size="lg" 
              showTagline={true}
              className="mx-auto"
              theme="auto"
            />
          </div>
        </div>
        
        <Card>
          <CardContent className="p-8">
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground">Welcome to {BRAND.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {BRAND.tagline}. Comprehensive business management system with inventory tracking, 
                  customer management, sales POS, and multi-tenant support.
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <i className="fas fa-check text-primary mr-3"></i>
                  Cloud-Powered Business Management
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <i className="fas fa-check text-primary mr-3"></i>
                  Inventory & Customer Management
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <i className="fas fa-check text-primary mr-3"></i>
                  Sales POS & Loyalty Programs
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <i className="fas fa-check text-primary mr-3"></i>
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
