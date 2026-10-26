import * as dao from '../dao/taskDao.js';
import { today } from '../utils/date.js';
import { STATUSES, PRIORITIES } from './taskService.js';

/**
 * 统计服务（R-02 / R-04）：
 * 完成率 = 已完成 / 全部任务；任何增删改后前端重新调用本接口即可拿到最新结果。
 */
export function getStats() {
  const t = today();
  const total = dao.countAll();
  const overdue = dao.countOverdue(t);
  const dueToday = dao.countDueToday(t);

  const statusRows = dao.countByGroup('status');
  const priorityRows = dao.countByGroup('priority');

  const statusMap = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of statusRows) {
    if (row.key in statusMap) statusMap[row.key] = row.count;
  }

  const priorityMap = Object.fromEntries(PRIORITIES.map((p) => [p, 0]));
  for (const row of priorityRows) {
    if (row.key in priorityMap) priorityMap[row.key] = row.count;
  }

  const done = statusMap.done;
  const completionRate = total === 0 ? 0 : Math.round((done / total) * 1000) / 10; // 保留一位小数

  return {
    today: t,
    total,
    done,
    doing: statusMap.doing,
    pending: statusMap.pending,
    overdue,
    dueToday,
    completionRate,
    statusDistribution: statusMap,
    priorityDistribution: priorityMap,
    updatedAt: new Date().toISOString(),
  };
}
