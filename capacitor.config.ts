import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.duarteentregas.app",
  appName: "Duarte Entregas",
  webDir: "dist",
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#f97316",
      showSpinner: false,
    },
  },
};

export default config;

