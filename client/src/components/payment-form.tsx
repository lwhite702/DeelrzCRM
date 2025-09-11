import { useState } from "react";
import { PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/tenant-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { STRIPE_ENABLED } from "@/lib/stripe";
import type { Customer } from "@shared/schema";

interface PaymentFormProps {
  onSuccess?: (paymentId: string) => void;
  onCancel?: () => void;
  prefilledAmount?: number;
  customerId?: string;
  orderId?: string;
}

export function PaymentForm({ 
  onSuccess, 
  onCancel, 
  prefilledAmount, 
  customerId, 
  orderId 
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState(prefilledAmount?.toString() || "");
  const [currency] = useState("usd");
  const [description, setDescription] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId || "");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentIntentData, setPaymentIntentData] = useState<{
    clientSecret: string;
    paymentId: string;
    paymentIntentId: string;
  } | null>(null);

  // Fetch customers for selection
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/tenants', currentTenant, 'customers'],
    enabled: !!currentTenant && !customerId,
  });

  // Create payment intent mutation
  const createPaymentIntentMutation = useMutation({
    mutationFn: async (paymentData: any) => {
      return apiRequest('POST', `/api/tenants/${currentTenant}/create-payment-intent`, paymentData);
    },
    onSuccess: (data: any) => {
      setPaymentIntentData(data);
      toast({
        title: "Payment Intent Created",
        description: "Please complete your card details to process the payment.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create payment intent",
        variant: "destructive",
      });
    },
  });

  // Confirm payment mutation
  const confirmPaymentMutation = useMutation({
    mutationFn: async (confirmData: any) => {
      return apiRequest('POST', `/api/tenants/${currentTenant}/confirm-payment`, confirmData);
    },
    onSuccess: (data) => {
      toast({
        title: "Payment Successful",
        description: `Payment of $${amount} was processed successfully.`,
      });
      // Invalidate payments cache
      queryClient.invalidateQueries({ queryKey: ['/api/tenants', currentTenant, 'payments'] });
      
      if (onSuccess && paymentIntentData) {
        onSuccess(paymentIntentData.paymentId);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Payment Failed",
        description: error.message || "Payment processing failed",
        variant: "destructive",
      });
    },
  });

  const handleCreatePaymentIntent = async () => {
    if (!currentTenant) {
      toast({
        title: "Error",
        description: "No tenant selected",
        variant: "destructive",
      });
      return;
    }

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    const paymentData = {
      amount: amountNum,
      currency,
      customerId: selectedCustomerId || undefined,
      orderId: orderId || undefined,
      description: description || undefined,
    };

    createPaymentIntentMutation.mutate(paymentData);
  };

  const handlePaymentSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements || !paymentIntentData) {
      return;
    }

    setIsProcessing(true);

    try {
      // Confirm payment with Stripe
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        // Handle payment error - don't call backend, just show error to user
        toast({
          title: "Payment Failed",
          description: error.message || "Payment processing failed",
          variant: "destructive",
        });
      } else if (paymentIntent) {
        // Payment completed (succeeded or requires_action, etc.)
        // Call backend to confirm and sync the payment status
        confirmPaymentMutation.mutate({
          paymentIntentId: paymentIntent.id,
          paymentId: paymentIntentData.paymentId,
        });
      }
    } catch (error: any) {
      toast({
        title: "Payment Error",
        description: "An unexpected error occurred during payment processing",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!STRIPE_ENABLED) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            <i className="fas fa-exclamation-triangle text-yellow-500 text-2xl mb-2"></i>
            <p>Stripe payments are not configured.</p>
            <p className="text-sm">Please configure Stripe to process payments.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center">
          <i className="fas fa-credit-card mr-2 text-primary"></i>
          Process Payment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {!paymentIntentData ? (
          // Step 1: Payment Details Form
          <>
            <div className="space-y-4">
              <div>
                <Label htmlFor="amount">Amount (USD) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="input-payment-amount"
                  required
                />
              </div>

              {!customerId && customers.length > 0 && (
                <div>
                  <Label>Customer (Optional)</Label>
                  <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                    <SelectTrigger data-testid="select-customer">
                      <SelectValue placeholder="Select customer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No customer selected</SelectItem>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name} - {customer.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Payment description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="input-payment-description"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                onClick={handleCreatePaymentIntent}
                disabled={!amount || createPaymentIntentMutation.isPending}
                className="flex-1"
                data-testid="button-create-intent"
              >
                {createPaymentIntentMutation.isPending ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Creating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-arrow-right mr-2"></i>
                    Continue to Payment
                  </>
                )}
              </Button>
              {onCancel && (
                <Button variant="outline" onClick={onCancel} data-testid="button-cancel-payment">
                  Cancel
                </Button>
              )}
            </div>
          </>
        ) : (
          // Step 2: Stripe Payment Form
          <form onSubmit={handlePaymentSubmit} className="space-y-6">
            <div className="p-4 bg-muted/50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Payment Amount:</span>
                <span className="text-lg font-bold">${amount}</span>
              </div>
              {selectedCustomerId && (
                <div className="text-sm text-muted-foreground">
                  Customer: {customers.find(c => c.id === selectedCustomerId)?.email}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <Label>Card Details *</Label>
              <div className="border rounded-md p-3 bg-background">
                <PaymentElement
                  options={{
                    layout: 'tabs',
                    paymentMethodOrder: ['card']
                  }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={!stripe || !elements || isProcessing}
                className="flex-1"
                data-testid="button-complete-payment"
              >
                {isProcessing ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Processing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-lock mr-2"></i>
                    Complete Payment ${amount}
                  </>
                )}
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setPaymentIntentData(null)}
                disabled={isProcessing}
                data-testid="button-back-to-details"
              >
                Back
              </Button>
            </div>

            <div className="text-xs text-muted-foreground text-center">
              <i className="fas fa-shield-alt mr-1"></i>
              Your payment information is secure and encrypted by Stripe
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}