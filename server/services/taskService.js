import crypto from 'node:crypto';
import * as dao from '../dao/taskDao.js';
import { badRequest, notFound } from '../middleware/errorHandler.js';
import { isValidDateStr, today, diffDaysFromToday } from '../utils/date.js';

export const PRIORITIES = ['high', 'medium', 'low'];
export const STATUSES = ['pending', 'doing', 'done'];

/**
 * 业务层：承载业务规则（R-01 ~ R-04）与输入校验。
 */

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value, field, { required = false, max = 500 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${field}不能为空`);
    return undefined;
  }
  if (typeof value !== 'string') throw badRequest(`${field}格式不正确`);
  const text = value.trim();
  if (required && text.length === 0) throw badRequest(`${field}不能为空`);
  if (text.length > max) throw badRequest(`${field}长度不能超过 ${max} 个字符`);
  return text;
}

function normalizeDate(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${field}不能为空`);
    return undefined;
  }
  if (!isValidDateStr(value)) {
    throw badRequest(`${field}格式不合法，应为 YYYY-MM-DD 的真实日期`);
  }
  return value;
}

function normalizeEnum(value, allowed, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${field}不能为空`);
    return undefined;
  }
  if (!allowed.includes(value)) {
    throw badRequest(`${field}取值不合法，可选值：${allowed.join(' / ')}`);
  }
  return value;
}

/** 给任务补上派生字段：是否逾期、距截止天数 */
function decorate(row) {
  if (!row) return null;
  const t = today();
  const diff = diffDaysFromToday(row.due_date, t);
  return {
    ...row,
    isOverdue: row.status !== 'done' && diff < 0,
    isDueToday: row.status !== 'done' && diff === 0,
    daysUntilDue: diff,
  };
}

export function listTasks(query = {}) {
  const opts = {
    status: normalizeEnum(query.status, STATUSES, '状态', {}),
    priority: normalizeEnum(query.priority, PRIORITIES, '优先级', {}),
    q: normalizeText(query.q, '搜索关键词', { max: 100 }),
  };

  // 默认智能排序：逾期置顶 -> 高优先级 -> 截止日近的优先，已完成永远在最后
  const allowedSort = ['smart', 'due_date', 'priority', 'created_at'];
  opts.sort = allowedSort.includes(query.sort) ? query.sort : 'smart';
  opts.order = String(query.order || 'asc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  opts.today = today();

  return dao.findAll(opts).map(decorate);
}

export function getTask(id) {
  const row = dao.findById(id);
  if (!row) throw notFound('任务不存在或已被删除');
  return decorate(row);
}

export function createTask(payload = {}) {
  const title = normalizeText(payload.title, '任务标题', { required: true, max: 100 });
  const description = normalizeText(payload.description ?? '', '任务描述', { max: 1000 }) ?? '';
  const due_date = normalizeDate(payload.due_date, '截止日期', { required: true });
  const priority = normalizeEnum(payload.priority ?? 'medium', PRIORITIES, '优先级', { required: true });
  const status = normalizeEnum(payload.status ?? 'pending', STATUSES, '状态', { required: true });
  const client_token = normalizeText(payload.client_token, '幂等令牌', { max: 64 }) || null;

  // 幂等：同一令牌重复提交时直接返回已创建的任务，避免网络重试 / 用户连点产生重复数据
  if (client_token) {
    const existing = dao.findByClientToken(client_token);
    if (existing) {
      return { task: decorate(existing), duplicated: true };
    }
  }

  const iso = nowIso();
  const row = dao.insertTask({
    title,
    description,
    due_date,
    priority,
    status,
    client_token,
    created_at: iso,
    updated_at: iso,
  });

  return { task: decorate(row), duplicated: false };
}

/**
 * AI-01 配套：批量创建子任务（一次 AI 拆解结果一键落库）
 * 每条自动带幂等令牌，重复提交不会产生重复数据；单条失败不影响已创建的部分。
 */
export function bulkCreateTasks(payload = {}) {
  const list = payload?.tasks ?? payload?.list;
  if (!Array.isArray(list)) throw badRequest('请提供要创建的任务数组');
  if (list.length === 0) throw badRequest('请先勾选要创建的子任务');
  if (list.length > 20) throw badRequest('一次最多创建 20 条任务');

  const batchToken = crypto.randomUUID();
  const created = [];
  let duplicated = 0;

  list.forEach((item, index) => {
    const { task: created_, duplicated: dup } = createTask({
      ...item,
      // 前端未传令牌时按批次 + 序号生成，保证同一批结果重复提交仍幂等
      client_token: item?.client_token || `${batchToken}#${index}`,
    });
    if (dup) duplicated += 1;
    created.push(created_);
  });

  return { tasks: created, duplicated };
}

export function updateTask(id, payload = {}) {
  const existing = dao.findById(id);
  if (!existing) throw notFound('任务不存在或已被删除');

  const patch = {};
  const title = normalizeText(payload.title, '任务标题', { max: 100 });
  if (title !== undefined) patch.title = title;

  const description = normalizeText(payload.description, '任务描述', { max: 1000 });
  if (description !== undefined) patch.description = description;

  const dueDate = normalizeDate(payload.due_date, '截止日期');
  if (dueDate !== undefined) patch.due_date = dueDate;

  const priority = normalizeEnum(payload.priority, PRIORITIES, '优先级');
  if (priority !== undefined) patch.priority = priority;

  const status = normalizeEnum(payload.status, STATUSES, '状态');
  if (status !== undefined) patch.status = status;

  if (Object.keys(patch).length === 0) {
    throw badRequest('没有需要更新的字段');
  }

  const updated = dao.updateTask(id, patch);
  if (!updated) throw notFound('任务不存在或已被删除');
  return decorate(updated);
}

export function removeTask(id) {
  const ok = dao.deleteTask(id);
  if (!ok) throw notFound('任务不存在或已被删除');
  return { id: Number(id) };
}
