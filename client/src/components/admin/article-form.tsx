import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { MarkdownEditor } from "./markdown-editor";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { insertKbArticleSchema, type KbArticle, type Tenant } from "@shared/schema";
import { 
  Save, 
  FileText, 
  Tag, 
  Globe,
  Building, 
  AlertCircle,
  Check,
  X,
  Hash,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

// Form schema extending the base schema with additional validation
const articleFormSchema = insertKbArticleSchema.extend({
  title: z.string().min(1, "Title is required").max(255, "Title must be less than 255 characters"),
  slug: z.string().min(1, "Slug is required").max(255, "Slug must be less than 255 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
  contentMd: z.string().min(1, "Content is required"),
  category: z.enum(["getting_started", "features", "troubleshooting", "billing", "api", "integrations", "other"]),
  tags: z.array(z.string()).default([]),
  tenantId: z.string().nullable().default(null),
  isActive: z.boolean().default(true),
});

type ArticleFormData = z.infer<typeof articleFormSchema>;

interface ArticleFormProps {
  article?: KbArticle;
  onSuccess?: (article: KbArticle) => void;
  onCancel?: () => void;
  className?: string;
}

const categoryOptions = [
  { value: "getting_started", label: "Getting Started", color: "bg-blue-100 text-blue-800" },
  { value: "features", label: "Features", color: "bg-green-100 text-green-800" },
  { value: "troubleshooting", label: "Troubleshooting", color: "bg-orange-100 text-orange-800" },
  { value: "billing", label: "Billing", color: "bg-purple-100 text-purple-800" },
  { value: "api", label: "API", color: "bg-gray-100 text-gray-800" },
  { value: "integrations", label: "Integrations", color: "bg-indigo-100 text-indigo-800" },
  { value: "other", label: "Other", color: "bg-slate-100 text-slate-800" }
];

export function ArticleForm({ article, onSuccess, onCancel, className }: ArticleFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugError, setSlugError] = useState<string>("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const isEditMode = !!article;

  // Fetch tenants for super admin to select
  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const form = useForm<ArticleFormData>({
    resolver: zodResolver(articleFormSchema),
    defaultValues: {
      title: article?.title || "",
      slug: article?.slug || "",
      contentMd: article?.contentMd || "",
      category: article?.category || "getting_started",
      tags: article?.tags || [],
      tenantId: article?.tenantId || null,
      isActive: article?.isActive !== false,
    },
  });

  const watchedTitle = form.watch("title");
  const watchedSlug = form.watch("slug");

  // Auto-generate slug from title
  const generateSlug = (title: string): string => {
    return title
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };

  // Update slug when title changes (unless manually edited)
  useEffect(() => {
    if (!slugManuallyEdited && watchedTitle) {
      const newSlug = generateSlug(watchedTitle);
      form.setValue("slug", newSlug, { shouldValidate: false });
    }
  }, [watchedTitle, slugManuallyEdited, form]);

  // Debounced slug validation
  useEffect(() => {
    if (!watchedSlug || watchedSlug === article?.slug) {
      setSlugError("");
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSlugChecking(true);
      setSlugError("");
      
      try {
        const response = await apiRequest("GET", `/api/help/articles/${encodeURIComponent(watchedSlug)}`);
        if (response.ok) {
          // Article exists with this slug
          setSlugError("This slug is already taken");
        }
      } catch (error: any) {
        if (error.message?.includes("404") || error.message?.includes("not found")) {
          // Slug is available
          setSlugError("");
        } else {
          console.error("Error checking slug:", error);
        }
      } finally {
        setSlugChecking(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [watchedSlug, article?.slug]);

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: async (data: ArticleFormData) => {
      const payload = {
        ...data,
        createdBy: user?.id || "",
      };

      if (isEditMode) {
        const res = await apiRequest("PUT", `/api/help/articles/${article.id}`, payload);
        return await res.json();
      } else {
        const res = await apiRequest("POST", "/api/help/articles", payload);
        return await res.json();
      }
    },
    onSuccess: (data) => {
      toast({
        title: `Article ${isEditMode ? 'Updated' : 'Created'}`,
        description: `The article "${data.title}" has been ${isEditMode ? 'updated' : 'created'} successfully.`,
      });
      
      // Invalidate and refetch articles list
      queryClient.invalidateQueries({ queryKey: ["/api/help/articles"] });
      
      onSuccess?.(data);
    },
    onError: (error: any) => {
      console.error("Article save error:", error);
      toast({
        title: `Failed to ${isEditMode ? 'Update' : 'Create'} Article`,
        description: error.message || `There was an error ${isEditMode ? 'updating' : 'creating'} the article.`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ArticleFormData) => {
    if (slugError) {
      toast({
        title: "Invalid Slug",
        description: "Please fix the slug error before saving.",
        variant: "destructive",
      });
      return;
    }
    mutation.mutate(data);
  };

  const handleAddTag = () => {
    const tag = newTag.trim();
    if (!tag || form.getValues("tags").includes(tag)) return;
    
    const currentTags = form.getValues("tags");
    form.setValue("tags", [...currentTags, tag], { shouldValidate: true });
    setNewTag("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = form.getValues("tags");
    form.setValue("tags", currentTags.filter(tag => tag !== tagToRemove), { shouldValidate: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const selectedCategory = categoryOptions.find(cat => cat.value === form.watch("category"));
  const selectedTenant = tenants.find(t => t.id === form.watch("tenantId"));

  return (
    <div className={cn("w-full", className)}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {isEditMode ? "Edit Article" : "Create New Article"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Article Type Selection */}
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  {form.watch("tenantId") ? (
                    <>
                      <Building className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-600">Tenant-Specific Article</span>
                      {selectedTenant && (
                        <Badge variant="outline" className="text-xs">
                          {selectedTenant.name}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <>
                      <Globe className="w-4 h-4 text-green-600" />
                      <span className="text-sm font-medium text-green-600">Global Article</span>
                      <Badge variant="outline" className="text-xs">
                        Available to all tenants
                      </Badge>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Basic Info */}
                <div className="space-y-6">
                  {/* Title */}
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter article title..."
                            {...field}
                            data-testid="input-article-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Slug */}
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Hash className="w-4 h-4" />
                          URL Slug *
                          {slugChecking && <Loader2 className="w-4 h-4 animate-spin" />}
                          {!slugChecking && watchedSlug && !slugError && (
                            <Check className="w-4 h-4 text-green-600" />
                          )}
                          {!slugChecking && slugError && (
                            <X className="w-4 h-4 text-destructive" />
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="article-url-slug"
                            {...field}
                            onChange={(e) => {
                              setSlugManuallyEdited(true);
                              field.onChange(e);
                            }}
                            className={cn(slugError && "border-destructive")}
                            data-testid="input-article-slug"
                          />
                        </FormControl>
                        {slugError && (
                          <div className="text-sm text-destructive">{slugError}</div>
                        )}
                        <FormDescription>
                          Used in the article URL. Only lowercase letters, numbers, and hyphens allowed.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Category */}
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-article-category">
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categoryOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <Badge className={cn("text-xs", option.color)}>
                                    {option.label}
                                  </Badge>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Tenant Selection */}
                  <FormField
                    control={form.control}
                    name="tenantId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tenant (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-article-tenant">
                              <SelectValue placeholder="Select tenant (leave blank for global)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">
                              <div className="flex items-center gap-2">
                                <Globe className="w-4 h-4" />
                                Global Article (All Tenants)
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
                        <FormDescription>
                          Leave blank to make this article available to all tenants
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right Column - Tags and Settings */}
                <div className="space-y-6">
                  {/* Tags */}
                  <div>
                    <FormLabel className="flex items-center gap-2 mb-3">
                      <Tag className="w-4 h-4" />
                      Tags
                    </FormLabel>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Add a tag..."
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          onKeyDown={handleKeyDown}
                          className="flex-1"
                          data-testid="input-add-tag"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddTag}
                          disabled={!newTag.trim()}
                          data-testid="button-add-tag"
                        >
                          Add
                        </Button>
                      </div>
                      {form.watch("tags").length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {form.watch("tags").map((tag, index) => (
                            <Badge
                              key={index}
                              variant="secondary"
                              className="flex items-center gap-1"
                              data-testid={`badge-tag-${tag}`}
                            >
                              {tag}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 hover:bg-transparent"
                                onClick={() => handleRemoveTag(tag)}
                                data-testid={`button-remove-tag-${tag}`}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">
                            Active Status
                          </FormLabel>
                          <FormDescription>
                            {field.value 
                              ? "This article is published and visible to users"
                              : "This article is hidden and not visible to users"
                            }
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-article-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <Separator />

              {/* Content Editor */}
              <div>
                <FormField
                  control={form.control}
                  name="contentMd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content *</FormLabel>
                      <FormControl>
                        <MarkdownEditor
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Write your article content in Markdown format..."
                          height="500px"
                          error={form.formState.errors.contentMd?.message}
                          enableImageUpload={true}
                          tenantId={form.watch("tenantId") || undefined}
                          articleId={article?.id}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4">
                <div className="flex items-center gap-2">
                  {selectedCategory && (
                    <Badge className={cn("text-xs", selectedCategory.color)}>
                      {selectedCategory.label}
                    </Badge>
                  )}
                  {form.watch("isActive") ? (
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-gray-600 border-gray-200 bg-gray-50">
                      Inactive
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2">
                  {onCancel && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                      disabled={mutation.isPending}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={mutation.isPending || slugChecking || !!slugError}
                    className="gap-2"
                    data-testid="button-save"
                  >
                    {mutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {isEditMode ? "Update Article" : "Create Article"}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}