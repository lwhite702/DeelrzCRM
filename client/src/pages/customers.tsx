import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipHelp } from "@/components/ui/tooltip-help";
import { useTenant } from "@/contexts/tenant-context";

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  preferredFulfillment?: string;
  preferredPayment?: string;
  notes?: string;
  createdAt: string;
  loyaltyTier?: string;
  loyaltyPoints?: number;
  creditLimit?: string;
  creditBalance?: string;
  creditStatus?: string;
}

export default function Customers() {
  const { currentTenant } = useTenant();
  
  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/tenants", currentTenant, "customers", "with_details"],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${currentTenant}/customers?with_details=true`);
      if (!response.ok) throw new Error('Failed to fetch customers');
      return response.json();
    },
    enabled: !!currentTenant,
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-96 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <TooltipHelp content="Customer management allows you to store customer information, track loyalty programs, manage credit accounts, and maintain customer preferences for delivery and payment methods." articleSlug="customer-management">
              <h1 className="text-2xl font-bold text-foreground">Customer Management</h1>
            </TooltipHelp>
            <p className="mt-1 text-sm text-muted-foreground">Manage customer profiles and preferences</p>
          </div>
          <TooltipHelp content="Add a new customer to your database. Include contact information, delivery preferences, and payment methods to personalize their experience." side="bottom">
            <Button className="mt-4 sm:mt-0" data-testid="button-add-customer">
              <i className="fas fa-user-plus mr-2"></i>
              Add Customer
            </Button>
          </TooltipHelp>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row space-y-4 lg:space-y-0 lg:space-x-4">
              <div className="flex-1">
                <TooltipHelp content="Search customers by name, phone, or email. Use partial matches to quickly find customer records and their associated information." side="right">
                  <Input 
                    placeholder="Search customers by name, phone, or email..."
                    data-testid="input-customer-search"
                  />
                </TooltipHelp>
              </div>
              <div className="w-full lg:w-48">
                <Select>
                  <TooltipHelp content="Filter customers by type: Loyalty Members (enrolled in rewards program), Credit Customers (have credit accounts), or Delivery Customers (prefer delivery service)." side="bottom">
                    <SelectTrigger data-testid="select-customer-filter">
                      <SelectValue placeholder="All Customers" />
                    </SelectTrigger>
                  </TooltipHelp>
                  <SelectContent>
                    <SelectItem value="all">All Customers</SelectItem>
                    <SelectItem value="loyalty">Loyalty Members</SelectItem>
                    <SelectItem value="credit">Credit Customers</SelectItem>
                    <SelectItem value="delivery">Delivery Customers</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer List */}
        <Card>
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-border">
              <TooltipHelp content="Customer profiles show contact information, loyalty status, credit limits, and preferences. Click any customer to view detailed information and transaction history." side="right">
                <h3 className="text-lg font-medium text-foreground">Customer Profiles</h3>
              </TooltipHelp>
            </div>
            
            {!customers || customers.length === 0 ? (
              <div className="p-8 text-center">
                <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-users text-2xl text-muted-foreground"></i>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Customers Found</h3>
                <p className="text-muted-foreground mb-4">
                  Start building your customer base by adding your first customer.
                </p>
                <Button data-testid="button-add-first-customer">
                  <i className="fas fa-user-plus mr-2"></i>
                  Add Your First Customer
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border" data-testid="customers-table">
                {customers.map((customer) => (
                  <div 
                    key={customer.id} 
                    className="p-6 hover:bg-accent/50 cursor-pointer transition-colors"
                    data-testid={`card-customer-${customer.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-primary font-medium" data-testid={`text-customer-initials-${customer.id}`}>
                            {getInitials(customer.name)}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-lg font-medium text-foreground" data-testid={`text-customer-name-${customer.id}`}>
                            {customer.name}
                          </h4>
                          <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
                            {customer.phone && (
                              <span data-testid={`text-customer-phone-${customer.id}`}>
                                <i className="fas fa-phone mr-1"></i>
                                {customer.phone}
                              </span>
                            )}
                            {customer.email && (
                              <span data-testid={`text-customer-email-${customer.id}`}>
                                <i className="fas fa-envelope mr-1"></i>
                                {customer.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="flex space-x-2 mb-1">
                            {customer.loyaltyTier && (
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                customer.loyaltyTier === 'gold' 
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : customer.loyaltyTier === 'silver'
                                  ? 'bg-gray-100 text-gray-800'
                                  : customer.loyaltyTier === 'platinum'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-orange-100 text-orange-800'
                              }`} data-testid={`badge-loyalty-${customer.id}`}>
                                {customer.loyaltyTier.charAt(0).toUpperCase() + customer.loyaltyTier.slice(1)} Member
                                {customer.loyaltyPoints && ` (${customer.loyaltyPoints} pts)`}
                              </span>
                            )}
                            {customer.creditStatus ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                customer.creditStatus === 'active' 
                                  ? 'bg-green-100 text-green-800'
                                  : customer.creditStatus === 'suspended'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`} data-testid={`badge-credit-${customer.id}`}>
                                Credit: ${customer.creditBalance || '0'} / ${customer.creditLimit || '0'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800" data-testid={`badge-no-credit-${customer.id}`}>
                                No Credit
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Prefers: {customer.preferredFulfillment || "Pickup"} | {customer.preferredPayment || "Cash"}
                          </p>
                        </div>
                        <i className="fas fa-chevron-right text-muted-foreground"></i>
                      </div>
                    </div>
                    {customer.notes && (
                      <div className="mt-3 text-sm text-muted-foreground" data-testid={`text-customer-notes-${customer.id}`}>
                        {customer.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
