import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // 开发模式下把 /api 代理到后端，避免跨域
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // 部分环境下 rmSync 清空目录会被安全删除组件拦截而报错，改为不自动清空
    emptyOutDir: false,
  },
});
