import { Router } from 'express';
import { breakdownTask, weeklySummary, isAiEnabled, aiProtocol } from '../services/aiService.js';
import { badRequest } from '../middleware/errorHandler.js';

const router = Router();

/** GET /api/ai/status —— 前端据此决定是否展示 AI 入口 */
router.get('/status', (req, res) => {
  res.json({ data: { enabled: isAiEnabled(), protocol: aiProtocol() } });
});

/** POST /api/ai/breakdown —— AI 拆解复杂任务 */
router.post('/breakdown', async (req, res, next) => {
  try {
    const { goal, startDate } = req.body || {};
    if (!goal || String(goal).trim() === '') throw badRequest('请先输入要拆解的目标');
    res.json({ data: await breakdownTask(goal, startDate) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/ai/weekly-summary —— AI 周报总结 */
router.post('/weekly-summary', async (req, res, next) => {
  try {
    res.json({ data: await weeklySummary() });
  } catch (err) {
    next(err);
  }
});

export default router;
