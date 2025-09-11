import { useState, useRef, useCallback, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { 
  Bold, 
  Italic, 
  Code, 
  Link,
  List,
  ListOrdered,
  Quote,
  Eye,
  Edit,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Upload,
  X,
  Loader2,
  Minus
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  height?: string | number;
  maxHeight?: string | number;
  minHeight?: string | number;
  disabled?: boolean;
  error?: string;
  showPreview?: boolean;
  tenantId?: string;
  articleId?: string;
  enableImageUpload?: boolean;
}

interface ToolbarButton {
  icon: React.ReactNode;
  title: string;
  action: (textarea: HTMLTextAreaElement) => void;
  shortcut?: string;
}

interface UploadedImage {
  filename: string;
  originalName: string;
  url: string;
  size: number;
  mimetype: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your markdown content here...",
  className,
  height = "400px",
  maxHeight,
  minHeight = "200px",
  disabled = false,
  error,
  showPreview = true,
  tenantId,
  articleId,
  enableImageUpload = false
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeView, setActiveView] = useState<"edit" | "preview" | "split">("split");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  const { toast } = useToast();

  // Image upload mutation
  const uploadImagesMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      files.forEach(file => formData.append('images', file));
      
      // Determine upload endpoint based on context
      let uploadUrl = '/api/help/uploads';
      if (tenantId && articleId) {
        uploadUrl = `/api/help/uploads/${tenantId}/${articleId}`;
      } else if (tenantId) {
        uploadUrl = `/api/help/uploads/${tenantId}`;
      }
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
      }
      
      return await response.json();
    },
    onSuccess: (data: { files: UploadedImage[] }) => {
      // Insert uploaded images into markdown
      const textarea = textareaRef.current;
      if (!textarea) return;
      
      const imageMarkdown = data.files
        .map(file => `![${file.originalName}](${file.url})`)
        .join('\n');
      
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = value.substring(0, start) + 
                      (start > 0 && value[start - 1] !== '\n' ? '\n' : '') +
                      imageMarkdown + 
                      (end < value.length && value[end] !== '\n' ? '\n' : '') +
                      value.substring(end);
      
      onChange(newText);
      
      // Update cursor position
      setTimeout(() => {
        const newCursorPos = start + imageMarkdown.length + 2;
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
      
      toast({
        title: "Images uploaded successfully",
        description: `${data.files.length} image(s) uploaded and inserted into the editor.`,
      });
      
      setUploadProgress(null);
      setUploadingFiles([]);
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(null);
      setUploadingFiles([]);
    },
  });

  // File validation
  const validateFiles = (files: File[]): File[] => {
    const validFiles: File[] = [];
    const errors: string[] = [];
    
    for (const file of files) {
      // Check file type
      if (!file.type.startsWith('image/')) {
        errors.push(`${file.name}: Only image files are allowed`);
        continue;
      }
      
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        errors.push(`${file.name}: File size must be less than 5MB`);
        continue;
      }
      
      validFiles.push(file);
    }
    
    if (errors.length > 0) {
      toast({
        title: "Invalid files",
        description: errors.join(', '),
        variant: "destructive",
      });
    }
    
    return validFiles;
  };

  // Handle file selection
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0 || !enableImageUpload) return;
    
    const fileArray = Array.from(files);
    const validFiles = validateFiles(fileArray);
    
    if (validFiles.length > 0) {
      setUploadingFiles(validFiles.map(f => f.name));
      setUploadProgress(0);
      uploadImagesMutation.mutate(validFiles);
    }
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (enableImageUpload && !disabled) {
      setIsDragging(true);
    }
  }, [enableImageUpload, disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (!enableImageUpload || disabled) return;
    
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  }, [enableImageUpload, disabled]);

  // Enhanced image upload action for toolbar
  const handleImageUpload = () => {
    if (!enableImageUpload || disabled) {
      // Fallback to simple markdown insertion
      insertTextAtCursor('![', '](image-url)', 'alt text');
      return;
    }
    
    fileInputRef.current?.click();
  };

  // Configure marked for security and features
  const renderer = useMemo(() => {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
    
    const customRenderer = new marked.Renderer();
    
    // Security: Open external links in new tab  
    customRenderer.link = ({ href, title, tokens }) => {
      const text = tokens?.[0]?.raw || href || '';
      const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
      return `<a href="${href}" ${title ? `title="${title}"` : ''} ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
    };
    
    return customRenderer;
  }, []);

  // Parse markdown safely with sanitization
  const parsedContent = useMemo(() => {
    try {
      const html = marked(value || '', { renderer });
      // Sanitize HTML to prevent XSS attacks
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'p', 'br', 'strong', 'em', 'u', 's',
          'ul', 'ol', 'li',
          'a', 'code', 'pre',
          'blockquote', 'hr',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'del', 'ins', 'img'
        ],
        ALLOWED_ATTR: [
          'href', 'title', 'target', 'rel', 'class',
          'start', 'type', 'src', 'alt', 'width', 'height',
          'loading', 'style'
        ],
        ALLOW_DATA_ATTR: false,
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)|\/)/i
      });
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return '<p class="text-destructive">Error parsing markdown content</p>';
    }
  }, [value, renderer]);

  // Insert text at cursor position
  const insertTextAtCursor = useCallback((before: string, after: string = '', placeholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    const replacement = selectedText || placeholder;
    
    const newText = value.substring(0, start) + before + replacement + after + value.substring(end);
    onChange(newText);
    
    // Set cursor position after insertion
    setTimeout(() => {
      const newCursorPos = start + before.length + replacement.length;
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [value, onChange]);

  // Wrap text around selection
  const wrapSelection = useCallback((wrapper: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);
    
    if (selectedText) {
      const newText = value.substring(0, start) + wrapper + selectedText + wrapper + value.substring(end);
      onChange(newText);
      
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
      }, 0);
    } else {
      insertTextAtCursor(wrapper, wrapper, 'text');
    }
  }, [value, onChange, insertTextAtCursor]);

  // Add line prefix (for headers, lists, etc.)
  const addLinePrefix = useCallback((prefix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', start);
    const actualLineEnd = lineEnd === -1 ? value.length : lineEnd;
    
    const currentLine = value.substring(lineStart, actualLineEnd);
    const newLine = currentLine.startsWith(prefix) 
      ? currentLine.substring(prefix.length)
      : prefix + currentLine;
    
    const newText = value.substring(0, lineStart) + newLine + value.substring(actualLineEnd);
    onChange(newText);
    
    setTimeout(() => {
      textarea.focus();
      const offset = currentLine.startsWith(prefix) ? -prefix.length : prefix.length;
      textarea.setSelectionRange(start + offset, start + offset);
    }, 0);
  }, [value, onChange]);

  // Toolbar buttons configuration
  const toolbarButtons: ToolbarButton[] = [
    {
      icon: <Heading1 className="w-4 h-4" />,
      title: "Heading 1",
      action: () => addLinePrefix('# '),
      shortcut: "Ctrl+1"
    },
    {
      icon: <Heading2 className="w-4 h-4" />,
      title: "Heading 2", 
      action: () => addLinePrefix('## '),
      shortcut: "Ctrl+2"
    },
    {
      icon: <Heading3 className="w-4 h-4" />,
      title: "Heading 3",
      action: () => addLinePrefix('### '),
      shortcut: "Ctrl+3"
    },
    {
      icon: <Bold className="w-4 h-4" />,
      title: "Bold",
      action: () => wrapSelection('**'),
      shortcut: "Ctrl+B"
    },
    {
      icon: <Italic className="w-4 h-4" />,
      title: "Italic",
      action: () => wrapSelection('*'),
      shortcut: "Ctrl+I"
    },
    {
      icon: <Code className="w-4 h-4" />,
      title: "Inline Code",
      action: () => wrapSelection('`'),
      shortcut: "Ctrl+`"
    },
    {
      icon: <Quote className="w-4 h-4" />,
      title: "Quote",
      action: () => addLinePrefix('> ')
    },
    {
      icon: <List className="w-4 h-4" />,
      title: "Bullet List",
      action: () => addLinePrefix('- ')
    },
    {
      icon: <ListOrdered className="w-4 h-4" />,
      title: "Numbered List",
      action: () => addLinePrefix('1. ')
    },
    {
      icon: <Link className="w-4 h-4" />,
      title: "Link",
      action: () => insertTextAtCursor('[', '](url)', 'link text')
    },
    {
      icon: enableImageUpload ? <Upload className="w-4 h-4" /> : <Image className="w-4 h-4" />,
      title: enableImageUpload ? "Upload Image" : "Image",
      action: handleImageUpload
    },
    {
      icon: <Minus className="w-4 h-4" />,
      title: "Horizontal Rule",
      action: () => insertTextAtCursor('\n---\n')
    }
  ];

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;

    const shortcutMap: { [key: string]: () => void } = {
      'b': () => wrapSelection('**'),
      'i': () => wrapSelection('*'),
      '`': () => wrapSelection('`'),
      '1': () => addLinePrefix('# '),
      '2': () => addLinePrefix('## '),
      '3': () => addLinePrefix('### ')
    };

    const action = shortcutMap[e.key.toLowerCase()];
    if (action) {
      e.preventDefault();
      action();
    }
  }, [wrapSelection, addLinePrefix]);

  // Determine view based on screen size and preference
  const effectiveView = useMemo(() => {
    if (!showPreview) return "edit";
    if (isMobile) return activeView === "split" ? "edit" : activeView;
    return activeView;
  }, [activeView, isMobile, showPreview]);

  return (
    <div className={cn("w-full", className)}>
      {/* Mobile Tabs / Desktop View Switcher */}
      {showPreview && (
        <div className="mb-4">
          {isMobile ? (
            <Tabs value={effectiveView} onValueChange={(v) => setActiveView(v as any)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="edit" className="gap-2" data-testid="tab-edit">
                  <Edit className="w-4 h-4" />
                  Edit
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2" data-testid="tab-preview">
                  <Eye className="w-4 h-4" />
                  Preview
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <div className="flex gap-2">
              <Button
                variant={effectiveView === "edit" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveView("edit")}
                className="gap-2"
                data-testid="button-edit-view"
              >
                <Edit className="w-4 h-4" />
                Edit
              </Button>
              <Button
                variant={effectiveView === "preview" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveView("preview")}
                className="gap-2"
                data-testid="button-preview-view"
              >
                <Eye className="w-4 h-4" />
                Preview
              </Button>
              <Button
                variant={effectiveView === "split" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveView("split")}
                className="gap-2"
                data-testid="button-split-view"
              >
                <Type className="w-4 h-4" />
                Split
              </Button>
            </div>
          )}
        </div>
      )}

      <Card className={cn(error && "border-destructive")}>
        {/* Toolbar */}
        {(effectiveView === "edit" || effectiveView === "split") && (
          <div className="border-b bg-muted/50 p-2">
            <div className="flex flex-wrap gap-1">
              {toolbarButtons.map((button, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  title={`${button.title}${button.shortcut ? ` (${button.shortcut})` : ''}`}
                  onClick={() => button.action(textareaRef.current!)}
                  disabled={disabled}
                  data-testid={`button-toolbar-${button.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {button.icon}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Content Area */}
        <div className={cn("flex", effectiveView === "split" && "divide-x")}>
          {/* Editor */}
          {(effectiveView === "edit" || effectiveView === "split") && (
            <div className={cn("flex-1 relative", effectiveView === "split" && "w-1/2")}>
              {/* Drag & Drop Overlay */}
              {enableImageUpload && isDragging && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg">
                  <div className="text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-primary" />
                    <p className="text-sm font-medium text-primary">Drop images here to upload</p>
                  </div>
                </div>
              )}
              
              {/* Upload Progress */}
              {enableImageUpload && uploadProgress !== null && (
                <div className="absolute top-2 left-2 right-2 z-10">
                  <Card className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm font-medium">Uploading images...</span>
                    </div>
                    <Progress value={uploadProgress} className="w-full" />
                    {uploadingFiles.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {uploadingFiles.join(', ')}
                      </div>
                    )}
                  </Card>
                </div>
              )}
              
              <Textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                placeholder={placeholder}
                disabled={disabled}
                className={cn(
                  "min-h-[200px] border-0 resize-none rounded-none font-mono text-sm leading-relaxed focus:ring-0 focus-visible:ring-0",
                  effectiveView === "split" && "rounded-l-lg",
                  enableImageUpload && isDragging && "opacity-50"
                )}
                style={{ 
                  height: typeof height === 'number' ? `${height}px` : height,
                  maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
                  minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight
                }}
                data-testid="textarea-markdown-editor"
              />
            </div>
          )}

          {/* Preview */}
          {(effectiveView === "preview" || effectiveView === "split") && (
            <div className={cn("flex-1", effectiveView === "split" && "w-1/2")}>
              <ScrollArea 
                className="h-full"
                style={{ 
                  height: typeof height === 'number' ? `${height}px` : height,
                  maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
                  minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight
                }}
              >
                <CardContent className="p-4">
                  {value.trim() ? (
                    <div 
                      className="prose prose-sm dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: parsedContent }}
                      data-testid="div-markdown-preview"
                    />
                  ) : (
                    <div className="text-muted-foreground text-sm italic" data-testid="text-preview-placeholder">
                      Nothing to preview yet...
                    </div>
                  )}
                </CardContent>
              </ScrollArea>
            </div>
          )}
        </div>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="mt-2 text-sm text-destructive" data-testid="text-editor-error">
          {error}
        </div>
      )}

      {/* Hidden file input for image uploads */}
      {enableImageUpload && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={(e) => handleFileSelect(e.target.files)}
          className="hidden"
          data-testid="input-image-upload"
        />
      )}

      {/* Help Text */}
      <div className="mt-2 text-xs text-muted-foreground">
        <span>Supports </span>
        <a 
          href="https://www.markdownguide.org/basic-syntax/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          Markdown syntax
        </a>
        <span>. Use Ctrl+B for bold, Ctrl+I for italic, Ctrl+` for code.</span>
        {enableImageUpload && <span> Drag & drop images to upload them instantly.</span>}
      </div>
    </div>
  );
}