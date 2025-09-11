import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipHelp } from "@/components/ui/tooltip-help";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/contexts/tenant-context";
import { apiRequest } from "@/lib/queryClient";

interface Product {
  id: string;
  name: string;
  ndcCode?: string;
  type: string;
  unit: string;
  description?: string;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface PriceCalculation {
  quantity: number;
  unitPrice: number;
  total: string;
}

interface QtyCalculation {
  suggestedQuantity: number;
  unitPrice: number;
  actualTotal: string;
  change: string;
}

export default function SalesPOS() {
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [qtyCalcProduct, setQtyCalcProduct] = useState<string>("");
  const [qtyCalcQuantity, setQtyCalcQuantity] = useState<string>("");
  const [amtCalcProduct, setAmtCalcProduct] = useState<string>("");
  const [amtCalcAmount, setAmtCalcAmount] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const { data: products, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/tenants", currentTenant, "products"],
    enabled: !!currentTenant,
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/tenants", currentTenant, "customers"],
    enabled: !!currentTenant,
  });

  const qtyToPriceMutation = useMutation({
    mutationFn: async (data: { productId: string; quantity: number; tenantId: string }) => {
      const res = await apiRequest("POST", "/api/orders/assist/qty-to-price", data);
      return await res.json();
    },
  });

