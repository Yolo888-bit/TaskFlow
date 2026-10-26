/**
 * 接口自动化测试： node --test tests/
 * 会临时拉起一个独立端口、独立数据库的服务实例，跑完自动关闭，不污染演示数据。
 */
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, '..', 'index.js');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TMP_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-test-')), 'test.db');

let child;

const req = async (method, urlPath, body) => {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
};

const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const shift = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

before(async () => {
  // 显式清空 AI 配置：测试环境不依赖真实网关，AI 相关用例走「未配置降级」分支
  child = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: TMP_DB,
      AI_BASE_URL: '',
      AI_API_KEY: '',
      AI_MODEL: '',
    },
    stdio: 'ignore',
  });
  // 等待服务就绪
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch (e) {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('测试服务启动超时');
});

after(() => {
  if (child) child.kill();
});

describe('健康检查与统计', () => {
  test('GET /api/health 返回 ok', async () => {
    const { status, body } = await req('GET', '/health');
    assert.equal(status, 200);
    assert.equal(body.data.status, 'ok');
  });

  test('GET /api/stats 空库时完成率为 0', async () => {
    const { status, body } = await req('GET', '/stats');
    assert.equal(status, 200);
    assert.equal(body.data.total, 0);
    assert.equal(body.data.completionRate, 0);
  });
});

describe('任务创建与校验（异常场景）', () => {
  test('空标题 -> 400', async () => {
    const { status, body } = await req('POST', '/tasks', { title: '   ', due_date: shift(1) });
    assert.equal(status, 400);
    assert.match(body.error.message, /标题/);
  });

  test('非法日期 -> 400', async () => {
    const { status } = await req('POST', '/tasks', { title: 'x', due_date: '2026-02-30' });
    assert.equal(status, 400);
  });

  test('日期格式错误 -> 400', async () => {
    const { status } = await req('POST', '/tasks', { title: 'x', due_date: '明天' });
    assert.equal(status, 400);
  });

  test('无效优先级 -> 400', async () => {
    const { status } = await req('POST', '/tasks', {
      title: 'x',
      due_date: shift(1),
      priority: 'urgent',
    });
    assert.equal(status, 400);
  });

  test('无效状态 -> 400', async () => {
    const { status } = await req('POST', '/tasks', {
      title: 'x',
      due_date: shift(1),
      status: 'finished',
    });
    assert.equal(status, 400);
  });

  test('合法任务 -> 201 且字段完整', async () => {
    const { status, body } = await req('POST', '/tasks', {
      title: '写单元测试',
      description: '覆盖异常场景',
      due_date: shift(2),
      priority: 'high',
    });
    assert.equal(status, 201);
    assert.equal(body.duplicated, false);
    assert.ok(body.data.id > 0);
    assert.equal(body.data.priority, 'high');
    assert.equal(body.data.status, 'pending');
  });

  test('同一 client_token 重复提交 -> 幂等返回同一条', async () => {
    const token = `token-${Date.now()}`;
    const payload = { title: '幂等测试', due_date: shift(3), client_token: token };
    const first = await req('POST', '/tasks', payload);
    const second = await req('POST', '/tasks', payload);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.duplicated, true);
    assert.equal(first.body.data.id, second.body.data.id);
  });
});

describe('查询：筛选 / 排序 / 搜索', () => {
  test('按状态 + 优先级筛选生效', async () => {
    await req('POST', '/tasks', { title: '筛选A', due_date: shift(5), priority: 'low', status: 'doing' });
    const { status, body } = await req('GET', '/tasks?status=doing&priority=low');
    assert.equal(status, 200);
    assert.ok(body.data.every((t) => t.status === 'doing' && t.priority === 'low'));
    assert.ok(body.data.length >= 1);
  });

  test('关键词搜索命中标题', async () => {
    const { body } = await req('GET', '/tasks?q=筛选A');
    assert.ok(body.data.some((t) => t.title.includes('筛选A')));
  });

  test('按截止日期升序排序', async () => {
    const { body } = await req('GET', '/tasks?sort=due_date&order=asc');
    const dates = body.data.map((t) => t.due_date);
    const sorted = [...dates].sort();
    assert.deepEqual(dates, sorted);
  });

  test('非法筛选参数 -> 400', async () => {
    const { status } = await req('GET', '/tasks?status=unknown');
    assert.equal(status, 400);
  });
});

