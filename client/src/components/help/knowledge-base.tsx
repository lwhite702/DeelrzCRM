import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { 
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft,
  ThumbsUp, 
  ThumbsDown,
  BookOpen,
  Clock,
  Tag,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { KbArticle } from "@shared/schema";

interface KnowledgeBaseProps {
  className?: string;
  selectedArticleSlug?: string;
  onArticleSelect?: (article: KbArticle | null) => void;
  showBreadcrumbs?: boolean;
  maxArticlePreview?: number;
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

// Secure markdown renderer using marked and DOMPurify
function MarkdownRenderer({ content }: { content: string }) {
  const sanitizedHtml = useMemo(() => {
    try {
      // Configure marked for security and features
      marked.setOptions({
        breaks: true,
        gfm: true,
      });
      
      const renderer = new marked.Renderer();
      
      // Secure link rendering - open external links in new tab
      renderer.link = ({ href, title, tokens }) => {
        const text = tokens?.[0]?.raw || href || '';
        const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
        return `<a href="${href}" ${title ? `title="${title}"` : ''} ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''} class="text-primary hover:underline">${text}</a>`;
      };
      
      // Custom code block styling
      renderer.code = ({ text, lang, escaped }) => {
        return `<pre class="bg-muted p-4 rounded-lg overflow-x-auto mb-4"><code class="text-sm font-mono">${escaped ? text : text}</code></pre>`;
      };
      
      // Custom inline code styling
      renderer.codespan = ({ text }) => {
        return `<code class="bg-muted px-1 py-0.5 rounded text-sm font-mono">${text}</code>`;
      };
      
      // Custom heading styling
      renderer.heading = ({ text, depth }) => {
        const classes = {
          1: 'text-2xl font-bold text-foreground mb-4 mt-6 first:mt-0',
          2: 'text-xl font-semibold text-foreground mb-3 mt-5',
          3: 'text-lg font-medium text-foreground mb-2 mt-4',
          4: 'text-base font-medium text-foreground mb-2 mt-3',
          5: 'text-sm font-medium text-foreground mb-1 mt-2',
          6: 'text-xs font-medium text-foreground mb-1 mt-2',
        };
        return `<h${depth} class="${classes[depth as keyof typeof classes] || ''}">${text}</h${depth}>`;
      };
      
      // Custom list styling
      renderer.list = ({ ordered, start, items }) => {
        const tag = ordered ? 'ol' : 'ul';
        const listClass = ordered ? 'list-decimal list-inside space-y-1 mb-4 text-muted-foreground' : 'list-disc list-inside space-y-1 mb-4 text-muted-foreground';
        const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
        return `<${tag} class="${listClass}"${startAttr}>\n${items}\n</${tag}>\n`;
      };
      
      // Custom paragraph styling
      renderer.paragraph = ({ text }) => {
        return `<p class="text-muted-foreground leading-relaxed mb-4">${text}</p>`;
      };
      
      // Custom image rendering with responsive styling - SECURE (no inline event handlers)
      renderer.image = ({ href, title, text }) => {
        const titleAttr = title ? ` title="${title}"` : '';
        const altText = text || 'Uploaded image';
        
        return `
          <div class="my-6 flex justify-center">
            <div class="max-w-full overflow-hidden rounded-lg border bg-muted/20">
              <img 
                src="${href}" 
                alt="${altText}"${titleAttr}
                loading="lazy"
                class="max-w-full h-auto object-contain transition-opacity duration-200 hover:opacity-90"
                style="max-height: 500px"
              />
              <div class="hidden p-8 text-center text-muted-foreground error-fallback">Image failed to load</div>
            </div>
          </div>
        `;
      };
      
      // Parse markdown with configured renderer
      const html = marked(content || '', { renderer });
      
      // Sanitize HTML to prevent XSS attacks
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'p', 'br', 'strong', 'em', 'u', 's',
          'ul', 'ol', 'li',
          'a', 'code', 'pre',
          'blockquote', 'img', 'div'
        ],
        ALLOWED_ATTR: [
          'href', 'title', 'target', 'rel', 'class',
          'start', 'src', 'alt', 'width', 'height',
          'loading', 'style'
        ],
        ALLOW_DATA_ATTR: false,
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)|\/)/i
      });
    } catch (error) {
      console.error('Markdown rendering error:', error);
      return '<p class="text-destructive">Error rendering content</p>';
    }
  }, [content]);

  return (
    <div 
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
    />
  );
}

