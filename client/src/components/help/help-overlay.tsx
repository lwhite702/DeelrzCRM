import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { useTour } from "@/hooks/use-tour";
import { useLocation } from "@/lib/router";
import { 
  Search, 
  BookOpen, 
  ArrowRight, 
  PlayCircle, 
  MessageSquare,
  Zap,
  HelpCircle,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KbArticle } from "@shared/schema";

interface HelpOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
  { value: "getting_started", label: "Getting Started", icon: "🚀" },
  { value: "features", label: "Features", icon: "⭐" },
  { value: "troubleshooting", label: "Troubleshooting", icon: "🔧" },
  { value: "billing", label: "Billing", icon: "💳" },
  { value: "api", label: "API", icon: "⚡" },
  { value: "integrations", label: "Integrations", icon: "🔗" },
  { value: "other", label: "Other", icon: "📚" },
];

const QUICK_LINKS = [
  {
    title: "Getting Started Guide",
    description: "Learn the basics of using the pharmacy management system",
    icon: <Zap className="w-5 h-5" />,
    category: "getting_started"
  },
  {
    title: "Inventory Management", 
    description: "How to track and manage your pharmacy inventory",
    icon: <BookOpen className="w-5 h-5" />,
    category: "features"
  },
  {
    title: "Common Issues",
    description: "Solutions to frequently encountered problems",
    icon: <HelpCircle className="w-5 h-5" />,
    category: "troubleshooting"
  }
];

