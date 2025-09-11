import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/hooks/use-tenant";
import MainLayout from "@/components/layout/main-layout";

// Mock payment data for demonstration
const mockPayments = [
  {
    id: "pi_1234567890",
    amount: "125.50",
    currency: "usd",
    status: "succeeded",
    paymentMethod: "card",
    customerName: "John Smith",
    createdAt: "2024-03-12T10:30:00Z",
    chargeId: "ch_1234567890",
  },
  {
    id: "pi_0987654321",
    amount: "89.75",
    currency: "usd",
    status: "pending",
    paymentMethod: "cash",
    customerName: "Sarah Johnson",
    createdAt: "2024-03-12T09:15:00Z",
    paymentNotes: "Exact change provided",
  },
  {
    id: "pi_5678901234",
    amount: "67.25",
    currency: "usd",
    status: "failed",
    paymentMethod: "card",
    customerName: "Mike Wilson",
    createdAt: "2024-03-11T16:45:00Z",
    failureReason: "insufficient_funds",
  },
];

const mockPaymentSettings = {
  paymentMode: "platform",
  stripeAccountId: null,
  applicationFeeBps: 250, // 2.5%
  defaultCurrency: "usd",
};

export default function Payments() {
  const { currentTenant } = useTenant();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "succeeded":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "canceled":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-blue-100 text-blue-800";
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "card":
        return "fas fa-credit-card";
      case "cash":
        return "fas fa-money-bill-wave";
      case "custom":
        return "fas fa-handshake";
      default:
        return "fas fa-question-circle";
    }
  };

  const totalProcessed = mockPayments
    .filter(payment => payment.status === "succeeded")
    .reduce((sum, payment) => sum + parseFloat(payment.amount), 0);

  const totalPending = mockPayments
    .filter(payment => payment.status === "pending")
    .reduce((sum, payment) => sum + parseFloat(payment.amount), 0);

  const failedCount = mockPayments.filter(payment => payment.status === "failed").length;

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Payment Processing</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage Stripe integration and payment methods</p>
          </div>
          <Button className="mt-4 sm:mt-0" data-testid="button-payment-settings">
            <i className="fas fa-cog mr-2"></i>
            Payment Settings
          </Button>
        </div>

        {/* Payment Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-check text-green-600 text-xl"></i>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Processed Today</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-processed-amount">
                    ${totalProcessed.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-clock text-yellow-600 text-xl"></i>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Pending</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-pending-amount">
                    ${totalPending.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-times text-red-600 text-xl"></i>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Failed Payments</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-failed-count">
                    {failedCount}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Payment Configuration */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Payment Configuration</h3>
              
              <div className="space-y-6">
                <div>
                  <Label className="text-sm font-medium text-foreground">Payment Mode</Label>
                  <Select defaultValue={mockPaymentSettings.paymentMode}>
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
                    {mockPaymentSettings.paymentMode === "platform" 
                      ? "Payments processed through our platform account"
                      : "Direct integration with your Stripe account"
                    }
                  </p>
                </div>

                {mockPaymentSettings.paymentMode !== "platform" && (
                  <div>
                    <Label className="text-sm font-medium text-foreground">Stripe Account Status</Label>
                    <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-yellow-800">
                            Account Setup Required
                          </p>
                          <p className="text-xs text-yellow-600">
                            Connect your Stripe account to accept payments
                          </p>
                        </div>
                        <Button size="sm" data-testid="button-connect-stripe">
                          Connect Stripe
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium text-foreground">Application Fee</Label>
                  <div className="mt-2 text-sm text-foreground" data-testid="text-application-fee">
                    {(mockPaymentSettings.applicationFeeBps / 100).toFixed(2)}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Platform fee applied to transactions
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium text-foreground">Default Currency</Label>
                  <div className="mt-2 text-sm text-foreground font-mono" data-testid="text-default-currency">
                    {mockPaymentSettings.defaultCurrency.toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <h4 className="text-sm font-medium text-foreground mb-3">Supported Payment Methods</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-accent/20 rounded-lg">
                    <i className="fas fa-credit-card text-2xl text-primary mb-2"></i>
                    <p className="text-sm font-medium text-foreground">Credit Cards</p>
                    <p className="text-xs text-muted-foreground">Visa, Mastercard, Amex</p>
                  </div>
                  <div className="text-center p-3 bg-accent/20 rounded-lg">
                    <i className="fas fa-money-bill-wave text-2xl text-green-600 mb-2"></i>
                    <p className="text-sm font-medium text-foreground">Cash</p>
                    <p className="text-xs text-muted-foreground">In-person payments</p>
                  </div>
                  <div className="text-center p-3 bg-accent/20 rounded-lg">
                    <i className="fas fa-handshake text-2xl text-blue-600 mb-2"></i>
                    <p className="text-sm font-medium text-foreground">Custom</p>
                    <p className="text-xs text-muted-foreground">Insurance, etc.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent Payments */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Recent Payments</h3>
              
              <div className="space-y-4">
                {mockPayments.map((payment) => (
                  <div 
                    key={payment.id}
                    className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                    data-testid={`card-payment-${payment.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <i className={`${getPaymentMethodIcon(payment.paymentMethod)} text-lg text-muted-foreground`}></i>
                        <div>
                          <h4 className="text-sm font-medium text-foreground" data-testid={`text-payment-customer-${payment.id}`}>
                            {payment.customerName}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {new Date(payment.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-foreground" data-testid={`text-payment-amount-${payment.id}`}>
                          ${payment.amount}
                        </div>
                        <Badge className={getStatusColor(payment.status)} data-testid={`badge-payment-status-${payment.id}`}>
                          {payment.status}
                        </Badge>
                      </div>
                    </div>
                    
                    {payment.paymentNotes && (
                      <div className="mt-2 text-xs text-muted-foreground bg-accent/20 p-2 rounded">
                        <i className="fas fa-comment mr-1"></i>
                        {payment.paymentNotes}
                      </div>
                    )}
                    
                    {payment.failureReason && (
                      <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                        <i className="fas fa-exclamation-triangle mr-1"></i>
                        Failure: {payment.failureReason.replace("_", " ")}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border text-xs">
                      <span className="text-muted-foreground font-mono" data-testid={`text-payment-id-${payment.id}`}>
                        {payment.id}
                      </span>
                      {payment.chargeId && (
                        <Button variant="outline" size="sm">
                          <i className="fas fa-external-link-alt mr-1"></i>
                          View in Stripe
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm" data-testid="button-view-all-payments">
                  <i className="fas fa-list mr-2"></i>
                  View All Payments
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Webhook Configuration */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h3 className="text-lg font-medium text-foreground mb-4">Webhook Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label className="text-sm font-medium text-foreground">Webhook Endpoint</Label>
                <div className="mt-2 p-3 bg-muted/50 border border-border rounded-lg font-mono text-sm text-foreground" data-testid="text-webhook-endpoint">
                  https://your-domain.com/api/stripe/webhook
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Configure this URL in your Stripe dashboard
                </p>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-foreground">Events to Listen For</Label>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-check text-green-600"></i>
                    <span className="text-foreground">payment_intent.succeeded</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-check text-green-600"></i>
                    <span className="text-foreground">payment_intent.payment_failed</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="fas fa-check text-green-600"></i>
                    <span className="text-foreground">account.updated</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-6 pt-6 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-foreground">Webhook Status</h4>
                  <p className="text-xs text-muted-foreground">Last event received 5 minutes ago</p>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-green-600">Active</span>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-test-webhook">
                    <i className="fas fa-flask mr-2"></i>
                    Test Webhook
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
