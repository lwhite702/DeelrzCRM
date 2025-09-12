import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/branding/BrandMark";
import { BRAND } from "@/branding/branding";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Check, Mail } from "lucide-react";

export default function Landing() {
  const handleLogin = () => {
    window.location.href = "/api/login";
  };

  const handleLearnMore = () => {
    const featuresSection = document.getElementById("features-section");
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const modules = [
    "Dashboard",
    "Inventory", 
    "Customers",
    "Sales POS",
    "Delivery",
    "Loyalty",
    "Credit",
    "Payments",
    "Settings"
  ];

  const features = [
    "Multi-tenant dashboard & role-based access",
    "Inventory with FIFO/WAC and batch tracking", 
    "Sales POS with cash/card/custom payments",
    "Delivery estimates (pickup/manual courier)",
    "Loyalty tiers & credit controls",
    "Stripe payments (platform or Connect-ready)"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      {/* Hero Section */}
      <div className="relative">
        <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24 text-center">
          {/* Logo */}
          <div className="mb-12">
            <BrandMark 
              variant="logo"
              size="xl"
              showTagline={false}
              className="mx-auto"
              theme="auto"
              data-testid="logo-main"
            />
          </div>

          {/* Title & Subtitle */}
          <div className="space-y-6 mb-12">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground">
              {BRAND.name} — Beta Access
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              {BRAND.tagline}
            </p>
          </div>

          {/* Primary CTA */}
          <div className="space-y-4 mb-16">
            <Button 
              onClick={handleLogin}
              size="lg"
              className="px-8 py-3 text-lg font-semibold"
              data-testid="button-login"
            >
              Log In
            </Button>
            
            {/* Secondary Link */}
            <div>
              <Button 
                variant="link" 
                onClick={handleLearnMore}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-learn-more"
              >
                Learn what's included
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <section id="features-section" className="py-16 bg-muted/20">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center space-y-12">
            {/* Features List */}
            <div className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
                What's Included
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
                {features.map((feature, index) => (
                  <div 
                    key={index} 
                    className="flex items-start gap-3 p-4 bg-background/50 rounded-lg border border-border/50"
                    data-testid={`feature-${index}`}
                  >
                    <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-foreground text-left">{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Modules Dropdown */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-foreground">
                Available Modules
              </h3>
              <div className="flex justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="min-w-48 justify-between"
                      data-testid="dropdown-modules"
                    >
                      View All Modules
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="min-w-48" align="center">
                    {modules.map((module) => (
                      <DropdownMenuItem 
                        key={module} 
                        className="cursor-default"
                        data-testid={`module-${module.toLowerCase()}`}
                      >
                        {module}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-background border-t border-border/50">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground font-medium">
              Private beta. Access by invitation only.
            </p>
            <div className="flex items-center justify-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <a 
                href={`mailto:${import.meta.env.VITE_SUPPORT_EMAIL || 'support@deelzrxcrm.com'}`} 
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-support"
              >
                {import.meta.env.VITE_SUPPORT_EMAIL || 'support@deelzrxcrm.com'}
              </a>
            </div>
          </div>
          
          {/* Brand mark in footer */}
          <div className="pt-8 border-t border-border/30">
            <div className="flex justify-center">
              <BrandMark variant="icon" size="sm" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}