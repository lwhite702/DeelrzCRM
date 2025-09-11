import { useQuery } from "@tanstack/react-query";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KbArticle } from "@shared/schema";

interface TooltipHelpProps {
  children: React.ReactNode;
  content?: string;
  articleSlug?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  maxWidth?: string;
  showLinkToArticle?: boolean;
  helpCircleSize?: "sm" | "md" | "lg";
}

export function TooltipHelp({
  children,
  content,
  articleSlug,
  side = "top",
  className,
  maxWidth = "max-w-sm",
  showLinkToArticle = true,
  helpCircleSize = "sm"
}: TooltipHelpProps) {
  // Fetch article content if articleSlug is provided
  const { data: article, isLoading, error } = useQuery<KbArticle>({
    queryKey: ["/api/help/articles", articleSlug],
    enabled: !!articleSlug,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const handleLinkClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (articleSlug) {
      window.open(`/help?article=${articleSlug}`, '_blank');
    }
  };

  const renderContent = () => {
    if (articleSlug) {
      if (isLoading) {
        return (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        );
      }

      if (error || !article) {
        return (
          <div className="text-muted-foreground text-sm">
            Failed to load help content.
          </div>
        );
      }

      // Extract first paragraph from markdown content
      const firstParagraph = article.contentMd
        .split('\n')
        .find(line => line.trim() && !line.startsWith('#'))
        ?.substring(0, 150) + (article.contentMd.length > 150 ? '...' : '');

      return (
        <div className="space-y-3">
          <div>
            <div className="font-medium text-foreground text-sm mb-1">
              {article.title}
            </div>
            {article.category && (
              <Badge variant="secondary" className="text-xs mb-2">
                {article.category.replace('_', ' ')}
              </Badge>
            )}
            <p className="text-muted-foreground text-sm leading-relaxed">
              {firstParagraph}
            </p>
          </div>
          {showLinkToArticle && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-primary hover:text-primary/80"
              onClick={handleLinkClick}
              data-testid="button-view-full-article"
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              <span className="text-xs">View full article</span>
            </Button>
          )}
        </div>
      );
    }

    return content || "No help content available.";
  };

  const helpIconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5", 
    lg: "w-6 h-6"
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn("inline-flex items-center gap-1", className)}>
          {children}
          <HelpCircle 
            className={cn(
              "text-muted-foreground hover:text-foreground transition-colors cursor-help",
              helpIconSizes[helpCircleSize]
            )}
            data-testid="icon-help-tooltip"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent 
        side={side} 
        className={cn(
          "p-4 text-left",
          maxWidth
        )}
        data-testid="content-help-tooltip"
      >
        {renderContent()}
      </TooltipContent>
    </Tooltip>
  );
}

// Convenience component for just the help icon without wrapping content
export function HelpIcon({
  content,
  articleSlug,
  side = "top",
  className,
  maxWidth = "max-w-sm",
  size = "sm"
}: Omit<TooltipHelpProps, 'children'> & { size?: "sm" | "md" | "lg" }) {
  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6"
  };

  return (
    <TooltipHelp
      content={content}
      articleSlug={articleSlug}
      side={side}
      className={className}
      maxWidth={maxWidth}
      helpCircleSize={size}
    >
      <span className="sr-only">Help</span>
    </TooltipHelp>
  );
}