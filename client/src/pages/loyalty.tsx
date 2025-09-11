import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/contexts/tenant-context";

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface LoyaltyAccount {
  id: string;
  customerId: string;
  customerName: string;
  points: number;
  tier: string;
  updatedAt: string;
}

interface LoyaltyTier {
  name: string;
  minPoints: number;
  benefits: string[];
  color: string;
}

const loyaltyTiers: LoyaltyTier[] = [
  {
    name: "Bronze",
    minPoints: 0,
    benefits: ["1 point per $1 spent", "Birthday discount"],
    color: "bg-orange-100 text-orange-800",
  },
  {
    name: "Silver",
    minPoints: 500,
    benefits: ["1.5 points per $1 spent", "Free delivery", "Priority support"],
    color: "bg-gray-100 text-gray-800",
  },
  {
    name: "Gold",
    minPoints: 1500,
    benefits: ["2 points per $1 spent", "Exclusive offers", "Expedited prescriptions"],
    color: "bg-yellow-100 text-yellow-800",
  },
  {
    name: "Platinum",
    minPoints: 5000,
    benefits: ["3 points per $1 spent", "Personal consultation", "VIP events"],
    color: "bg-purple-100 text-purple-800",
  },
];

// Remove mock data - now using real database queries

export default function Loyalty() {
  const { currentTenant } = useTenant();

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/tenants", currentTenant, "customers"],
    enabled: !!currentTenant,
  });

  const { data: loyaltyAccounts, isLoading: loyaltyLoading } = useQuery<LoyaltyAccount[]>({
    queryKey: ["/api/tenants", currentTenant, "loyalty"],
    enabled: !!currentTenant,
  });

  const getTierForPoints = (points: number): LoyaltyTier => {
    return loyaltyTiers
      .slice()
      .reverse()
      .find(tier => points >= tier.minPoints) || loyaltyTiers[0];
  };

  const getNextTier = (points: number): LoyaltyTier | null => {
    return loyaltyTiers.find(tier => points < tier.minPoints) || null;
  };

  const getProgressToNextTier = (points: number): number => {
    const nextTier = getNextTier(points);
    if (!nextTier) return 100;
    
    const currentTier = getTierForPoints(points);
    const progress = ((points - currentTier.minPoints) / (nextTier.minPoints - currentTier.minPoints)) * 100;
    return Math.min(progress, 100);
  };

  if (isLoading || loyaltyLoading) {
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Loyalty Program</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage customer loyalty points and rewards</p>
          </div>
          <Button className="mt-4 sm:mt-0" data-testid="button-add-loyalty-member">
            <i className="fas fa-star mr-2"></i>
            Enroll Customer
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Loyalty Tiers Overview */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Loyalty Tiers</h3>
              <div className="space-y-4">
                {loyaltyTiers.map((tier) => (
                  <div key={tier.name} className="border border-border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-foreground">{tier.name}</h4>
                      <Badge className={tier.color} data-testid={`badge-tier-${tier.name.toLowerCase()}`}>
                        {tier.minPoints}+ points
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {tier.benefits.map((benefit, index) => (
                        <p key={index} className="text-xs text-muted-foreground">
                          <i className="fas fa-check text-green-600 mr-2"></i>
                          {benefit}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Program Statistics */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Program Statistics</h3>
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Total Members</span>
                    <span className="text-lg font-semibold text-foreground" data-testid="text-total-members">
                      {loyaltyAccounts?.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Active This Month</span>
                    <span className="text-lg font-semibold text-foreground" data-testid="text-active-members">
                      {loyaltyAccounts?.length || 0}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">Tier Distribution</h4>
                  <div className="space-y-2">
                    {loyaltyTiers.map((tier) => {
                      const count = loyaltyAccounts?.filter(
                        (account: LoyaltyAccount) => getTierForPoints(account.points).name === tier.name
                      ).length || 0;
                      const percentage = loyaltyAccounts?.length ? (count / loyaltyAccounts.length) * 100 : 0;
                      
                      return (
                        <div key={tier.name} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{tier.name}</span>
                          <div className="flex items-center space-x-2">
                            <Progress value={percentage} className="w-16 h-2" />
                            <span className="text-foreground w-8 text-right" data-testid={`text-tier-count-${tier.name.toLowerCase()}`}>
                              {count}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Points Earned This Month</span>
                    <span className="text-lg font-semibold text-primary">2,450</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Points Redeemed This Month</span>
                    <span className="text-lg font-semibold text-destructive">850</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Loyalty Members */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-foreground">Loyalty Members</h3>
              <div className="flex items-center space-x-2">
                <Input
                  placeholder="Search members..."
                  className="w-64"
                  data-testid="input-search-members"
                />
                <Button variant="outline" size="sm">
                  <i className="fas fa-search"></i>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {loyaltyAccounts && loyaltyAccounts.length > 0 ? (
                loyaltyAccounts.map((account: LoyaltyAccount) => {
                const currentTier = getTierForPoints(account.points);
                const nextTier = getNextTier(account.points);
                const progress = getProgressToNextTier(account.points);
                
                return (
                  <div 
                    key={account.id} 
                    className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    data-testid={`card-loyalty-member-${account.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                          <i className="fas fa-user text-primary"></i>
                        </div>
                        <div>
                          <h4 className="text-lg font-medium text-foreground" data-testid={`text-member-name-${account.id}`}>
                            {account.customerName}
                          </h4>
                          <div className="flex items-center space-x-4 mt-1">
                            <Badge className={currentTier.color} data-testid={`badge-member-tier-${account.id}`}>
                              {currentTier.name}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              Last updated {new Date(account.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <div className="text-2xl font-bold text-foreground" data-testid={`text-member-points-${account.id}`}>
                          {account.points.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">points</div>
                      </div>
                    </div>
                    
                    {nextTier && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="text-muted-foreground">
                            Progress to {nextTier.name}
                          </span>
                          <span className="text-foreground">
                            {nextTier.minPoints - account.points} points needed
                          </span>
                        </div>
                        <Progress value={progress} className="h-2" data-testid={`progress-member-tier-${account.id}`} />
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-4">
                      <span className="text-xs text-muted-foreground">
                        Last updated: {new Date(account.updatedAt).toLocaleDateString()}
                      </span>
                      <div className="flex items-center space-x-2">
                        <Button variant="outline" size="sm" data-testid={`button-adjust-points-${account.id}`}>
                          <i className="fas fa-plus-minus mr-1"></i>
                          Adjust Points
                        </Button>
                        <Button variant="outline" size="sm" data-testid={`button-view-history-${account.id}`}>
                          <i className="fas fa-history mr-1"></i>
                          History
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-loyalty-members">
                  <i className="fas fa-star text-2xl mb-2"></i>
                  <p>No loyalty members yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Point Adjustment Form */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-medium text-foreground mb-4">Quick Point Adjustment</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="customer-select" className="text-sm font-medium text-foreground">
                  Customer
                </Label>
                <select
                  id="customer-select"
                  className="mt-1 block w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-ring focus:border-ring"
                  data-testid="select-customer-points"
                >
                  <option value="">Select customer</option>
                  {loyaltyAccounts?.map((account: LoyaltyAccount) => (
                    <option key={account.id} value={account.id}>
                      {account.customerName}
                    </option>
                  )) || []}
                </select>
              </div>
              
              <div>
                <Label htmlFor="points-amount" className="text-sm font-medium text-foreground">
                  Points
                </Label>
                <Input
                  id="points-amount"
                  type="number"
                  placeholder="Enter points"
                  data-testid="input-points-amount"
                />
              </div>
              
              <div>
                <Label htmlFor="adjustment-reason" className="text-sm font-medium text-foreground">
                  Reason
                </Label>
                <select
                  id="adjustment-reason"
                  className="mt-1 block w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-ring focus:border-ring"
                  data-testid="select-adjustment-reason"
                >
                  <option value="">Select reason</option>
                  <option value="purchase">Purchase</option>
                  <option value="bonus">Bonus</option>
                  <option value="redemption">Redemption</option>
                  <option value="correction">Correction</option>
                </select>
              </div>
              
              <div className="flex items-end">
                <Button className="w-full" data-testid="button-adjust-points">
                  <i className="fas fa-plus-minus mr-2"></i>
                  Adjust Points
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
