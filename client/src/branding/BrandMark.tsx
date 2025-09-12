import { BRAND } from "./branding";
import { cn } from "@/lib/utils";

interface BrandMarkProps {
  variant?: "logo" | "icon";
  size?: "sm" | "md" | "lg" | "xl";
  showTagline?: boolean;
  className?: string;
  theme?: "light" | "dark" | "auto";
  onClick?: () => void;
}

const sizeMap = {
  sm: { width: 120, height: 24 },
  md: { width: 160, height: 32 },
  lg: { width: 200, height: 40 },
  xl: { width: 280, height: 56 }
};

const iconSizeMap = {
  sm: 24,
  md: 32,
  lg: 40,
  xl: 56
};

export function BrandMark({ 
  variant = "logo", 
  size = "md", 
  showTagline = false, 
  className,
  theme = "auto",
  onClick 
}: BrandMarkProps) {
  // Safe dark mode detection that works during SSR and CSR
  const getDarkMode = () => {
    if (typeof window === "undefined") return false;
    if (theme === "dark") return true;
    if (theme === "light") return false;
    return document.documentElement.classList.contains("dark");
  };

  const isDarkMode = getDarkMode();
  
  if (variant === "icon") {
    const iconSize = iconSizeMap[size];
    return (
      <div 
        className={cn("flex items-center gap-2", className)}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <img
          src={BRAND.assets.favicon}
          alt={`${BRAND.name} icon`}
          width={iconSize}
          height={iconSize}
          className="flex-shrink-0"
          onError={(e) => {
            console.warn("Logo icon failed to load:", BRAND.assets.favicon);
            // Hide the image if it fails to load
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        {showTagline && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">{BRAND.name}</span>
            <span className="text-xs text-muted-foreground">{BRAND.tagline}</span>
          </div>
        )}
      </div>
    );
  }

  const { width, height } = sizeMap[size];
  const logoSrc = isDarkMode ? BRAND.assets.logoDark : BRAND.assets.logoLight;

  return (
    <div 
      className={cn("flex flex-col items-center", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <picture>
        <img
          src={BRAND.assets.logoMain}
          alt={BRAND.name}
          width={width}
          height={height}
          className="flex-shrink-0"
          onError={(e) => {
            console.warn("Logo failed to load:", BRAND.assets.logoMain);
            // Try fallback to themed logos
            (e.target as HTMLImageElement).src = isDarkMode ? BRAND.assets.logoDark : BRAND.assets.logoLight;
          }}
        />
      </picture>
      {showTagline && (
        <p className="mt-1 text-xs text-muted-foreground max-w-[200px]">
          {BRAND.tagline}
        </p>
      )}
    </div>
  );
}

// Export for convenience
export default BrandMark;