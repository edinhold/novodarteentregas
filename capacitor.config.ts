import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.duarteentregas.app",
  appName: "Duarte Delivery",
  webDir: "dist",
  server: {
    url: "https://duarteentregas.vercel.app",
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