export function KnowledgeBase({
  className,
  selectedArticleSlug,
  onArticleSelect,
  showBreadcrumbs = true,
  maxArticlePreview = 150
}: KnowledgeBaseProps) {
  const [currentArticle, setCurrentArticle] = useState<KbArticle | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get articles list
  const { data: articles = [], isLoading: articlesLoading } = useQuery<KbArticle[]>({
    queryKey: ["/api/help/articles", { category: selectedCategory || undefined }],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get specific article if slug is provided
  const { data: articleData, isLoading: articleLoading } = useQuery<KbArticle>({
    queryKey: ["/api/help/articles", selectedArticleSlug],
    enabled: !!selectedArticleSlug,
    staleTime: 10 * 60 * 1000, // 10 minutes
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

  // Update current article when article data changes
  useEffect(() => {
    if (articleData) {
      setCurrentArticle(articleData);
      onArticleSelect?.(articleData);
    }
  }, [articleData, onArticleSelect]);

  const handleArticleClick = (article: KbArticle) => {
    setCurrentArticle(article);
    onArticleSelect?.(article);
  };

  const handleBackToList = () => {
    setCurrentArticle(null);
    onArticleSelect?.(null);
  };

  const handleFeedback = (articleId: string, isHelpful: boolean) => {
    feedbackMutation.mutate({ articleId, isHelpful });
  };

  const getArticlePreview = (content: string) => {
    const text = content
      .replace(/^#+\s+/gm, '') // Remove headers
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/`(.*?)`/g, '$1') // Remove inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // Remove links, keep text
    
    const firstParagraph = text.split('\n').find(line => line.trim());
    return firstParagraph?.substring(0, maxArticlePreview) + 
           (firstParagraph && firstParagraph.length > maxArticlePreview ? '...' : '');
  };

  const groupedArticles = articles.reduce((acc, article) => {
    const category = article.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(article);
    return acc;
  }, {} as Record<string, KbArticle[]>);

  // Single Article View
  if (currentArticle) {
    return (
      <div className={cn("w-full", className)}>
        {showBreadcrumbs && (
          <div className="mb-6">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      handleBackToList();
                    }}
                    className="flex items-center gap-1"
                    data-testid="link-back-to-articles"
                  >
                    <BookOpen className="w-4 h-4" />
                    Knowledge Base
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                {currentArticle.category && (
                  <>
                    <BreadcrumbItem>
                      <BreadcrumbLink href="#">
                        {CATEGORIES.find(c => c.value === currentArticle.category)?.label || currentArticle.category}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </>
                )}
                <BreadcrumbItem>
                  <BreadcrumbPage>{currentArticle.title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        )}

        <div className="space-y-6">
          {/* Article Header */}
          <div className="space-y-4">
            <Button
              variant="ghost"
              onClick={handleBackToList}
              className="mb-4 -ml-2"
              data-testid="button-back-to-list"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to articles
            </Button>

            <div>
              <h1 className="text-3xl font-bold text-foreground mb-4">
                {currentArticle.title}
              </h1>
              
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {currentArticle.category && (
                  <div className="flex items-center gap-1">
                    <span className="text-base">
                      {CATEGORIES.find(c => c.value === currentArticle.category)?.icon}
                    </span>
                    <Badge variant="outline">
                      {CATEGORIES.find(c => c.value === currentArticle.category)?.label || currentArticle.category}
                    </Badge>
                  </div>
                )}
                
                {currentArticle.updatedAt && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Updated {new Date(currentArticle.updatedAt).toLocaleDateString()}
                  </div>
                )}
              </div>

              {currentArticle.tags && currentArticle.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  {currentArticle.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Article Content */}
          {articleLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <MarkdownRenderer content={currentArticle.contentMd} />
          )}

          <Separator />

          {/* Article Feedback */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-foreground mb-1">Was this article helpful?</h3>
                  <p className="text-sm text-muted-foreground">Your feedback helps us improve our documentation.</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-green-50 hover:text-green-600 hover:border-green-200"
                    onClick={() => handleFeedback(currentArticle.id, true)}
                    disabled={feedbackMutation.isPending}
                    data-testid="button-article-helpful-yes"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    Yes
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                    onClick={() => handleFeedback(currentArticle.id, false)}
                    disabled={feedbackMutation.isPending}
                    data-testid="button-article-helpful-no"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    No
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Articles List View
  return (
    <div className={cn("w-full space-y-6", className)}>
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedCategory === "" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedCategory("")}
          data-testid="button-category-all"
        >
          All Categories
        </Button>
        {CATEGORIES.map((category) => (
          <Button
            key={category.value}
            variant={selectedCategory === category.value ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(category.value)}
            className="gap-2"
            data-testid={`button-category-${category.value}`}
          >
            <span>{category.icon}</span>
            {category.label}
          </Button>
        ))}
      </div>

      {/* Loading State */}
      {articlesLoading && (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="space-y-3">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Articles by Category */}
      {!articlesLoading && (
        <div className="space-y-8">
          {Object.entries(groupedArticles).map(([categoryKey, categoryArticles]) => {
            const categoryInfo = CATEGORIES.find(c => c.value === categoryKey);
            const categoryLabel = categoryInfo?.label || categoryKey;
            const categoryIcon = categoryInfo?.icon || '📄';

            return (
              <div key={categoryKey}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">{categoryIcon}</span>
                  <h2 className="text-xl font-semibold text-foreground">{categoryLabel}</h2>
                  <Badge variant="secondary" className="ml-2">
                    {categoryArticles.length}
                  </Badge>
                </div>
                
                <div className="grid gap-4">
                  {categoryArticles.map((article) => (
                    <Card 
                      key={article.id}
                      className="transition-all hover:shadow-md cursor-pointer group"
                      onClick={() => handleArticleClick(article)}
                      data-testid={`card-kb-article-${article.slug}`}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-foreground group-hover:text-primary transition-colors mb-2">
                              {article.title}
                            </h3>
                            
                            {getArticlePreview(article.contentMd) && (
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                {getArticlePreview(article.contentMd)}
                              </p>
                            )}
                            
                            {article.tags && article.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-3">
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
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No Articles */}
      {!articlesLoading && articles.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No articles found</h3>
            <p className="text-muted-foreground">
              {selectedCategory ? 
                `No articles available in the ${CATEGORIES.find(c => c.value === selectedCategory)?.label || selectedCategory} category.` :
                "No articles are currently available in the knowledge base."
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}