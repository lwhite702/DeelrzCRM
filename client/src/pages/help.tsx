import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/lib/router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpSearch } from "@/components/help/help-search";
import { KnowledgeBase } from "@/components/help/knowledge-base";
import { useTour } from "@/hooks/use-tour";
import { 
  BookOpen, 
  Search, 
  Star,
  Clock,
  ArrowRight,
  HelpCircle,
  MessageSquare,
  Zap,
  PlayCircle,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KbArticle } from "@shared/schema";

export default function Help() {
  const [location, setLocation] = useLocation();
  const [selectedArticle, setSelectedArticle] = useState<KbArticle | null>(null);
  const [activeTab, setActiveTab] = useState<"search" | "browse">("search");
  
  // Tour management
  const { 
    startTour, 
    resetTour, 
    hasCompletedTour, 
    canResumeTour, 
    resumeTour,
    isLoading 
  } = useTour();

  // Parse URL parameters for deep linking
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const articleSlug = params.get('article');
    const tab = params.get('tab') as "search" | "browse" | null;
    
    if (tab && (tab === "search" || tab === "browse")) {
      setActiveTab(tab);
    }
    
    if (articleSlug) {
      setActiveTab("browse");
    }
  }, [location]);

  // Get recent articles for the featured section
  const { data: recentArticles = [] } = useQuery<KbArticle[]>({
    queryKey: ["/api/help/articles"],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  const featuredArticles = recentArticles
    .filter(article => article.category === 'getting_started')
    .slice(0, 3);

  const recentlyUpdated = recentArticles
    .sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 4);

  const handleArticleSelect = (article: KbArticle | null) => {
    setSelectedArticle(article);
    if (article) {
      // Update URL with article slug
      const newUrl = `/help?tab=browse&article=${article.slug}`;
      setLocation(newUrl);
    } else {
      // Remove article from URL
      setLocation(`/help?tab=${activeTab}`);
    }
  };

  const handleTabChange = (tab: string) => {
    const newTab = tab as "search" | "browse";
    setActiveTab(newTab);
    setSelectedArticle(null);
    setLocation(`/help?tab=${newTab}`);
  };

  const quickAccessItems = [
    {
      title: "Getting Started Guide",
      description: "Learn the basics of using the pharmacy management system",
      icon: <Zap className="w-5 h-5" />,
      category: "getting_started",
      color: "bg-blue-50 text-blue-600 border-blue-200"
    },
    {
      title: "Take Guided Tour",
      description: hasCompletedTour ? "Replay the guided tour to refresh your knowledge" : "Get a step-by-step walkthrough of the system",
      icon: <PlayCircle className="w-5 h-5" />,
      action: canResumeTour ? resumeTour : () => startTour(),
      color: "bg-indigo-50 text-indigo-600 border-indigo-200",
      isSpecial: true
    },
    {
      title: "Inventory Management", 
      description: "How to track and manage your pharmacy inventory",
      icon: <BookOpen className="w-5 h-5" />,
      category: "features",
      color: "bg-green-50 text-green-600 border-green-200"
    },
    {
      title: "Common Issues",
      description: "Solutions to frequently encountered problems",
      icon: <HelpCircle className="w-5 h-5" />,
      category: "troubleshooting", 
      color: "bg-orange-50 text-orange-600 border-orange-200"
    },
    {
      title: "Contact Support",
      description: "Get help from our support team",
      icon: <MessageSquare className="w-5 h-5" />,
      category: "other",
      color: "bg-purple-50 text-purple-600 border-purple-200"
    }
  ];

  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const articleSlug = urlParams.get('article');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-4">
              How can we help you?
            </h1>
            <p className="text-lg text-muted-foreground">
              Search our knowledge base or browse articles to find answers to your questions
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Quick Access Cards - Only show when not viewing an article */}
        {!selectedArticle && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Quick Access</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {quickAccessItems.map((item, index) => (
                <Card 
                  key={index}
                  className={cn(
                    "transition-all hover:shadow-md cursor-pointer group border-2",
                    item.color
                  )}
                  onClick={() => {
                    if (item.action) {
                      item.action();
                    } else if (item.category) {
                      setActiveTab("browse");
                      setLocation(`/help?tab=browse&category=${item.category}`);
                    }
                  }}
                  data-testid={`card-quick-access-${item.category}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground group-hover:text-current transition-colors mb-1">
                          {item.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {item.description}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="search" className="gap-2" data-testid="tab-search">
                  <Search className="w-4 h-4" />
                  Search
                </TabsTrigger>
                <TabsTrigger value="browse" className="gap-2" data-testid="tab-browse">
                  <BookOpen className="w-4 h-4" />
                  Browse Articles
                </TabsTrigger>
              </TabsList>

              <TabsContent value="search" className="mt-0">
                <HelpSearch
                  onArticleSelect={handleArticleSelect}
                  placeholder="What do you need help with?"
                  maxResults={8}
                />
              </TabsContent>

              <TabsContent value="browse" className="mt-0">
                <KnowledgeBase
                  selectedArticleSlug={articleSlug || undefined}
                  onArticleSelect={handleArticleSelect}
                  maxArticlePreview={200}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar - Only show when not viewing an article */}
          {!selectedArticle && (
            <div className="space-y-6">
              {/* Featured Articles */}
              {featuredArticles.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Star className="w-5 h-5 text-yellow-500" />
                      Featured Articles
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {featuredArticles.map((article) => (
                      <div
                        key={article.id}
                        className="p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors group"
                        onClick={() => {
                          setActiveTab("browse");
                          handleArticleSelect(article);
                        }}
                        data-testid={`featured-article-${article.slug}`}
                      >
                        <h4 className="font-medium text-foreground group-hover:text-primary transition-colors text-sm mb-1">
                          {article.title}
                        </h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {article.contentMd.split('\n').find(line => line.trim() && !line.startsWith('#'))?.substring(0, 80)}...
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Recently Updated */}
              {recentlyUpdated.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="w-5 h-5 text-blue-500" />
                      Recently Updated
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {recentlyUpdated.map((article) => (
                      <div
                        key={article.id}
                        className="p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors group"
                        onClick={() => {
                          setActiveTab("browse");
                          handleArticleSelect(article);
                        }}
                        data-testid={`recent-article-${article.slug}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-foreground group-hover:text-primary transition-colors text-sm mb-1 truncate">
                              {article.title}
                            </h4>
                            {article.category && (
                              <Badge variant="outline" className="text-xs">
                                {article.category.replace('_', ' ')}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {article.updatedAt ? new Date(article.updatedAt).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Tour Management */}
              <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 border-indigo-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg text-indigo-700">
                    <PlayCircle className="w-5 h-5" />
                    Guided Tour
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-indigo-600">
                    {hasCompletedTour 
                      ? "You've completed the guided tour! You can replay it anytime to refresh your knowledge."
                      : "Take a step-by-step walkthrough of the pharmacy management system."
                    }
                  </p>
                  
                  <div className="space-y-2">
                    {canResumeTour && (
                      <Button
                        size="sm"
                        className="w-full bg-indigo-600 hover:bg-indigo-700"
                        onClick={resumeTour}
                        disabled={isLoading}
                        data-testid="button-resume-tour"
                      >
                        <PlayCircle className="w-4 h-4 mr-2" />
                        Resume Tour
                      </Button>
                    )}
                    
                    <Button
                      variant={hasCompletedTour ? "outline" : "default"}
                      size="sm"
                      className="w-full"
                      onClick={() => startTour()}
                      disabled={isLoading}
                      data-testid="button-start-tour"
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />
                      {hasCompletedTour ? "Replay Tour" : "Start Tour"}
                    </Button>
                    
                    {hasCompletedTour && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-muted-foreground"
                        onClick={resetTour}
                        disabled={isLoading}
                        data-testid="button-reset-tour"
                      >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reset Tour Progress
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Help & Support */}
              <Card className="bg-muted/50">
                <CardContent className="p-6">
                  <div className="text-center">
                    <MessageSquare className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                    <h3 className="font-medium text-foreground mb-2">Need more help?</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Can't find what you're looking for? Our support team is here to help.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        // This could open a support form, chat, or external link
                        window.open('mailto:support@pharmacy.com?subject=Help Request', '_blank');
                      }}
                      data-testid="button-contact-support"
                    >
                      Contact Support
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}