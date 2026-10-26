import { Router } from 'express';
import { getStats } from '../services/statsService.js';

const router = Router();

/** GET /api/stats —— 完成率、状态分布、逾期数量等统计 */
router.get('/', (req, res) => {
  res.json({ data: getStats() });
});

export default router;
