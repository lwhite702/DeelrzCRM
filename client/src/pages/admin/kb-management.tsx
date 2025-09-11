import { useState } from "react";
import { useLocation } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ArticleList } from "@/components/admin/article-list";
import { ArticleForm } from "@/components/admin/article-form";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/contexts/tenant-context";
import { type KbArticle } from "@shared/schema";
import { 
  Plus, 
  ArrowLeft,
  BookOpen,
  FileText,
  AlertCircle,
  Settings,
  Lock,
  Wrench
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "list" | "create" | "edit" | "view";

interface KBManagementState {
  mode: ViewMode;
  selectedArticle?: KbArticle;
}

export default function KBManagement() {
  const [location, setLocation] = useLocation();
  const { user, isSuperAdmin, isLoading } = useAuth();
  
  // State management for different views
  const [state, setState] = useState<KBManagementState>({
    mode: "list"
  });

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto animate-pulse">
                <Settings className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Checking Permissions</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Verifying your access to the Knowledge Base Management interface...
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Security check: Only Super Admins can access this page
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-8 h-8 text-destructive" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Access Denied</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  You need Super Admin privileges to access the Knowledge Base Management interface.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setLocation("/dashboard")}
                className="w-full"
              >
                Return to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Event handlers
  const handleCreateArticle = () => {
    setState({ mode: "create" });
  };

  const handleEditArticle = (article: KbArticle) => {
    setState({ mode: "edit", selectedArticle: article });
  };

  const handleViewArticle = (article: KbArticle) => {
    setState({ mode: "view", selectedArticle: article });
  };

  const handleBackToList = () => {
    setState({ mode: "list", selectedArticle: undefined });
  };

  const handleArticleSuccess = (article: KbArticle) => {
    // After successful create/update, go back to list
    setState({ mode: "list", selectedArticle: undefined });
  };

  // Breadcrumb and page title based on current mode
  const getPageInfo = () => {
    switch (state.mode) {
      case "create":
        return {
          title: "Create New Article",
          breadcrumb: ["Super Admin", "Knowledge Base", "Create Article"],
          description: "Create a new knowledge base article with markdown content"
        };
      case "edit":
        return {
          title: `Edit: ${state.selectedArticle?.title}`,
          breadcrumb: ["Super Admin", "Knowledge Base", "Edit Article"],
          description: "Update the selected knowledge base article"
        };
      case "view":
        return {
          title: `View: ${state.selectedArticle?.title}`,
          breadcrumb: ["Super Admin", "Knowledge Base", "View Article"],
          description: "Preview the knowledge base article"
        };
      default:
        return {
          title: "Knowledge Base Management",
          breadcrumb: ["Super Admin", "Knowledge Base"],
          description: "Manage knowledge base articles, categories, and content"
        };
    }
  };

  const pageInfo = getPageInfo();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {pageInfo.breadcrumb.map((crumb, index) => (
                  <div key={index} className="flex items-center gap-2">
                    {index > 0 && <span>/</span>}
                    <span className={index === pageInfo.breadcrumb.length - 1 ? "text-foreground font-medium" : ""}>
                      {crumb}
                    </span>
                  </div>
                ))}
              </div>

              {/* Page Title */}
              <div className="flex items-center gap-3">
                {state.mode !== "list" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToList}
                    className="gap-2"
                    data-testid="button-back-to-list"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Button>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-foreground">
                      {pageInfo.title}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {pageInfo.description}
                    </p>
                  </div>
                </div>
                
                {/* Super Admin Badge */}
                <Badge variant="outline" className="ml-auto bg-purple-50 text-purple-700 border-purple-200">
                  <Settings className="w-3 h-3 mr-1" />
                  Super Admin
                </Badge>
              </div>
            </div>

            {/* Action Buttons */}
            {state.mode === "list" && (
              <Button
                onClick={handleCreateArticle}
                className="gap-2"
                data-testid="button-create-article"
              >
                <Plus className="w-4 h-4" />
                Create Article
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        {state.mode === "list" && (
          <div className="space-y-6">
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <div className="text-sm text-blue-600 font-medium">Total Articles</div>
                      <div className="text-2xl font-bold text-blue-900">-</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <div className="text-sm text-green-600 font-medium">Published</div>
                      <div className="text-2xl font-bold text-green-900">-</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-orange-50 border-orange-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <div className="text-sm text-orange-600 font-medium">Draft</div>
                      <div className="text-2xl font-bold text-orange-900">-</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-purple-50 border-purple-200">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <Wrench className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <div className="text-sm text-purple-600 font-medium">Categories</div>
                      <div className="text-2xl font-bold text-purple-900">7</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Articles List */}
            <ArticleList
              onEdit={handleEditArticle}
              onView={handleViewArticle}
            />
          </div>
        )}

        {(state.mode === "create" || state.mode === "edit") && (
          <ArticleForm
            article={state.selectedArticle}
            onSuccess={handleArticleSuccess}
            onCancel={handleBackToList}
          />
        )}

        {state.mode === "view" && state.selectedArticle && (
          <div className="space-y-6">
            {/* Article Header */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <CardTitle className="text-2xl">
                      {state.selectedArticle.title}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Slug: {state.selectedArticle.slug}</span>
                      <Separator orientation="vertical" className="h-4" />
                      <Badge 
                        className={cn(
                          "text-xs",
                          state.selectedArticle.category === 'getting_started' ? "bg-blue-100 text-blue-800" :
                          state.selectedArticle.category === 'features' ? "bg-green-100 text-green-800" :
                          state.selectedArticle.category === 'troubleshooting' ? "bg-orange-100 text-orange-800" :
                          state.selectedArticle.category === 'billing' ? "bg-purple-100 text-purple-800" :
                          state.selectedArticle.category === 'api' ? "bg-gray-100 text-gray-800" :
                          state.selectedArticle.category === 'integrations' ? "bg-indigo-100 text-indigo-800" :
                          "bg-slate-100 text-slate-800"
                        )}
                      >
                        {state.selectedArticle.category.replace('_', ' ')}
                      </Badge>
                      <Badge 
                        variant="outline"
                        className={cn(
                          "text-xs",
                          state.selectedArticle.isActive 
                            ? "text-green-600 border-green-200 bg-green-50" 
                            : "text-gray-600 border-gray-200 bg-gray-50"
                        )}
                      >
                        {state.selectedArticle.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    
                    {state.selectedArticle.tags && state.selectedArticle.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {state.selectedArticle.tags.map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => handleEditArticle(state.selectedArticle!)}
                      data-testid="button-edit-from-view"
                    >
                      Edit Article
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Article Content */}
            <Card>
              <CardContent className="p-6">
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ 
                    __html: state.selectedArticle.contentMd
                      .split('\n\n')
                      .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
                      .join('') 
                  }}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}