describe('业务规则：逾期识别与统计联动（R-01 / R-02 / R-04）', () => {
  test('未完成且已过截止日期 -> 标记逾期', async () => {
    const { body } = await req('POST', '/tasks', { title: '逾期任务', due_date: shift(-3) });
    assert.equal(body.data.isOverdue, true);
    assert.ok(body.data.daysUntilDue < 0);
  });

  test('已完成任务即使过期也不算逾期', async () => {
    const { body } = await req('POST', '/tasks', {
      title: '过期但已完成',
      due_date: shift(-5),
      status: 'done',
    });
    assert.equal(body.data.isOverdue, false);
  });

  test('今天到期 -> isDueToday 为真', async () => {
    const { body } = await req('POST', '/tasks', { title: '今天到期', due_date: todayStr() });
    assert.equal(body.data.isDueToday, true);
  });

  test('完成率随状态变更实时更新', async () => {
    const before = await req('GET', '/stats');
    const created = await req('POST', '/tasks', { title: '待完成任务', due_date: shift(4) });
    const mid = await req('GET', '/stats');
    assert.equal(mid.body.data.total, before.body.data.total + 1);

    const updated = await req('PUT', `/tasks/${created.body.data.id}`, { status: 'done' });
    assert.equal(updated.status, 200);

    const after = await req('GET', '/stats');
    assert.equal(after.body.data.done, mid.body.data.done + 1);
    assert.ok(after.body.data.completionRate > mid.body.data.completionRate);
  });

  test('逾期数量在编辑截止日期后变化', async () => {
    const before = await req('GET', '/stats');
    const created = await req('POST', '/tasks', { title: '将变为逾期', due_date: shift(10) });
    await req('PUT', `/tasks/${created.body.data.id}`, { due_date: shift(-1) });
    const after = await req('GET', '/stats');
    assert.equal(after.body.data.overdue, before.body.data.overdue + 1);
  });
});

describe('更新与删除', () => {
  test('部分字段更新成功', async () => {
    const created = await req('POST', '/tasks', { title: '原标题', due_date: shift(6) });
    const { status, body } = await req('PUT', `/tasks/${created.body.data.id}`, {
      title: '新标题',
      priority: 'low',
    });
    assert.equal(status, 200);
    assert.equal(body.data.title, '新标题');
    assert.equal(body.data.priority, 'low');
  });

  test('更新不存在的任务 -> 404', async () => {
    const { status } = await req('PUT', '/tasks/999999', { title: 'x' });
    assert.equal(status, 404);
  });

  test('删除后再删 -> 404', async () => {
    const created = await req('POST', '/tasks', { title: '待删除', due_date: shift(6) });
    const id = created.body.data.id;
    assert.equal((await req('DELETE', `/tasks/${id}`)).status, 200);
    assert.equal((await req('DELETE', `/tasks/${id}`)).status, 404);
  });

  test('非法 ID -> 404', async () => {
    const { status } = await req('GET', '/tasks/abc');
    assert.equal(status, 404);
  });
});

