import { Router } from 'express';
import * as taskService from '../services/taskService.js';

const router = Router();

/** GET /api/tasks —— 列表（支持状态/优先级筛选、排序、关键词搜索） */
router.get('/', (req, res) => {
  const tasks = taskService.listTasks(req.query);
  res.json({ data: tasks, total: tasks.length });
});

/** GET /api/tasks/:id —— 详情 */
router.get('/:id', (req, res) => {
  res.json({ data: taskService.getTask(Number(req.params.id)) });
});

/** POST /api/tasks —— 新建（支持 client_token 幂等） */
router.post('/', (req, res) => {
  const { task, duplicated } = taskService.createTask(req.body || {});
  res.status(duplicated ? 200 : 201).json({ data: task, duplicated });
});

/** POST /api/tasks/bulk —— 批量创建（AI 拆解结果一键落库，带幂等令牌） */
router.post('/bulk', (req, res) => {
  const { tasks, duplicated } = taskService.bulkCreateTasks(req.body || {});
  res.status(201).json({ data: tasks, total: tasks.length, duplicated });
});

/** PUT /api/tasks/:id —— 更新（含状态流转） */
router.put('/:id', (req, res) => {
  res.json({ data: taskService.updateTask(Number(req.params.id), req.body || {}) });
});

/** DELETE /api/tasks/:id —— 删除 */
router.delete('/:id', (req, res) => {
  res.json({ data: taskService.removeTask(Number(req.params.id)) });
});

export default router;