  const amountToQtyMutation = useMutation({
    mutationFn: async (data: { productId: string; targetAmount: number; tenantId: string }) => {
      const res = await apiRequest("POST", "/api/orders/assist/amount-to-qty", data);
      return await res.json();
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const res = await apiRequest("POST", `/api/tenants/${currentTenant}/orders`, orderData);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Order Created",
        description: "Sale processed successfully",
      });
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["/api/tenants", currentTenant, "orders"] });
    },
    onError: (error) => {
      toast({
        title: "Order Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredProducts = products?.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.ndcCode?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
  const tax = subtotal * 0.08; // 8% tax
  const deliveryFee = 0; // No delivery fee for POS
  const total = subtotal + tax + deliveryFee;

  const addToCart = async (product: Product) => {
    const existingItem = cart.find(item => item.productId === product.id);
    
    if (existingItem) {
      // For existing items, calculate new quantity and get updated pricing
      const newQuantity = existingItem.quantity + 1;
      try {
        const priceCalc = await qtyToPriceMutation.mutateAsync({
          productId: product.id,
          quantity: newQuantity,
          tenantId: currentTenant!,
        });
        
        setCart(cart.map(item =>
          item.productId === product.id
            ? { 
                ...item, 
                quantity: newQuantity, 
                unitPrice: priceCalc.unitPrice,
                total: parseFloat(priceCalc.total)
              }
            : item
        ));
      } catch (error) {
        toast({
          title: "Pricing Error",
          description: "Unable to calculate pricing for this item",
          variant: "destructive",
        });
      }
    } else {
      // For new items, get pricing for quantity 1
      try {
        const priceCalc = await qtyToPriceMutation.mutateAsync({
          productId: product.id,
          quantity: 1,
          tenantId: currentTenant!,
        });
        
        setCart([...cart, {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: priceCalc.unitPrice,
          total: parseFloat(priceCalc.total),
        }]);
      } catch (error) {
        toast({
          title: "Pricing Error",
          description: "Unable to calculate pricing for this item",
          variant: "destructive",
        });
      }
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer("");
    setPaymentMethod("");
    setPaymentNotes("");
  };

  const handleQtyToPrice = () => {
    if (!qtyCalcProduct || !qtyCalcQuantity || !currentTenant) return;
    
    qtyToPriceMutation.mutate({
      productId: qtyCalcProduct,
      quantity: parseInt(qtyCalcQuantity),
      tenantId: currentTenant,
    });
  };

  const handleAmountToQty = () => {
    if (!amtCalcProduct || !amtCalcAmount || !currentTenant) return;
    
    amountToQtyMutation.mutate({
      productId: amtCalcProduct,
      targetAmount: parseFloat(amtCalcAmount),
      tenantId: currentTenant,
    });
  };

  const processPayment = () => {
    if (cart.length === 0) {
      toast({
        title: "Empty Cart",
        description: "Please add items to cart before processing payment",
        variant: "destructive",
      });
      return;
    }

    if (!paymentMethod) {
      toast({
        title: "Payment Method Required",
        description: "Please select a payment method",
        variant: "destructive",
      });
      return;
    }

    const orderData = {
      customerId: selectedCustomer || null,
      status: "confirmed",
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      total: total.toFixed(2),
      paymentMethod,
      paymentNotes: paymentNotes || null,
      paymentStatus: "completed",
    };

    createOrderMutation.mutate(orderData);
  };

  if (productsLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-96 w-full" />
          </div>
          <div>
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8">
          <TooltipHelp content="The Sales Point of Sale system allows you to process customer transactions, add products to cart, calculate pricing, and complete payments. Use the calculators to help determine quantities and pricing." articleSlug="sales-pos-overview">
            <h1 className="text-2xl font-bold text-foreground">Sales Point of Sale</h1>
          </TooltipHelp>
          <p className="mt-1 text-sm text-muted-foreground">Process customer transactions and manage orders</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Product Selection */}
          <div className="lg:col-span-2">
            <Card className="mb-6">
              <CardContent className="p-6">
                <TooltipHelp content="Search and select products to add to the customer's cart. Click on any product card to add it to the order. Prices are calculated automatically based on quantity and current pricing rules." side="right">
                  <h3 className="text-lg font-medium text-foreground mb-4">Product Selection</h3>
                </TooltipHelp>
                
                <div className="mb-4">
                  <TooltipHelp content="Search products by name or NDC code. Start typing to filter the product list and find items quickly." side="bottom">
                    <Input
                      placeholder="Search products..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="input-product-search"
                    />
                  </TooltipHelp>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="border border-border rounded-lg p-4 hover:bg-accent/50 cursor-pointer transition-colors"
                      onClick={() => addToCart(product)}
                      data-testid={`card-product-${product.id}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-foreground" data-testid={`text-product-name-${product.id}`}>
                            {product.name}
                          </h4>
                          {product.ndcCode && (
                            <p className="text-xs text-muted-foreground" data-testid={`text-product-ndc-${product.id}`}>
                              NDC: {product.ndcCode}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-primary">$10.99</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Stock: 100+</span>
                        <Button size="sm" className="h-6 w-6 p-0" data-testid={`button-add-product-${product.id}`}>
                          <i className="fas fa-plus text-xs"></i>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* POS Calculators */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <TooltipHelp content="Calculate the total price for a specific quantity of a product. This helps determine costs before adding items to the cart." side="top">
                    <h4 className="text-sm font-medium text-foreground mb-3">Qty → Price Calculator</h4>
                  </TooltipHelp>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Product</Label>
                      <Select value={qtyCalcProduct} onValueChange={setQtyCalcProduct}>
                        <SelectTrigger data-testid="select-qty-calc-product">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Quantity</Label>
                      <Input
                        type="number"
                        placeholder="Enter quantity"
                        value={qtyCalcQuantity}
                        onChange={(e) => setQtyCalcQuantity(e.target.value)}
                        data-testid="input-qty-calc-quantity"
                      />
                    </div>
                    <Button 
                      onClick={handleQtyToPrice}
                      disabled={qtyToPriceMutation.isPending}
                      size="sm"
                      className="w-full"
                      data-testid="button-calculate-price"
                    >
                      Calculate
                    </Button>
                    {qtyToPriceMutation.data && (
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Total: <span className="text-lg font-semibold text-foreground" data-testid="text-calculated-price">
                            ${qtyToPriceMutation.data.total}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <TooltipHelp content="Enter a target amount and get the suggested quantity that best matches that price. Useful when customers have a specific budget in mind." side="top">
                    <h4 className="text-sm font-medium text-foreground mb-3">Amount → Suggested Qty</h4>
                  </TooltipHelp>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Product</Label>
                      <Select value={amtCalcProduct} onValueChange={setAmtCalcProduct}>
                        <SelectTrigger data-testid="select-amount-calc-product">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products?.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Target Amount</Label>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        step="0.01"
                        value={amtCalcAmount}
                        onChange={(e) => setAmtCalcAmount(e.target.value)}
                        data-testid="input-amount-calc-amount"
                      />
                    </div>
                    <Button 
                      onClick={handleAmountToQty}
                      disabled={amountToQtyMutation.isPending}
                      size="sm"
                      className="w-full"
                      data-testid="button-calculate-quantity"
                    >
                      Calculate
                    </Button>
                    {amountToQtyMutation.data && (
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">
                          Suggested: <span className="text-lg font-semibold text-foreground" data-testid="text-suggested-quantity">
                            {amountToQtyMutation.data.suggestedQuantity} units
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground" data-testid="text-change-amount">
                          Change: ${amountToQtyMutation.data.change}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Shopping Cart & Checkout */}
          <div className="lg:col-span-1">
            <Card className="sticky top-24">
              <CardContent className="p-6">
                <h3 className="text-lg font-medium text-foreground mb-4">Shopping Cart</h3>
                
                <div className="mb-4">
                  <Label className="text-sm font-medium text-foreground">Customer</Label>
                  <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                    <SelectTrigger data-testid="select-customer">
                      <SelectValue placeholder="Walk-in Customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Walk-in Customer</SelectItem>
                      {customers?.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 mb-6 max-h-48 overflow-y-auto">
                  {cart.length === 0 ? (
                    <div className="text-center py-8">
                      <i className="fas fa-shopping-cart text-4xl text-muted-foreground mb-2"></i>
                      <p className="text-sm text-muted-foreground">Cart is empty</p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div key={item.productId} className="flex items-center justify-between py-2 border-b border-border">
                        <div className="flex-1 pr-3">
                          <p className="text-sm font-medium text-foreground" data-testid={`text-cart-item-name-${item.productId}`}>
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            ${item.unitPrice.toFixed(2)} x {item.quantity}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-foreground" data-testid={`text-cart-item-total-${item.productId}`}>
                            ${item.total.toFixed(2)}
                          </span>
                          <Button 
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-800"
                            onClick={() => removeFromCart(item.productId)}
                            data-testid={`button-remove-cart-item-${item.productId}`}
                          >
                            <i className="fas fa-times text-xs"></i>
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Order Summary */}
                <div className="space-y-2 border-t border-border pt-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="text-foreground" data-testid="text-subtotal">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tax:</span>
                    <span className="text-foreground" data-testid="text-tax">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery Fee:</span>
                    <span className="text-foreground" data-testid="text-delivery-fee">${deliveryFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-lg border-t border-border pt-2">
                    <span className="text-foreground">Total:</span>
                    <span className="text-foreground" data-testid="text-total">${total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="mb-6">
                  <Label className="text-sm font-medium text-foreground">Payment Method</Label>
                  <RadioGroup 
                    value={paymentMethod} 
                    onValueChange={setPaymentMethod}
                    className="mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="card" id="card" data-testid="radio-payment-card" />
                      <Label htmlFor="card" className="text-sm text-foreground">Credit Card</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="cash" id="cash" data-testid="radio-payment-cash" />
                      <Label htmlFor="cash" className="text-sm text-foreground">Cash</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="custom" id="custom" data-testid="radio-payment-custom" />
                      <Label htmlFor="custom" className="text-sm text-foreground">Custom Payment</Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Payment Details/Comments Form */}
                {(paymentMethod === "cash" || paymentMethod === "custom") && (
                  <div className="mb-6">
                    <Label className="text-sm font-medium text-foreground">Payment Details/Comments</Label>
                    <Textarea
                      rows={3}
                      placeholder="Enter payment details or comments..."
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="mt-2"
                      data-testid="textarea-payment-notes"
                    />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-3">
                  <Button 
                    onClick={processPayment}
                    disabled={createOrderMutation.isPending}
                    className="w-full"
                    data-testid="button-process-payment"
                  >
                    {createOrderMutation.isPending ? "Processing..." : "Process Payment"}
                  </Button>
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="secondary" size="sm" data-testid="button-save-draft">
                      Save Draft
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={clearCart}
                      data-testid="button-clear-cart"
                    >
                      Clear Cart
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
