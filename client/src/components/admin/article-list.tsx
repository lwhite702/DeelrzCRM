import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";
import { type KbArticle } from "@shared/schema";
import { 
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  FileText,
  Calendar,
  User,
  Building,
  Globe,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Hash,
  Tag
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ArticleListProps {
  onEdit?: (article: KbArticle) => void;
  onView?: (article: KbArticle) => void;
  className?: string;
}

interface ArticleFilters {
  search: string;
  category: string;
  status: string;
  tenantId: string;
}

interface PaginationState {
  page: number;
  pageSize: number;
}

const categoryOptions = [
  { value: "", label: "All Categories" },
  { value: "getting_started", label: "Getting Started", color: "bg-blue-100 text-blue-800" },
  { value: "features", label: "Features", color: "bg-green-100 text-green-800" },
  { value: "troubleshooting", label: "Troubleshooting", color: "bg-orange-100 text-orange-800" },
  { value: "billing", label: "Billing", color: "bg-purple-100 text-purple-800" },
  { value: "api", label: "API", color: "bg-gray-100 text-gray-800" },
  { value: "integrations", label: "Integrations", color: "bg-indigo-100 text-indigo-800" },
  { value: "other", label: "Other", color: "bg-slate-100 text-slate-800" }
];

export function ArticleList({ onEdit, onView, className }: ArticleListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // State management
  const [filters, setFilters] = useState<ArticleFilters>({
    search: "",
    category: "",
    status: "",
    tenantId: "",
  });
  
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: 10,
  });
  
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; article?: KbArticle }>({ 
    open: false 
  });
  const [bulkAction, setBulkAction] = useState<{ type: 'activate' | 'deactivate'; open: boolean }>({
    type: 'activate',
    open: false
  });

  // Debounced search to avoid excessive API calls
  const debouncedSearch = useDebounce(filters.search, 300);

  // Fetch articles with filters and pagination
  const { data: articlesResponse, isLoading, error } = useQuery<KbArticle[]>({
    queryKey: ["/api/help/articles", { 
      search: debouncedSearch,
      category: filters.category,
      tenant_only: filters.tenantId ? 'true' : 'false',
      page: pagination.page,
      limit: pagination.pageSize
    }],
    staleTime: 30 * 1000, // 30 seconds
  });

  // Fetch tenants for filtering
  const { data: tenants = [] } = useQuery<{id: string; name: string; status: string}[]>({
    queryKey: ["/api/tenants"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Process and filter articles locally for advanced filtering
  const filteredArticles = useMemo(() => {
    let articles = articlesResponse || [];
    
    // Status filtering (active/inactive)
    if (filters.status === 'active') {
      articles = articles.filter(article => article.isActive);
    } else if (filters.status === 'inactive') {
      articles = articles.filter(article => !article.isActive);
    }
    
    return articles;
  }, [articlesResponse, filters.status]);

  // Pagination calculations
  const totalArticles = filteredArticles.length;
  const totalPages = Math.ceil(totalArticles / pagination.pageSize);
  const startIndex = (pagination.page - 1) * pagination.pageSize;
  const paginatedArticles = filteredArticles.slice(startIndex, startIndex + pagination.pageSize);

  // Delete article mutation
  const deleteArticleMutation = useMutation({
    mutationFn: async (articleId: string) => {
      const res = await apiRequest("DELETE", `/api/help/articles/${articleId}`);
      return res;
    },
    onSuccess: (_, articleId) => {
      toast({
        title: "Article Deleted",
        description: "The article has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/help/articles"] });
      setSelectedArticles(prev => {
        const updated = new Set(prev);
        updated.delete(articleId);
        return updated;
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete the article.",
        variant: "destructive",
      });
    },
  });

  // Bulk status update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ articleIds, isActive }: { articleIds: string[]; isActive: boolean }) => {
      const promises = articleIds.map(id =>
        apiRequest("PUT", `/api/help/articles/${id}`, { isActive })
      );
      return Promise.all(promises);
    },
    onSuccess: (_, { isActive }) => {
      toast({
        title: `Articles ${isActive ? 'Activated' : 'Deactivated'}`,
        description: `Successfully ${isActive ? 'activated' : 'deactivated'} ${selectedArticles.size} articles.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/help/articles"] });
      setSelectedArticles(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Update Failed",
        description: error.message || "Failed to update articles.",
        variant: "destructive",
      });
    },
  });

  // Event handlers
  const handleFilterChange = (key: keyof ArticleFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page when filtering
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: Math.max(1, Math.min(newPage, totalPages)) }));
  };

  const handlePageSizeChange = (newPageSize: string) => {
    setPagination({ page: 1, pageSize: parseInt(newPageSize) });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedArticles(new Set(paginatedArticles.map(article => article.id)));
    } else {
      setSelectedArticles(new Set());
    }
  };

  const handleSelectArticle = (articleId: string, checked: boolean) => {
    setSelectedArticles(prev => {
      const updated = new Set(prev);
      if (checked) {
        updated.add(articleId);
      } else {
        updated.delete(articleId);
      }
      return updated;
    });
  };

  const handleDeleteArticle = (article: KbArticle) => {
    setDeleteDialog({ open: true, article });
  };

  const confirmDelete = () => {
    if (deleteDialog.article) {
      deleteArticleMutation.mutate(deleteDialog.article.id);
      setDeleteDialog({ open: false });
    }
  };

  const handleBulkAction = (type: 'activate' | 'deactivate') => {
    setBulkAction({ type, open: true });
  };

  const confirmBulkAction = () => {
    bulkUpdateMutation.mutate({
      articleIds: Array.from(selectedArticles),
      isActive: bulkAction.type === 'activate'
    });
    setBulkAction({ type: 'activate', open: false });
  };

  const getCategoryLabel = (category: string) => {
    const option = categoryOptions.find(opt => opt.value === category);
    return option?.label || category;
  };

  const getCategoryColor = (category: string) => {
    const option = categoryOptions.find(opt => opt.value === category);
    return option?.color || "bg-gray-100 text-gray-800";
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Clear selected articles when filters change
  useEffect(() => {
    setSelectedArticles(new Set());
  }, [debouncedSearch, filters.category, filters.status, filters.tenantId]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load articles. Please try again later.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={cn("w-full space-y-4", className)}>
      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Knowledge Base Articles
            {!isLoading && (
              <Badge variant="outline" className="ml-2">
                {totalArticles} articles
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search articles by title or content..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="pl-10"
                data-testid="input-search-articles"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <Select value={filters.category} onValueChange={(value) => handleFilterChange('category', value)}>
                <SelectTrigger className="w-[180px]" data-testid="select-filter-category">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                <SelectTrigger className="w-[130px]" data-testid="select-filter-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filters.tenantId} onValueChange={(value) => handleFilterChange('tenantId', value)}>
                <SelectTrigger className="w-[160px]" data-testid="select-filter-tenant">
                  <SelectValue placeholder="Tenant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Articles</SelectItem>
                  <SelectItem value="global">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      Global Only
                    </div>
                  </SelectItem>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        {tenant.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk Actions */}
          {selectedArticles.size > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selectedArticles.size} articles selected
              </span>
              <Separator orientation="vertical" className="h-6" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction('activate')}
                disabled={bulkUpdateMutation.isPending}
                data-testid="button-bulk-activate"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Activate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction('deactivate')}
                disabled={bulkUpdateMutation.isPending}
                data-testid="button-bulk-deactivate"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Deactivate
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Articles Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      paginatedArticles.length > 0 && 
                      paginatedArticles.every(article => selectedArticles.has(article.id))
                    }
                    onCheckedChange={handleSelectAll}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Loading skeletons
                Array.from({ length: pagination.pageSize }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton className="w-4 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-48 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-20 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-16 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-16 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-20 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-8 h-4" /></TableCell>
                  </TableRow>
                ))
              ) : paginatedArticles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="w-12 h-12 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">No articles found</p>
                        <p className="text-sm text-muted-foreground">
                          {Object.values(filters).some(f => f) 
                            ? "Try adjusting your filters or search terms"
                            : "Get started by creating your first article"
                          }
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedArticles.map((article) => (
                  <TableRow 
                    key={article.id} 
                    className="group hover:bg-muted/50"
                    data-testid={`row-article-${article.slug}`}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedArticles.has(article.id)}
                        onCheckedChange={(checked) => handleSelectArticle(article.id, !!checked)}
                        data-testid={`checkbox-article-${article.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium text-foreground line-clamp-2">
                          {article.title}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Hash className="w-3 h-3" />
                          {article.slug}
                          {article.tags && article.tags.length > 0 && (
                            <>
                              <Separator orientation="vertical" className="h-3" />
                              <Tag className="w-3 h-3" />
                              {article.tags.slice(0, 2).join(", ")}
                              {article.tags.length > 2 && ` +${article.tags.length - 2} more`}
                            </>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs", getCategoryColor(article.category))}>
                        {getCategoryLabel(article.category)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={article.isActive ? "outline" : "secondary"}
                        className={cn(
                          "text-xs",
                          article.isActive 
                            ? "text-green-600 border-green-200 bg-green-50" 
                            : "text-gray-600 border-gray-200 bg-gray-50"
                        )}
                      >
                        {article.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs">
                        {article.tenantId ? (
                          <>
                            <Building className="w-3 h-3 text-blue-600" />
                            <span className="text-blue-600">Tenant</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-3 h-3 text-green-600" />
                            <span className="text-green-600">Global</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(article.updatedAt || article.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-8 h-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            data-testid={`button-actions-${article.id}`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {onView && (
                            <DropdownMenuItem onClick={() => onView(article)}>
                              <Eye className="w-4 h-4 mr-2" />
                              View
                            </DropdownMenuItem>
                          )}
                          {onEdit && (
                            <DropdownMenuItem onClick={() => onEdit(article)}>
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => handleDeleteArticle(article)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(startIndex + pagination.pageSize, totalArticles)} of {totalArticles} articles
                </span>
                <Select value={pagination.pageSize.toString()} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="w-[100px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 per page</SelectItem>
                    <SelectItem value="10">10 per page</SelectItem>
                    <SelectItem value="20">20 per page</SelectItem>
                    <SelectItem value="50">50 per page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(1)}
                  disabled={pagination.page === 1}
                  data-testid="button-first-page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                <span className="text-sm font-medium">
                  Page {pagination.page} of {totalPages}
                </span>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={pagination.page === totalPages}
                  data-testid="button-last-page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Article</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "<strong>{deleteDialog.article?.title}</strong>"? 
              This action cannot be undone and the article will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteArticleMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteArticleMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete Article
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog open={bulkAction.open} onOpenChange={(open) => setBulkAction(prev => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction.type === 'activate' ? 'Activate' : 'Deactivate'} Articles
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to {bulkAction.type} {selectedArticles.size} selected articles?
              {bulkAction.type === 'deactivate' && " Deactivated articles will not be visible to users."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkAction}
              disabled={bulkUpdateMutation.isPending}
              data-testid="button-confirm-bulk-action"
            >
              {bulkUpdateMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : bulkAction.type === 'activate' ? (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              {bulkAction.type === 'activate' ? 'Activate' : 'Deactivate'} Articles
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}