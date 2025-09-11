import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenant } from "@/contexts/tenant-context";

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

interface CreditAccount {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string;
  limitAmount: string;
  balance: string;
  status: string;
  updatedAt: string;
}

interface CreditTransaction {
  id: string;
  tenantId: string;
  customerId: string;
  customerName: string;
  orderId?: string;
  amount: string;
  fee: string;
  dueDate?: string;
  paidDate?: string;
  status: string;
  createdAt: string;
  lastPayment?: string;
  nextDue?: string;
  overdue?: boolean;
}

export default function Credit() {
  const { currentTenant } = useTenant();

  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/tenants", currentTenant, "customers"],
    enabled: !!currentTenant,
  });

  const { data: creditAccounts, isLoading: creditAccountsLoading } = useQuery<CreditAccount[]>({
    queryKey: ["/api/tenants", currentTenant, "credit"],
    enabled: !!currentTenant,
  });

  const { data: creditTransactions, isLoading: creditTransactionsLoading } = useQuery<CreditTransaction[]>({
    queryKey: ["/api/tenants", currentTenant, "credit-transactions"],
    enabled: !!currentTenant,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "suspended":
        return "bg-red-100 text-red-800";
      case "frozen":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTransactionStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "overdue":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const totalCreditLimit = creditAccounts?.reduce(
    (sum, account) => sum + parseFloat(account.limitAmount), 0
  ) || 0;
  const totalOutstanding = creditAccounts?.reduce(
    (sum, account) => sum + parseFloat(account.balance), 0
  ) || 0;
  const overdueAccounts = creditTransactions?.filter(transaction => transaction.overdue).length || 0;

  if (customersLoading || creditAccountsLoading || creditTransactionsLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 w-48 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Credit Management</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage customer credit limits and transactions</p>
          </div>
          <Button className="mt-4 sm:mt-0" data-testid="button-create-credit-account">
            <i className="fas fa-credit-card mr-2"></i>
            Create Credit Account
          </Button>
        </div>

        {/* Credit Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <i className="fas fa-credit-card text-blue-600 text-xl"></i>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Credit Limit</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-total-credit-limit">
                    ${totalCreditLimit.toFixed(2)}
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
                    <i className="fas fa-exclamation-triangle text-yellow-600 text-xl"></i>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Outstanding Balance</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-outstanding-balance">
                    ${totalOutstanding.toFixed(2)}
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
                    <i className="fas fa-clock text-red-600 text-xl"></i>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Overdue Accounts</p>
                  <p className="text-2xl font-semibold text-foreground" data-testid="text-overdue-accounts">
                    {overdueAccounts}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Credit Accounts */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Credit Accounts</h3>
              <div className="space-y-4">
                {creditAccounts && creditAccounts.length > 0 ? creditAccounts.map((account) => {
                  const availableCredit = parseFloat(account.limitAmount) - parseFloat(account.balance);
                  const utilizationPercent = (parseFloat(account.balance) / parseFloat(account.limitAmount)) * 100;
                  
                  return (
                    <div 
                      key={account.id}
                      className="border border-border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                      data-testid={`card-credit-account-${account.id}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="text-sm font-medium text-foreground" data-testid={`text-account-customer-${account.id}`}>
                            {account.customerName}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            Limit: ${account.limitAmount} | Available: ${availableCredit.toFixed(2)}
                          </p>
                        </div>
                        <Badge className={getStatusColor(account.status)} data-testid={`badge-account-status-${account.id}`}>
                          {account.status.charAt(0).toUpperCase() + account.status.slice(1)}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Outstanding Balance</span>
                          <span className="font-semibold text-foreground" data-testid={`text-account-balance-${account.id}`}>
                            ${account.balance}
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              utilizationPercent > 80 ? 'bg-red-500' : 
                              utilizationPercent > 60 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                          ></div>
                        </div>
                        
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <span>Utilization: {utilizationPercent.toFixed(1)}%</span>
                          <span className="text-muted-foreground">
                            Updated: {new Date(account.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                          Last updated: {new Date(account.updatedAt).toLocaleDateString()}
                        </span>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" data-testid={`button-adjust-limit-${account.id}`}>
                            Adjust Limit
                          </Button>
                          <Button variant="outline" size="sm" data-testid={`button-view-transactions-${account.id}`}>
                            Transactions
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-credit-accounts">
                    <i className="fas fa-credit-card text-2xl mb-2"></i>
                    <p>No credit accounts yet</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recent Credit Transactions */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-medium text-foreground mb-4">Recent Transactions</h3>
              <div className="space-y-4">
                {creditTransactions && creditTransactions.length > 0 ? creditTransactions.slice(0, 5).map((transaction) => (
                  <div 
                    key={transaction.id}
                    className="border border-border rounded-lg p-4"
                    data-testid={`card-credit-transaction-${transaction.id}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="text-sm font-medium text-foreground" data-testid={`text-transaction-customer-${transaction.id}`}>
                          {transaction.customerName}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge className={getTransactionStatusColor(transaction.status)} data-testid={`badge-transaction-status-${transaction.id}`}>
                        {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Amount: </span>
                        <span className="font-semibold text-foreground" data-testid={`text-transaction-amount-${transaction.id}`}>
                          ${transaction.amount}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Fee: </span>
                        <span className="text-foreground">${transaction.fee}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Due: </span>
                        <span className={`${transaction.status === 'overdue' ? 'text-red-600 font-semibold' : 'text-foreground'}`}>
                          {transaction.dueDate ? new Date(transaction.dueDate).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                      {transaction.paidDate && (
                        <div>
                          <span className="text-muted-foreground">Paid: </span>
                          <span className="text-green-600">{new Date(transaction.paidDate).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-credit-transactions">
                    <i className="fas fa-receipt text-2xl mb-2"></i>
                    <p>No credit transactions yet</p>
                  </div>
                )}
              </div>
              
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm" data-testid="button-view-all-transactions">
                  <i className="fas fa-list mr-2"></i>
                  View All Transactions
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Credit Actions */}
        <Card className="mt-6">
          <CardContent className="p-6">
            <h3 className="text-lg font-medium text-foreground mb-4">Credit Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Create New Credit Account</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="new-credit-customer" className="text-sm">Customer</Label>
                    <select
                      id="new-credit-customer"
                      className="mt-1 block w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-ring focus:border-ring"
                      data-testid="select-new-credit-customer"
                    >
                      <option value="">Select customer</option>
                      {customers?.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="credit-limit" className="text-sm">Credit Limit</Label>
                    <Input
                      id="credit-limit"
                      type="number"
                      placeholder="Enter credit limit"
                      step="0.01"
                      data-testid="input-credit-limit"
                    />
                  </div>
                  <Button className="w-full" data-testid="button-create-account">
                    Create Credit Account
                  </Button>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">Record Payment</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="payment-customer" className="text-sm">Customer</Label>
                    <select
                      id="payment-customer"
                      className="mt-1 block w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-ring focus:border-ring"
                      data-testid="select-payment-customer"
                    >
                      <option value="">Select customer</option>
                      {creditAccounts?.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.customerName} (${account.balance} outstanding)
                        </option>
                      )) || []}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="payment-amount" className="text-sm">Payment Amount</Label>
                    <Input
                      id="payment-amount"
                      type="number"
                      placeholder="Enter payment amount"
                      step="0.01"
                      data-testid="input-payment-amount"
                    />
                  </div>
                  <Button variant="secondary" className="w-full" data-testid="button-record-payment">
                    Record Payment
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
