/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/client" />

declare global {
  interface Window {
    isMedianApp: () => boolean;
  }
}

export {};

