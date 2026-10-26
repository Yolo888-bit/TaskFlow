import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tasksRouter from './routes/tasks.js';
import statsRouter from './routes/stats.js';
import aiRouter from './routes/ai.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { dbPath } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 简易访问日志：方便演示时观察接口调用
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  }
  next();
});

/** 健康检查 */
app.get('/api/health', (req, res) => {
  res.json({
    data: {
      status: 'ok',
      time: new Date().toISOString(),
      aiEnabled: Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && process.env.AI_MODEL),
    },
  });
});

app.use('/api/tasks', tasksRouter);
app.use('/api/stats', statsRouter);
app.use('/api/ai', aiRouter);

// 生产模式：托管前端构建产物（先执行 client/npm run build）
const distDir = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use('/api', notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log('==================================================');
  console.log('  TaskFlow 后端服务已启动');
  console.log(`  接口地址: http://localhost:${PORT}/api`);
  console.log(`  数据库文件: ${dbPath}`);
  if (fs.existsSync(distDir)) {
    console.log(`  前端页面: http://localhost:${PORT}  （已托管 client/dist）`);
  } else {
    console.log('  前端未构建：请在 client 目录执行 npm run dev（默认 http://localhost:5173）');
  }
  console.log('==================================================');
});
