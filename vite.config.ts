import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { viteEdgePlugin } from "./src/server/viteEdgePlugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Use absolute base for web (required for SPA nested routes like /admin/login).
  // Only use relative base for Electron/Capacitor builds (set BUILD_TARGET=native).
  base: process.env.BUILD_TARGET === "native" ? "./" : "/",
  server: {
    host: "0.0.0.0",
    port: 3000,
    hmr: process.env.DISABLE_HMR !== "true",
    watch: process.env.DISABLE_HMR === "true" ? null : {},
  },
  plugins: [
    viteEdgePlugin(),
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "pwa-192x192.png", "pwa-512x512.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        globIgnores: ["**/OneSignalSDKWorker.js"],
        navigateFallbackDenylist: [/^\/~oauth/, /^\/OneSignalSDKWorker\.js$/],
      },


      manifest: {
        name: "Duarte Delivery",
        short_name: "Duarte",
        description: "Peça comida e receba na sua porta com o Duarte Delivery",
        theme_color: "#f97316",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      process.env.VITE_SUPABASE_URL &&
      process.env.VITE_SUPABASE_URL.startsWith("http") &&
      !process.env.VITE_SUPABASE_URL.includes("lxgnttjzhqbpmnrpkvjw") &&
      !process.env.VITE_SUPABASE_URL.includes("xnmrbsqhhjtqmgixjalw")
        ? process.env.VITE_SUPABASE_URL
        : "https://qhlunszfcpzsfjjugkus.supabase.co"
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY &&
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY.includes("U-J_S8DnJK5K") &&
      !process.env.VITE_SUPABASE_PUBLISHABLE_KEY.includes("MCZh1FNBp8oYd8iL") &&
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim().length > 0
        ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
        : "sb_publishable_xp0FiNgyQFvsdy9SXeGnSA_iUehC_FO"
    ),
  },
}));