export function HelpOverlay({ open, onOpenChange }: HelpOverlayProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { startTour, hasCompletedTour } = useTour();

  // Debounce search input for better performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Search articles query
  const { data: articles = [], isLoading } = useQuery<KbArticle[]>({
    queryKey: ["/api/help/articles", { search: debouncedSearchTerm || undefined }],
    enabled: debouncedSearchTerm.length >= 2,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Get featured articles for the quick access section
  const { data: featuredArticles = [] } = useQuery<KbArticle[]>({
    queryKey: ["/api/help/articles"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const recentArticles = featuredArticles
    .filter(article => article.category === 'getting_started')
    .slice(0, 3);

  const handleArticleClick = useCallback((article: KbArticle) => {
    onOpenChange(false);
    setLocation(`/help?tab=browse&article=${article.slug}`);
  }, [onOpenChange, setLocation]);

  const handleCategoryClick = useCallback((category: string) => {
    onOpenChange(false);
    setLocation(`/help?tab=browse&category=${category}`);
  }, [onOpenChange, setLocation]);

  const handleGuidedTour = useCallback(() => {
    onOpenChange(false);
    startTour();
    toast({
      title: "Guided Tour Started",
      description: "Follow the interactive walkthrough to learn the system!",
    });
  }, [onOpenChange, startTour, toast]);

  const handleGoToHelp = useCallback(() => {
    onOpenChange(false);
    setLocation("/help");
  }, [onOpenChange, setLocation]);

  const handleContactSupport = useCallback(() => {
    window.open('mailto:support@pharmacy.com?subject=Help Request', '_blank');
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (open && e.key === "Escape") {
        onOpenChange(false);
      }
    };

    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [open, onOpenChange]);

  // Clear search when overlay closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
    }
  }, [open]);

  const hasSearchResults = debouncedSearchTerm.length >= 2;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" data-testid="dialog-help-overlay">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            How can we help you?
          </DialogTitle>
          <DialogDescription>
            Search our knowledge base or explore help topics
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search help articles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              data-testid="input-help-overlay-search"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Search Results */}
            {hasSearchResults && (
              <div className="space-y-3">
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Card key={i}>
                        <CardContent className="p-4">
                          <Skeleton className="h-5 w-3/4 mb-2" />
                          <Skeleton className="h-4 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : articles.length > 0 ? (
                  <>
                    <div className="text-sm text-muted-foreground">
                      Found {articles.length} result{articles.length === 1 ? '' : 's'}
                    </div>
                    {articles.slice(0, 5).map((article) => (
                      <Card 
                        key={article.id}
                        className="transition-all hover:shadow-sm cursor-pointer group"
                        onClick={() => handleArticleClick(article)}
                        data-testid={`card-search-result-${article.slug}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                                  {article.title}
                                </h4>
                                {article.category && (
                                  <Badge variant="outline" className="text-xs flex-shrink-0">
                                    {CATEGORIES.find(c => c.value === article.category)?.label || article.category}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {article.contentMd
                                  .split('\n')
                                  .find(line => line.trim() && !line.startsWith('#'))
                                  ?.substring(0, 120)}...
                              </p>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </>
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <BookOpen className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                      <p className="text-sm text-muted-foreground">No articles found matching your search.</p>
                      <p className="text-xs text-muted-foreground mt-1">Try different keywords or browse categories below.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Default Content - Quick Access */}
            {!hasSearchResults && (
              <div className="space-y-6">
                {/* Quick Actions */}
                <div>
                  <h3 className="font-medium text-foreground mb-3">Quick Actions</h3>
                  <div className="space-y-2">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 h-auto p-3"
                      onClick={handleGuidedTour}
                      data-testid="button-start-guided-tour"
                    >
                      <PlayCircle className="w-5 h-5 text-indigo-500" />
                      <div className="text-left">
                        <div className="font-medium">
                          {hasCompletedTour ? "Replay Guided Tour" : "Take Guided Tour"}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Interactive walkthrough of the system
                        </div>
                      </div>
                    </Button>
                    
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 h-auto p-3"
                      onClick={handleGoToHelp}
                      data-testid="button-go-to-help"
                    >
                      <BookOpen className="w-5 h-5 text-blue-500" />
                      <div className="text-left">
                        <div className="font-medium">Browse Knowledge Base</div>
                        <div className="text-sm text-muted-foreground">
                          View all help articles and documentation
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground ml-auto" />
                    </Button>
                    
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3 h-auto p-3"
                      onClick={handleContactSupport}
                      data-testid="button-contact-support-overlay"
                    >
                      <MessageSquare className="w-5 h-5 text-green-500" />
                      <div className="text-left">
                        <div className="font-medium">Contact Support</div>
                        <div className="text-sm text-muted-foreground">
                          Get help from our support team
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground ml-auto" />
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Popular Topics */}
                <div>
                  <h3 className="font-medium text-foreground mb-3">Popular Topics</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {QUICK_LINKS.map((link, index) => (
                      <Button
                        key={index}
                        variant="ghost"
                        className="w-full justify-start gap-3 h-auto p-3 text-left"
                        onClick={() => handleCategoryClick(link.category)}
                        data-testid={`button-quick-topic-${link.category}`}
                      >
                        {link.icon}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{link.title}</div>
                          <div className="text-sm text-muted-foreground truncate">
                            {link.description}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Recently Added Articles */}
                {recentArticles.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-medium text-foreground mb-3">Recently Added</h3>
                      <div className="space-y-2">
                        {recentArticles.map((article) => (
                          <Button
                            key={article.id}
                            variant="ghost"
                            className="w-full justify-start gap-3 h-auto p-3 text-left"
                            onClick={() => handleArticleClick(article)}
                            data-testid={`button-recent-article-${article.slug}`}
                          >
                            <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{article.title}</div>
                              <div className="text-sm text-muted-foreground truncate">
                                {article.contentMd
                                  .split('\n')
                                  .find(line => line.trim() && !line.startsWith('#'))
                                  ?.substring(0, 80)}...
                              </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          </Button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Browse Categories */}
                <div>
                  <h3 className="font-medium text-foreground mb-3">Browse by Category</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {CATEGORIES.slice(0, 6).map((category) => (
                      <Button
                        key={category.value}
                        variant="outline"
                        size="sm"
                        className="justify-start gap-2"
                        onClick={() => handleCategoryClick(category.value)}
                        data-testid={`button-category-${category.value}`}
                      >
                        <span>{category.icon}</span>
                        {category.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}