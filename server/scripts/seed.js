/**
 * 演示数据脚本：node scripts/seed.js
 * 会清空 tasks 表并写入一组覆盖「待办/进行中/已完成/已逾期/今天到期」的示例任务。
 */
import { db } from '../db/index.js';
import { today, addDays } from '../utils/date.js';

const t = today();

const samples = [
  {
    title: '完成《企业级 AI 软件设计》实践项目 README',
    description: '包含 PRD、技术选型、启动方式与 AI 使用情况说明',
    due_date: addDays(t, -2),
    priority: 'high',
    status: 'done',
  },
  {
    title: '数据库课程第三次实验报告',
    description: '含 ER 图、SQL 脚本与结果截图',
    due_date: addDays(t, -1),
    priority: 'high',
    status: 'doing',
  },
  {
    title: '整理期末答辩 PPT 大纲',
    description: '',
    due_date: t,
    priority: 'high',
    status: 'doing',
  },
  {
    title: '英语六级听力每日训练',
    description: '每天 30 分钟',
    due_date: addDays(t, 3),
    priority: 'medium',
    status: 'pending',
  },
  {
    title: '预约下周体检',
    description: '校医院公众号预约',
    due_date: addDays(t, 7),
    priority: 'low',
    status: 'pending',
  },
  {
    title: '阅读《人月神话》第 3 章并做笔记',
    description: '',
    due_date: addDays(t, 10),
    priority: 'medium',
    status: 'pending',
  },
  {
    title: '提交班级团日活动反馈表',
    description: '辅导员催交',
    due_date: addDays(t, -4),
    priority: 'medium',
    status: 'pending',
  },
];

db.exec('DELETE FROM tasks;');
db.exec("DELETE FROM sqlite_sequence WHERE name = 'tasks';");

const stmt = db.prepare(`
  INSERT INTO tasks (title, description, due_date, priority, status, client_token, created_at, updated_at)
  VALUES (@title, @description, @due_date, @priority, @status, NULL, @created_at, @updated_at)
`);

const iso = new Date().toISOString();
for (const s of samples) {
  stmt.run({ ...s, created_at: iso, updated_at: iso });
}

console.log(`已写入 ${samples.length} 条演示任务（今天 = ${t}）`);
console.log('其中：已逾期 2 条、今天到期 1 条、已完成 1 条。');
