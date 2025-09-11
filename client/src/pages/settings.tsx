import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/tenant-context";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import { apiRequest } from "@/lib/queryClient";
import { TooltipHelp } from "@/components/ui/tooltip-help";

interface TenantSettings {
  tenantId: string;
  targetMargin: string;
  minStockThreshold: number;
  exposureCap: string;
  deliveryMethodsEnabled: string;
  leadTimeDays: number;
  safetyDays: number;
  cityProfile: any;
  paymentMode: string;
  applicationFeeBps: number;
  defaultCurrency: string;
  stripeAccountId?: string;
}

export default function Settings() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("general");
  const [localSettings, setLocalSettings] = useState<Partial<TenantSettings>>({});

  const { data: featureFlags, isLoading: flagsLoading } = useFeatureFlags(currentTenant);

  const { data: tenantSettings, isLoading } = useQuery<TenantSettings>({
    queryKey: ["/api/tenants", currentTenant, "settings"],
    enabled: !!currentTenant,
  });

  // Update local settings when real data is fetched
  useEffect(() => {
    if (tenantSettings) {
      setLocalSettings(tenantSettings);
    }
  }, [tenantSettings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (updatedSettings: Partial<TenantSettings>) => {
      const res = await apiRequest("PUT", `/api/tenants/${currentTenant}/settings`, updatedSettings);
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Settings Updated",
        description: "Your pharmacy settings have been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant, "settings"] });
      // Update local state with the returned data
      setLocalSettings(data);
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateFeatureFlagMutation = useMutation({
    mutationFn: async (data: { flagKey: string; enabled: boolean }) => {
      const res = await apiRequest("POST", `/api/tenants/${currentTenant}/feature-flags`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Feature Flag Updated",
        description: "Feature flag setting has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant, "feature-flags"] });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSettingChange = (key: keyof TenantSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateSettingsMutation.mutate(localSettings);
  };

  const handleFeatureFlagToggle = (flagKey: string, enabled: boolean) => {
    updateFeatureFlagMutation.mutate({ flagKey, enabled });
  };

  if (isLoading || flagsLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <TooltipHelp content="Settings allow you to configure your pharmacy's operational parameters, inventory thresholds, payment processing, and feature flags. Changes affect how your system operates." articleSlug="getting-started-guide">
              <h1 className="text-2xl font-bold text-foreground">Tenant Settings</h1>
            </TooltipHelp>
            <p className="mt-1 text-sm text-muted-foreground">Configure your pharmacy operations and preferences</p>
          </div>
          <TooltipHelp content="Save all your configuration changes. Settings are applied immediately and affect your pharmacy's operations." side="bottom">
            <Button 
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
              data-testid="button-save-settings"
            >
              {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </TooltipHelp>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general" data-testid="tab-general">General</TabsTrigger>
            <TabsTrigger value="inventory" data-testid="tab-inventory">Inventory</TabsTrigger>
            <TabsTrigger value="delivery" data-testid="tab-delivery">Delivery</TabsTrigger>
            <TabsTrigger value="payments" data-testid="tab-payments">Payments</TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features">Features</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <TooltipHelp content="General settings control your pharmacy's core operational parameters including profit margins, credit limits, and default currency." side="top">
                  <h3 className="text-lg font-medium text-foreground mb-4">General Settings</h3>
                </TooltipHelp>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <TooltipHelp content="Target margin is your desired profit percentage. This is used in pricing calculations and helps maintain profitability across your inventory." side="right">
                      <Label htmlFor="target-margin" className="text-sm font-medium text-foreground">
                        Target Margin (%)
                      </Label>
                    </TooltipHelp>
                    <Input
                      id="target-margin"
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={parseFloat(localSettings.targetMargin || "0") * 100}
                      onChange={(e) => handleSettingChange("targetMargin", (parseFloat(e.target.value) / 100).toString())}
                      data-testid="input-target-margin"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Default profit margin for pricing calculations
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="exposure-cap" className="text-sm font-medium text-foreground">
                      Credit Exposure Cap ($)
                    </Label>
                    <Input
                      id="exposure-cap"
                      type="number"
                      step="0.01"
                      min="0"
                      value={localSettings.exposureCap || ""}
                      onChange={(e) => handleSettingChange("exposureCap", e.target.value)}
                      data-testid="input-exposure-cap"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Maximum total credit exposure allowed
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="default-currency" className="text-sm font-medium text-foreground">
                      Default Currency
                    </Label>
                    <Select 
                      value={localSettings.defaultCurrency || ""} 
                      onValueChange={(value) => handleSettingChange("defaultCurrency", value)}
                    >
                      <SelectTrigger data-testid="select-default-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="usd">USD - US Dollar</SelectItem>
                        <SelectItem value="cad">CAD - Canadian Dollar</SelectItem>
                        <SelectItem value="eur">EUR - Euro</SelectItem>
                        <SelectItem value="gbp">GBP - British Pound</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <TooltipHelp content="Inventory management settings control stock monitoring thresholds, lead times, and automated reordering policies." articleSlug="inventory-management-guide">
                  <h3 className="text-lg font-medium text-foreground mb-4">Inventory Management</h3>
                </TooltipHelp>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <TooltipHelp content="Set the minimum stock level that triggers low stock alerts. When inventory falls below this threshold, you'll receive notifications to reorder." side="top">
                      <Label htmlFor="min-stock-threshold" className="text-sm font-medium text-foreground">
                        Minimum Stock Threshold
                      </Label>
                    </TooltipHelp>
                    <Input
                      id="min-stock-threshold"
                      type="number"
                      min="0"
                      value={localSettings.minStockThreshold || ""}
                      onChange={(e) => handleSettingChange("minStockThreshold", parseInt(e.target.value))}
                      data-testid="input-min-stock-threshold"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Minimum units before low stock alert
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="lead-time-days" className="text-sm font-medium text-foreground">
                      Lead Time (Days)
                    </Label>
                    <Input
                      id="lead-time-days"
                      type="number"
                      min="0"
                      value={localSettings.leadTimeDays || ""}
                      onChange={(e) => handleSettingChange("leadTimeDays", parseInt(e.target.value))}
                      data-testid="input-lead-time-days"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Average supplier delivery time
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="safety-days" className="text-sm font-medium text-foreground">
                      Safety Stock (Days)
                    </Label>
                    <Input
                      id="safety-days"
                      type="number"
                      min="0"
                      value={localSettings.safetyDays || ""}
                      onChange={(e) => handleSettingChange("safetyDays", parseInt(e.target.value))}
                      data-testid="input-safety-days"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Additional buffer days for stock planning
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <Label className="text-sm font-medium text-foreground">Inventory Policies</Label>
                  <div className="mt-2 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">FIFO (First In, First Out)</p>
                        <p className="text-xs text-muted-foreground">Automatically use oldest stock first</p>
                      </div>
                      <Switch checked={true} disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">WAC Tracking</p>
                        <p className="text-xs text-muted-foreground">Track weighted average cost</p>
                      </div>
                      <Switch checked={true} disabled />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-foreground">Automatic Restock Alerts</p>
                        <p className="text-xs text-muted-foreground">Send alerts for low stock items</p>
                      </div>
                      <Switch checked={true} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="delivery" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <TooltipHelp content="Configure which delivery methods are available to your customers. Enable pickup, manual courier, or other delivery options based on your pharmacy's capabilities." side="top">
                  <h3 className="text-lg font-medium text-foreground mb-4">Delivery Configuration</h3>
                </TooltipHelp>
                
                <div className="space-y-6">
                  <div>
                    <TooltipHelp content="Choose which delivery methods customers can select during checkout. Options include pharmacy pickup and manual courier delivery." side="right">
                      <Label className="text-sm font-medium text-foreground">Enabled Delivery Methods</Label>
                    </TooltipHelp>
                    <div className="mt-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground">Pickup</p>
                          <p className="text-xs text-muted-foreground">Customer picks up from pharmacy</p>
                        </div>
                        <Switch 
                          checked={localSettings.deliveryMethodsEnabled?.includes("pickup") || false}
                          onCheckedChange={(checked) => {
                            const methods = localSettings.deliveryMethodsEnabled?.split(",") || [];
                            if (checked && !methods.includes("pickup")) {
                              methods.push("pickup");
                            } else if (!checked) {
                              methods.splice(methods.indexOf("pickup"), 1);
                            }
                            handleSettingChange("deliveryMethodsEnabled", methods.join(","));
                          }}
                          data-testid="switch-pickup-enabled"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground">Manual Courier</p>
                          <p className="text-xs text-muted-foreground">Staff or third-party delivery</p>
                        </div>
                        <Switch 
                          checked={localSettings.deliveryMethodsEnabled?.includes("manual_courier") || false}
                          onCheckedChange={(checked) => {
                            const methods = localSettings.deliveryMethodsEnabled?.split(",") || [];
                            if (checked && !methods.includes("manual_courier")) {
                              methods.push("manual_courier");
                            } else if (!checked) {
                              methods.splice(methods.indexOf("manual_courier"), 1);
                            }
                            handleSettingChange("deliveryMethodsEnabled", methods.join(","));
                          }}
                          data-testid="switch-courier-enabled"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-foreground">Delivery Zone Profile</Label>
                    <Textarea
                      placeholder="Enter delivery zone configuration (JSON format)"
                      value={localSettings.cityProfile ? JSON.stringify(localSettings.cityProfile, null, 2) : ""}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          handleSettingChange("cityProfile", parsed);
                        } catch {
                          // Invalid JSON, ignore
                        }
                      }}
                      rows={6}
                      className="font-mono text-xs"
                      data-testid="textarea-city-profile"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure delivery zones, base fees, per-mile rates, and restrictions
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <TooltipHelp content="Configure how your pharmacy processes payments. Choose between platform mode (shared processing) or connect your own Stripe account for direct payment processing." articleSlug="billing-payment-info">
                  <h3 className="text-lg font-medium text-foreground mb-4">Payment Processing</h3>
                </TooltipHelp>
                
                <div className="space-y-6">
                  <div>
                    <TooltipHelp content="Payment mode determines how transactions are processed. Platform mode uses shared processing, while Connect modes allow you to use your own Stripe account." side="right">
                      <Label className="text-sm font-medium text-foreground">Payment Mode</Label>
                    </TooltipHelp>
                    <Select 
                      value={localSettings.paymentMode || ""} 
                      onValueChange={(value) => handleSettingChange("paymentMode", value)}
                    >
                      <SelectTrigger className="mt-2" data-testid="select-payment-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="platform">Platform Mode</SelectItem>
                        <SelectItem value="connect_standard">Connect Standard</SelectItem>
                        <SelectItem value="connect_express">Connect Express</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      {localSettings.paymentMode === "platform" 
                        ? "Process payments through platform account with shared fees"
                        : "Connect your own Stripe account for direct processing"
                      }
                    </p>
                  </div>

                  {localSettings.paymentMode !== "platform" && (
                    <>
                      <div>
                        <Label className="text-sm font-medium text-foreground">Stripe Account</Label>
                        <div className="mt-2 p-3 bg-muted/50 border border-border rounded-lg">
                          {localSettings.stripeAccountId ? (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Connected</p>
                                <p className="text-xs text-muted-foreground font-mono">
                                  {localSettings.stripeAccountId}
                                </p>
                              </div>
                              <Button variant="outline" size="sm">
                                Disconnect
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Not Connected</p>
                                <p className="text-xs text-muted-foreground">
                                  Connect your Stripe account to accept payments
                                </p>
                              </div>
                              <Button size="sm" data-testid="button-connect-stripe">
                                Connect Stripe
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="application-fee" className="text-sm font-medium text-foreground">
                          Application Fee (%)
                        </Label>
                        <Input
                          id="application-fee"
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          value={(localSettings.applicationFeeBps || 0) / 100}
                          onChange={(e) => handleSettingChange("applicationFeeBps", parseFloat(e.target.value) * 100)}
                          data-testid="input-application-fee"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Platform fee percentage (only for Connect modes)
                        </p>
                      </div>
                    </>
                  )}

                  <div>
                    <Label className="text-sm font-medium text-foreground">Supported Payment Methods</Label>
                    <div className="mt-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground">Credit Cards (Stripe)</p>
                          <p className="text-xs text-muted-foreground">Online card payments via Stripe</p>
                        </div>
                        <Switch checked={true} disabled />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground">Cash Payments</p>
                          <p className="text-xs text-muted-foreground">In-person cash transactions</p>
                        </div>
                        <Switch checked={true} disabled />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-foreground">Custom Payments</p>
                          <p className="text-xs text-muted-foreground">Insurance, vouchers, etc.</p>
                        </div>
                        <Switch checked={true} disabled />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="features" className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <TooltipHelp content="Feature modules allow you to enable or disable specific functionality within your pharmacy system. Toggle features based on your business needs and operational requirements." side="top">
                  <h3 className="text-lg font-medium text-foreground mb-4">Feature Modules</h3>
                </TooltipHelp>
                
                <div className="space-y-4">
                  {featureFlags && Object.entries(featureFlags).map(([flagKey, enabled]) => {
                    const flagDisplayNames: Record<string, { name: string; description: string }> = {
                      dashboard: { name: "Dashboard", description: "KPIs, analytics, and business metrics" },
                      inventory: { name: "Inventory Management", description: "Stock tracking, FIFO, WAC calculations" },
                      customers: { name: "Customer Management", description: "Customer profiles and preferences" },
                      sales: { name: "Sales POS", description: "Point of sale system with calculators" },
                      delivery: { name: "Delivery Management", description: "Pickup and courier delivery options" },
                      loyalty: { name: "Loyalty Program", description: "Points, tiers, and rewards system" },
                      credit: { name: "Credit Management", description: "Customer credit limits and tracking" },
                      payments: { name: "Payment Processing", description: "Stripe integration and payment methods" },
                    };

                    const flagInfo = flagDisplayNames[flagKey] || { 
                      name: flagKey.charAt(0).toUpperCase() + flagKey.slice(1), 
                      description: `${flagKey} module functionality` 
                    };

                    return (
                      <div key={flagKey} className="flex items-center justify-between py-3 border-b border-border last:border-b-0">
                        <div>
                          <p className="text-sm font-medium text-foreground" data-testid={`text-feature-${flagKey}`}>
                            {flagInfo.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {flagInfo.description}
                          </p>
                        </div>
                        <Switch 
                          checked={enabled}
                          disabled={flagKey === "dashboard" || updateFeatureFlagMutation.isPending} // Dashboard should always be enabled
                          onCheckedChange={(checked) => handleFeatureFlagToggle(flagKey, checked)}
                          data-testid={`switch-feature-${flagKey}`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <i className="fas fa-info-circle text-blue-600 mt-0.5"></i>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Feature Flag Information</p>
                      <p className="text-xs text-blue-600 mt-1">
                        Features can be enabled or disabled per tenant. Disabled features will be hidden from the interface 
                        and their API endpoints will return access denied errors. Contact your system administrator to modify these settings.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}
