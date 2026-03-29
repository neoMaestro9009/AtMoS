import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,        // we have our own manifest.webmanifest
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB limit
        // Don't cache MediaPipe WASM — too large and changes frequently
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net/,
            handler: "CacheFirst",
            options: {
              cacheName: "mediapipe-cdn",
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 } // 7 days
            }
          }
        ]
      }
    })
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
    https: false,
  },
  build: {
    target: "es2020",
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "motion": ["framer-motion"],
        }
      }
    }
  }
});
