import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipHelp } from "@/components/ui/tooltip-help";
import { useTenant } from "@/contexts/tenant-context";

interface Product {
  id: string;
  name: string;
  ndcCode?: string;
  type: string;
  unit: string;
  description?: string;
  createdAt: string;
  currentStock?: number;
  wac?: string;
  minStockThreshold?: number;
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export default function Inventory() {
  const { currentTenant } = useTenant();
  
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ["/api/tenants", currentTenant, "products", "with_inventory"],
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${currentTenant}/products?with_inventory=true`);
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
    enabled: !!currentTenant,
  });

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
            <TooltipHelp content="Inventory management allows you to track medications, products, and stock levels. Monitor current inventory, set reorder points, and manage product information from this central hub." articleSlug="inventory-overview">
              <h1 className="text-2xl font-bold text-foreground">Inventory Management</h1>
            </TooltipHelp>
            <p className="mt-1 text-sm text-muted-foreground">Manage medications, products, and stock levels</p>
          </div>
          <div className="flex space-x-3 mt-4 sm:mt-0">
            <TooltipHelp content="Add a new batch of products to your inventory. Batches track supplier information, acquisition costs, and expiration dates for better inventory management." side="bottom">
              <Button variant="secondary" data-testid="button-add-batch">
                <i className="fas fa-plus mr-2"></i>
                Add Batch
              </Button>
            </TooltipHelp>
            <TooltipHelp content="Add a new product to your inventory catalog. Include product details, NDC codes, and set minimum stock thresholds for automated reorder alerts." side="bottom">
              <Button data-testid="button-add-product">
                <i className="fas fa-pills mr-2"></i>
                Add Product
              </Button>
            </TooltipHelp>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row space-y-4 lg:space-y-0 lg:space-x-4">
              <div className="flex-1">
                <TooltipHelp content="Search products by name, NDC code, or description. Use partial matches to quickly find specific items in your inventory." side="right">
                  <Label htmlFor="search">Search Products</Label>
                </TooltipHelp>
                <Input 
                  id="search" 
                  placeholder="Search by name, NDC code, or description"
                  data-testid="input-product-search"
                />
              </div>
              <div className="w-full lg:w-48">
                <Label htmlFor="category">Category</Label>
                <Select>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="prescription">Prescription</SelectItem>
                    <SelectItem value="otc">OTC Medicine</SelectItem>
                    <SelectItem value="vitamins">Vitamins</SelectItem>
                    <SelectItem value="personal-care">Personal Care</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full lg:w-48">
                <TooltipHelp content="Filter products by stock status: In Stock (above minimum), Low Stock (below threshold), or Out of Stock (zero quantity)." side="right">
                  <Label htmlFor="stock-status">Stock Status</Label>
                </TooltipHelp>
                <Select>
                  <SelectTrigger data-testid="select-stock-status">
                    <SelectValue placeholder="All Stock Levels" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stock Levels</SelectItem>
                    <SelectItem value="in-stock">In Stock</SelectItem>
                    <SelectItem value="low-stock">Low Stock</SelectItem>
                    <SelectItem value="out-of-stock">Out of Stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Table */}
        <Card>
          <CardContent className="p-0">
            <div className="px-6 py-4 border-b border-border">
              <TooltipHelp content="This table shows all your products with current stock levels, pricing, and status. Click any product row to view detailed information and transaction history." side="right">
                <h3 className="text-lg font-medium text-foreground">Products & Stock Levels</h3>
              </TooltipHelp>
            </div>
            
            {!products || products.length === 0 ? (
              <div className="p-8 text-center">
                <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-boxes text-2xl text-muted-foreground"></i>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Products Found</h3>
                <p className="text-muted-foreground mb-4">
                  Start building your inventory by adding your first product.
                </p>
                <Button data-testid="button-add-first-product">
                  <i className="fas fa-plus mr-2"></i>
                  Add Your First Product
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border" data-testid="products-table">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        NDC Code
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Current Stock
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        WAC
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {products.map((product) => (
                      <tr key={product.id} className="hover:bg-accent/50" data-testid={`row-product-${product.id}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-foreground" data-testid={`text-product-name-${product.id}`}>
                              {product.name}
                            </div>
                            {product.description && (
                              <div className="text-sm text-muted-foreground" data-testid={`text-product-description-${product.id}`}>
                                {product.description}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground" data-testid={`text-product-ndc-${product.id}`}>
                          {product.ndcCode || "N/A"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-foreground">
                            {product.currentStock || 0} {product.unit}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Min: {product.minStockThreshold || 0}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                          ${product.wac || "0.00"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            product.stockStatus === 'in_stock' 
                              ? 'bg-green-100 text-green-800' 
                              : product.stockStatus === 'low_stock'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {product.stockStatus === 'in_stock' 
                              ? 'In Stock' 
                              : product.stockStatus === 'low_stock'
                              ? 'Low Stock'
                              : 'Out of Stock'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            data-testid={`button-edit-product-${product.id}`}
                          >
                            Edit
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            data-testid={`button-adjust-product-${product.id}`}
                          >
                            Adjust
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
    </div>
  );
}
