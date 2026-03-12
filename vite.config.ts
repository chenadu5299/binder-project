import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  resolve: {
    alias: {
      // 强制使用本地 tiptap-pagination-plus（含分页遮罩）
      "tiptap-pagination-plus": path.resolve(__dirname, "tiptap-pagination-plus/dist/index.js"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  
  // 禁用 source map 以减少控制台错误
  build: {
    sourcemap: false,
  },
  
  // tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignore: ["**/src-tauri/**"],
    },
  },
}));

