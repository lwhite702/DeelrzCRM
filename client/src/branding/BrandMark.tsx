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
  const isDarkMode = theme === "dark" || (theme === "auto" && document.documentElement.classList.contains("dark"));
  
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
      className={cn("flex flex-col items-start", className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <img
        src={logoSrc}
        alt={BRAND.name}
        width={width}
        height={height}
        className="flex-shrink-0"
      />
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