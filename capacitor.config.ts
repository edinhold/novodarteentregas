import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.a4e828bc291940919fcca644b43c3230",
  appName: "duarteentregas",
  webDir: "dist",
  server: {
    url: "https://a4e828bc-2919-4091-9fcc-a644b43c3230.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
  },
};

export default config;
