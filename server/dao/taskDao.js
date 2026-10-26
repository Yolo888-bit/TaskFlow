import { db } from '../db/index.js';

/**
 * 数据访问层：只负责 SQL，不承载业务规则。
 */

const INSERT_SQL = `
  INSERT INTO tasks (title, description, due_date, priority, status, client_token, created_at, updated_at)
  VALUES (@title, @description, @due_date, @priority, @status, @client_token, @created_at, @updated_at)
`;

export function insertTask(row) {
  const info = db.prepare(INSERT_SQL).run(row);
  return findById(info.lastInsertRowid);
}

/** 按幂等令牌查找，用于重复提交兜底 */
export function findByClientToken(token) {
  if (!token) return null;
  return db.prepare('SELECT * FROM tasks WHERE client_token = ?').get(token) ?? null;
}

export function findById(id) {
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) ?? null;
}

/**
 * 查询列表：筛选 + 搜索 + 排序
 * @param {{status?:string, priority?:string, q?:string, sort?:string, order?:string, today?:string}} opts
 */
export function findAll(opts = {}) {
  const where = [];
  const params = {};

  if (opts.status) {
    where.push('status = @status');
    params.status = opts.status;
  }
  if (opts.priority) {
    where.push('priority = @priority');
    params.priority = opts.priority;
  }
  if (opts.q) {
    where.push('(title LIKE @q OR description LIKE @q)');
    params.q = `%${opts.q}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const dir = String(opts.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  // 已完成任务永远排在最后（"全部"视图下的稳定预期）
  const doneLast = "CASE WHEN status = 'done' THEN 1 ELSE 0 END ASC";

  let orderBySql;
  if (opts.sort === 'smart') {
    // 智能排序：逾期未完成置顶 -> 高优先级优先 -> 截止日近的优先
    params.today = opts.today;
    orderBySql = [
      doneLast,
      "CASE WHEN status <> 'done' AND due_date < @today THEN 0 ELSE 1 END ASC",
      "CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC",
      'due_date ASC',
      'id DESC',
    ].join(', ');
  } else {
    // 优先级排序需要映射成数值：high=3 / medium=2 / low=1
    const orderByMap = {
      due_date: "due_date @dir, CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC, id DESC",
      priority: "CASE priority WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END @dir, due_date ASC, id DESC",
      created_at: 'created_at @dir, id DESC',
    };
    orderBySql = [doneLast, (orderByMap[opts.sort] || orderByMap.created_at).replace('@dir', dir)].join(', ');
  }

  return db
    .prepare(`SELECT * FROM tasks ${whereSql} ORDER BY ${orderBySql}`)
    .all(params);
}

export function updateTask(id, patch) {
  const fields = Object.keys(patch);
  if (fields.length === 0) return findById(id);

  const setSql = fields.map((f) => `${f} = @${f}`).join(', ');
  const info = db
    .prepare(`UPDATE tasks SET ${setSql}, updated_at = @updated_at WHERE id = @id`)
    .run({ ...patch, id, updated_at: new Date().toISOString() });

  if (info.changes === 0) return null;
  return findById(id);
}

export function deleteTask(id) {
  const info = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return info.changes > 0;
}

/** 统计口径：全部、按状态、按优先级、逾期数 */
export function countAll() {
  return db.prepare('SELECT COUNT(*) AS c FROM tasks').get().c;
}

export function countByGroup(column) {
  const allowed = { status: 'status', priority: 'priority' };
  const col = allowed[column];
  if (!col) throw new Error(`unsupported group column: ${column}`);
  return db.prepare(`SELECT ${col} AS key, COUNT(*) AS count FROM tasks GROUP BY ${col}`).all();
}

/** 逾期：未完成且截止日期早于今天 */
export function countOverdue(todayStr) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM tasks WHERE status <> 'done' AND due_date < ?")
    .get(todayStr).c;
}

/** 今天到期（未完成且截止日期 = 今天） */
export function countDueToday(todayStr) {
  return db
    .prepare("SELECT COUNT(*) AS c FROM tasks WHERE status <> 'done' AND due_date = ?")
    .get(todayStr).c;
}

export function findRecentDone(limit = 50) {
  return db
    .prepare("SELECT * FROM tasks WHERE status = 'done' ORDER BY updated_at DESC LIMIT ?")
    .all(limit);
}

export function findOverdueTasks(todayStr) {
  return db
    .prepare("SELECT * FROM tasks WHERE status <> 'done' AND due_date < ? ORDER BY due_date ASC")
    .all(todayStr);
}
