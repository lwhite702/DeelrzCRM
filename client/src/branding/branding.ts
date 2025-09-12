export const BRAND = {
  name: "DeelRxCRM",
  tagline: "High Business. High Quality CRM. Powered by Clouds",
  colors: {
    // Graffiti/Urban theme with neon accents and dark base
    primary: "#00FFFF", // Neon Cyan
    secondary: "#FF6B35", // Neon Orange
    accent: "#FF1493", // Neon Pink
    success: "#39FF14", // Neon Green
    warning: "#FFD700", // Neon Gold
    background: "#0D1117", // Dark GitHub-style background
    backgroundAlt: "#161B22", // Slightly lighter dark
    surface: "#21262D", // Card/surface color
    text: "#F0F6FC", // Light text for dark theme
    textMuted: "#8B949E" // Muted text
  },
  assets: {
    logoMain: "/branding/deelzrxcrm-logo-graffiti.png", // Graffiti logo in public/branding
    logoLight: "/branding/deelzrxcrm-logo-light.svg",
    logoDark: "/branding/deelzrxcrm-logo-dark.svg", 
    favicon: "/branding/favicon.svg"
  },
  typography: {
    primary: "Inter",
    fallback: ["Roboto", "Nunito", "sans-serif"]
  }
} as const;

export type BrandConfig = typeof BRAND;