describe('智能排序与筛选联动', () => {
  test('默认排序：逾期置顶 -> 高优先级 -> 已完成置底', async () => {
    await req('POST', '/tasks', { title: '智能-逾期高', due_date: shift(-2), priority: 'high' });
    await req('POST', '/tasks', { title: '智能-普通', due_date: shift(9), priority: 'low' });

    const { body } = await req('GET', '/tasks');
    const data = body.data;

    // 逾期 + 高优先级排在第一位
    assert.equal(data[0].title, '智能-逾期高');

    // 已完成任务之后不允许再出现未完成任务
    let seenDone = false;
    for (const t of data) {
      if (t.status === 'done') seenDone = true;
      else assert.equal(seenDone, false, '已完成任务之后不应出现未完成任务');
    }
    assert.equal(seenDone, true, '测试数据中应包含已完成任务');
  });

  test('状态筛选后列表只包含对应状态', async () => {
    const { body } = await req('GET', '/tasks?status=doing');
    assert.ok(body.data.length >= 1);
    assert.ok(body.data.every((t) => t.status === 'doing'));
  });

  test('优先级筛选后列表只包含对应优先级', async () => {
    const { body } = await req('GET', '/tasks?priority=high');
    assert.ok(body.data.length >= 1);
    assert.ok(body.data.every((t) => t.priority === 'high'));
  });
});

describe('批量创建（AI 子任务一键落库）', () => {
  test('批量创建返回全部任务并计入统计', async () => {
    const before = await req('GET', '/stats');
    const { status, body } = await req('POST', '/tasks/bulk', {
      tasks: [
        { title: '批量-1', due_date: shift(3), priority: 'high' },
        { title: '批量-2', due_date: shift(4), priority: 'low' },
        { title: '批量-3', due_date: shift(5) },
      ],
    });
    assert.equal(status, 201);
    assert.equal(body.data.length, 3);
    // 未传优先级时回落为 medium
    assert.equal(body.data[2].priority, 'medium');

    const after = await req('GET', '/stats');
    assert.equal(after.body.data.total, before.body.data.total + 3);
  });

  test('同一批幂等令牌重复提交不产生重复数据', async () => {
    const token = 'bulk-token-fixed';
    const payload = {
      tasks: [
        { title: '幂等-A', due_date: shift(6), client_token: `${token}#0` },
        { title: '幂等-B', due_date: shift(7), client_token: `${token}#1` },
      ],
    };
    const first = await req('POST', '/tasks/bulk', payload);
    const second = await req('POST', '/tasks/bulk', payload);
    assert.equal(first.body.duplicated, 0);
    assert.equal(second.body.duplicated, 2);
    assert.equal(second.body.data[0].id, first.body.data[0].id);

    // 用「幂等-」精确匹配本用例的两条，避开其他用例中的「幂等测试」
    const { body } = await req('GET', '/tasks?q=幂等-');
    assert.equal(body.data.length, 2);
  });

  test('空数组 / 超过 20 条 / 非法字段 -> 400', async () => {
    assert.equal((await req('POST', '/tasks/bulk', { tasks: [] })).status, 400);
    assert.equal((await req('POST', '/tasks/bulk', {})).status, 400);
    assert.equal(
      (await req('POST', '/tasks/bulk', { tasks: Array.from({ length: 21 }, () => ({ title: 'x', due_date: shift(1) })) })).status,
      400
    );
    assert.equal(
      (await req('POST', '/tasks/bulk', { tasks: [{ title: 'ok', due_date: shift(1) }, { title: 'y', due_date: '2026-02-30' }] })).status,
      400
    );
  });
});

describe('AI 扩展降级', () => {
  test('未配置网关时 breakdown 返回 502，且核心任务接口不受影响', async () => {
    const ai = await req('POST', '/ai/breakdown', { goal: '准备期末答辩' });
    assert.equal(ai.status, 502);
    assert.match(ai.body.error.message, /AI/);

    const list = await req('GET', '/tasks');
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.data));
  });

  test('AI 目标为空 -> 400', async () => {
    const { status } = await req('POST', '/ai/breakdown', { goal: '' });
    assert.equal(status, 400);
  });

  test('未匹配路由 -> 404', async () => {
    const { status } = await req('GET', '/not-exist');
    assert.equal(status, 404);
  });
});
