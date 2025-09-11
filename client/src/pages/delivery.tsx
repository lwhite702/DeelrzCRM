import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/tenant-context";
import { apiRequest } from "@/lib/queryClient";

interface DeliveryEstimate {
  distance: string;
  fee: string;
  estimatedMinutes: number;
}

interface Order {
  id: string;
  customerId?: string;
  status: string;
  total: string;
  createdAt: string;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface Delivery {
  id: string;
  orderId: string;
  method: string;
  addressLine1: string;
  city: string;
  state: string;
  fee: string;
  status: string;
  createdAt: Date | null;
  orderTotal: string;
  customerName: string;
  customerPhone?: string;
}

export default function Delivery() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();

  const [pickupAddress, setPickupAddress] = useState<string>("123 Pharmacy St, City, State");
  const [dropoffAddress, setDropoffAddress] = useState<string>("");
  const [pickupLat, setPickupLat] = useState<number>(40.7128);
  const [pickupLon, setPickupLon] = useState<number>(-74.0060);
  const [dropoffLat, setDropoffLat] = useState<number>(40.7589);
  const [dropoffLon, setDropoffLon] = useState<number>(-73.9851);
  const [selectedOrder, setSelectedOrder] = useState<string>("");

  const { data: orders, isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/tenants", currentTenant, "orders"],
    enabled: !!currentTenant,
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/tenants", currentTenant, "customers"],
    enabled: !!currentTenant,
  });

  const { data: deliveries, isLoading: deliveriesLoading } = useQuery<Delivery[]>({
    queryKey: ["/api/tenants", currentTenant, "deliveries"],
    enabled: !!currentTenant,
  });

  const estimateDeliveryMutation = useMutation<DeliveryEstimate, Error, {
    method: "pickup" | "manual_courier";
    pickup?: { lat?: number; lon?: number; address?: string };
    dropoff?: { lat?: number; lon?: number; address?: string };
    weightKg?: number;
    priority?: "standard" | "rush";
  }>({
    mutationFn: async (data) => {
      const response = await apiRequest("POST", "/api/delivery/estimate", data);
      return response.json() as Promise<DeliveryEstimate>;
    },
    onError: (error) => {
      toast({
        title: "Estimation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEstimate = () => {
    if (!currentTenant) return;
    
    estimateDeliveryMutation.mutate({
      method: "manual_courier",
      pickup: {
        lat: pickupLat,
        lon: pickupLon,
        address: pickupAddress,
      },
      dropoff: {
        lat: dropoffLat,
        lon: dropoffLon,
        address: dropoffAddress,
      },
      priority: "standard",
    });
  };

  const handleAddressChange = (address: string, isPickup: boolean) => {
    if (isPickup) {
      setPickupAddress(address);
    } else {
      setDropoffAddress(address);
      // In a real app, this would geocode the address
      // For demo, we'll simulate with slight coordinate changes
      const latOffset = (Math.random() - 0.5) * 0.1;
      const lonOffset = (Math.random() - 0.5) * 0.1;
      setDropoffLat(40.7128 + latOffset);
      setDropoffLon(-74.0060 + lonOffset);
    }
  };

  if (ordersLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Delivery Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage deliveries and estimate fees</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Delivery Fee Estimator */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Delivery Fee Estimator</h3>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="pickup-address" className="text-sm font-medium text-foreground">
                    Pickup Address
                  </Label>
                  <Input
                    id="pickup-address"
                    value={pickupAddress}
                    onChange={(e) => handleAddressChange(e.target.value, true)}
                    placeholder="Enter pickup address"
                    data-testid="input-pickup-address"
                  />
                </div>

                <div>
                  <Label htmlFor="dropoff-address" className="text-sm font-medium text-foreground">
                    Dropoff Address
                  </Label>
                  <Input
                    id="dropoff-address"
                    value={dropoffAddress}
                    onChange={(e) => handleAddressChange(e.target.value, false)}
                    placeholder="Enter dropoff address"
                    data-testid="input-dropoff-address"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Pickup Coordinates</Label>
                    <div className="text-sm text-foreground" data-testid="text-pickup-coordinates">
                      {pickupLat.toFixed(4)}, {pickupLon.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Dropoff Coordinates</Label>
                    <div className="text-sm text-foreground" data-testid="text-dropoff-coordinates">
                      {dropoffLat.toFixed(4)}, {dropoffLon.toFixed(4)}
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={handleEstimate}
                  disabled={estimateDeliveryMutation.isPending || !dropoffAddress}
                  className="w-full"
                  data-testid="button-estimate-delivery"
                >
                  {estimateDeliveryMutation.isPending ? "Calculating..." : "Estimate Delivery Fee"}
                </Button>

                {estimateDeliveryMutation.data && (
                  <Card className="bg-accent/20">
                    <CardContent className="p-4">
                      <h4 className="font-medium text-foreground mb-2">Delivery Estimate</h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Distance:</span>
                          <span className="text-foreground" data-testid="text-estimated-distance">
                            {estimateDeliveryMutation.data.distance} miles
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Delivery Fee:</span>
                          <span className="text-foreground font-semibold" data-testid="text-estimated-fee">
                            ${estimateDeliveryMutation.data.fee}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Estimated Time:</span>
                          <span className="text-foreground" data-testid="text-estimated-time">
                            {estimateDeliveryMutation.data.estimatedMinutes} minutes
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Active Deliveries */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Active Deliveries</h3>
              
              <div className="space-y-4">
                {deliveriesLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </div>
                ) : deliveries && deliveries.length > 0 ? (
                  deliveries.map((delivery) => (
                    <div key={delivery.id} className="border border-border rounded-lg p-4" data-testid={`delivery-card-${delivery.id}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="text-sm font-medium text-foreground" data-testid={`text-order-id-${delivery.orderId}`}>
                            Order #{delivery.orderId}
                          </h4>
                          <p className="text-xs text-muted-foreground" data-testid={`text-customer-info-${delivery.id}`}>
                            {delivery.customerName} {delivery.customerPhone && `- ${delivery.customerPhone}`}
                          </p>
                        </div>
                        <span 
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            delivery.status === 'delivered' ? 'bg-green-100 text-green-800' :
                            delivery.status === 'picked_up' ? 'bg-blue-100 text-blue-800' :
                            delivery.status === 'requested' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}
                          data-testid={`status-delivery-${delivery.id}`}
                        >
                          {delivery.status === 'delivered' ? 'Delivered' :
                           delivery.status === 'picked_up' ? 'Picked Up' :
                           delivery.status === 'requested' ? 'Requested' :
                           delivery.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mb-2" data-testid={`text-address-${delivery.id}`}>
                        <i className="fas fa-map-marker-alt mr-1"></i>
                        {delivery.addressLine1}, {delivery.city}, {delivery.state}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground" data-testid={`text-method-${delivery.id}`}>
                          {delivery.method === 'manual_courier' ? 'Courier Delivery' : 'Pickup'}
                        </span>
                        <span className="text-foreground font-semibold" data-testid={`text-fee-${delivery.id}`}>
                          ${delivery.fee} fee
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-deliveries">
                    <i className="fas fa-truck text-2xl mb-2"></i>
                    <p>No active deliveries</p>
                  </div>
                )}

                <div className="text-center py-4">
                  <Button variant="outline" size="sm" data-testid="button-view-all-deliveries">
                    <i className="fas fa-truck mr-2"></i>
                    View All Deliveries ({deliveries ? deliveries.length : 0})
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Delivery Methods Configuration */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h3 className="text-lg font-medium text-foreground mb-4">Delivery Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Pickup</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p><i className="fas fa-check text-green-600 mr-2"></i>Always available</p>
                  <p><i className="fas fa-check text-green-600 mr-2"></i>No additional fee</p>
                  <p><i className="fas fa-check text-green-600 mr-2"></i>Ready in 15-30 minutes</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Manual Courier</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p><i className="fas fa-check text-green-600 mr-2"></i>Same day delivery</p>
                  <p><i className="fas fa-check text-green-600 mr-2"></i>Distance-based pricing</p>
                  <p><i className="fas fa-check text-green-600 mr-2"></i>Real-time tracking</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-foreground mb-2">Pricing Structure</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Base fee: $5.00</p>
                  <p>Per mile: $1.50</p>
                  <p>Minimum fee: $5.00</p>
                  <p>Rush delivery: +50%</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-foreground">Delivery Zone Settings</h4>
                  <p className="text-xs text-muted-foreground">Configure delivery zones and restrictions</p>
                </div>
                <Button variant="outline" size="sm" data-testid="button-configure-zones">
                  <i className="fas fa-map mr-2"></i>
                  Configure Zones
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
