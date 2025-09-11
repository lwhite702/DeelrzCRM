import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { 
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Filter, 
  ThumbsUp, 
  ThumbsDown, 
  ChevronDown,
  ArrowRight,
  BookOpen
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import type { KbArticle } from "@shared/schema";

interface HelpSearchProps {
  className?: string;
  onArticleSelect?: (article: KbArticle) => void;
  defaultCategory?: string;
  placeholder?: string;
  showFilters?: boolean;
  maxResults?: number;
}

const CATEGORIES = [
  { value: "getting_started", label: "Getting Started" },
  { value: "features", label: "Features" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "billing", label: "Billing" },
  { value: "api", label: "API" },
  { value: "integrations", label: "Integrations" },
  { value: "other", label: "Other" },
];

export function HelpSearch({
  className,
  onArticleSelect,
  defaultCategory,
  placeholder = "Search help articles...",
  showFilters = true,
  maxResults = 10
}: HelpSearchProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory || "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<KbArticle | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Debounce search input for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Search articles query
  const { data: articles = [], isLoading, error } = useQuery<KbArticle[]>({
    queryKey: ["/api/help/articles", { 
      search: debouncedSearchTerm || undefined,
      category: selectedCategory || undefined 
    }],
    enabled: debouncedSearchTerm.length >= 2 || selectedCategory !== "",
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Article feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: async ({ articleId, isHelpful }: { articleId: string; isHelpful: boolean }) => {
      await apiRequest("POST", "/api/help/feedback", { articleId, isHelpful });
    },
    onSuccess: () => {
      toast({
        title: "Feedback recorded",
        description: "Thank you for your feedback!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to record feedback. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleArticleClick = useCallback((article: KbArticle) => {
    setSelectedArticle(article);
    onArticleSelect?.(article);
  }, [onArticleSelect]);

  const handleFeedback = useCallback((articleId: string, isHelpful: boolean) => {
    feedbackMutation.mutate({ articleId, isHelpful });
  }, [feedbackMutation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setSelectedArticle(null);
      setSearchTerm("");
    }
  }, []);

  // Extract preview text from markdown
  const getArticlePreview = (content: string) => {
    const firstParagraph = content
      .split('\n')
      .find(line => line.trim() && !line.startsWith('#'));
    return firstParagraph?.substring(0, 120) + (firstParagraph && firstParagraph.length > 120 ? '...' : '');
  };

  const hasActiveFilters = debouncedSearchTerm || selectedCategory;
  const showResults = hasActiveFilters && !isLoading;

  return (
    <div className={cn("w-full space-y-4", className)} onKeyDown={handleKeyDown}>
      {/* Search Input */}
      <div className="relative">
        <Command className="border rounded-lg">
          <CommandInput
            placeholder={placeholder}
            value={searchTerm}
            onValueChange={setSearchTerm}
            className="border-0"
            data-testid="input-help-search"
          />
        </Command>
      </div>

      {/* Filters */}
      {showFilters && (
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              className="w-full sm:w-auto gap-2"
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4" />
              Filters
              {selectedCategory && (
                <Badge variant="secondary" className="ml-1">
                  1
                </Badge>
              )}
              <ChevronDown className={cn(
                "w-4 h-4 transition-transform",
                filtersOpen && "transform rotate-180"
              )} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Category</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger data-testid="select-category-filter">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All categories</SelectItem>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(selectedCategory) && (
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCategory("");
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Loading State */}
      {isLoading && hasActiveFilters && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Failed to search articles. Please try again.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Results */}
      {showResults && articles.length === 0 && !error && (
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-muted-foreground">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No articles found matching your search.</p>
              <p className="text-xs mt-1">Try different keywords or check the spelling.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {showResults && articles.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Found {articles.length} article{articles.length === 1 ? '' : 's'}
          </div>
          {articles.slice(0, maxResults).map((article) => (
            <Card 
              key={article.id} 
              className="transition-all hover:shadow-md cursor-pointer group"
              onClick={() => handleArticleClick(article)}
              data-testid={`card-article-${article.slug}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {article.title}
                      </h3>
                      {article.category && (
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {CATEGORIES.find(c => c.value === article.category)?.label || article.category}
                        </Badge>
                      )}
                    </div>
                    {getArticlePreview(article.contentMd) && (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {getArticlePreview(article.contentMd)}
                      </p>
                    )}
                    
                    {/* Article Tags */}
                    {article.tags && article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {article.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {article.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{article.tags.length - 3} more
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                </div>

                {/* Feedback Buttons */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">Was this helpful?</span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-green-50 hover:text-green-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFeedback(article.id, true);
                      }}
                      disabled={feedbackMutation.isPending}
                      data-testid={`button-feedback-positive-${article.id}`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 hover:bg-red-50 hover:text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFeedback(article.id, false);
                      }}
                      disabled={feedbackMutation.isPending}
                      data-testid={`button-feedback-negative-${article.id}`}
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Prompt to search */}
      {!hasActiveFilters && (
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-muted-foreground">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Start typing to search help articles</p>
              <p className="text-xs mt-1">Or use the filters to browse by category</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}