/**
 * 接口封装：统一处理错误，把后端的 { error: { message } } 转成前端可显示的 Error。
 * 开发与生产都走同源 /api（dev 由 Vite 代理到 3000 端口）。
 */
const BASE = import.meta.env.VITE_API_BASE || '/api';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch (e) {
    payload = null;
  }

  if (!res.ok) {
    const message = payload?.error?.message || `请求失败（HTTP ${res.status}）`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return payload;
}

export const api = {
  health: () => request('GET', '/health'),

  listTasks: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) query.set(k, v);
    });
    const qs = query.toString();
    return request('GET', `/tasks${qs ? `?${qs}` : ''}`).then((r) => r.data);
  },

  createTask: (payload) => request('POST', '/tasks', payload).then((r) => r.data),
  bulkCreateTasks: (tasks) => request('POST', '/tasks/bulk', { tasks }).then((r) => r),
  updateTask: (id, payload) => request('PUT', `/tasks/${id}`, payload).then((r) => r.data),
  deleteTask: (id) => request('DELETE', `/tasks/${id}`).then((r) => r.data),
  getStats: () => request('GET', '/stats').then((r) => r.data),

  aiStatus: () => request('GET', '/ai/status').then((r) => r.data),
  aiBreakdown: (goal, startDate) =>
    request('POST', '/ai/breakdown', { goal, startDate }).then((r) => r.data),
  aiWeeklySummary: () => request('POST', '/ai/weekly-summary').then((r) => r.data),
};
