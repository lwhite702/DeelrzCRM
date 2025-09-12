export const BRAND = {
  name: "DeelrzCRM",
  tagline: "High Business. High Quality CRM. Powered by Clouds",
  colors: {
    primary: "#4DA6FF", // Cloud Blue
    secondary: "#75BDEB", // Sky Gradient  
    background: "#FFFFFF", // White
    backgroundAlt: "#F9F9F9", // Light Gray
    text: "#333333" // Dark Gray
  },
  assets: {
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