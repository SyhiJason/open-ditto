import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { createOpenDittoApiMiddleware } from "./src/server/apiMiddleware";

function openDittoApiPlugin(apiKey: string | undefined): Plugin {
  const handler = createOpenDittoApiMiddleware(apiKey);

  return {
    name: "open-ditto-api-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handler(req, res, next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiKey = env.MOONSHOT_API_KEY || process.env.MOONSHOT_API_KEY;

  return {
    plugins: [react(), tailwindcss(), openDittoApiPlugin(apiKey)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify-file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
    },
  };
});
