import { db } from '../db/index.js';
import { getStats } from './statsService.js';
import * as dao from '../dao/taskDao.js';
import { today, addDays } from '../utils/date.js';
import { badRequest, upstreamError } from '../middleware/errorHandler.js';

/**
 * AI 扩展服务（AI-01 任务拆解 / AI-02 周报总结）
 *
 * 支持两种网关协议，按 Base URL 自动识别（也可用 AI_PROTOCOL 显式指定）：
 *   1) Anthropic Messages 协议：{baseUrl}/v1/messages，鉴权头 x-api-key，system 为顶层字段
 *   2) OpenAI 兼容协议：{baseUrl}/chat/completions，鉴权头 Authorization: Bearer
 *
 * 两条链路都带 1 次传输重试 + 1 次 JSON 纠错重试；
 * 未配置网关或调用失败时抛出 502，由路由层降级为友好提示，绝不影响核心任务功能。
 */

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_MAX_TOKENS = 2048;

function aiConfig() {
  const baseUrl = (process.env.AI_BASE_URL || '').replace(/\/+$/, '');
  const explicit = String(process.env.AI_PROTOCOL || '').trim().toLowerCase();
  const protocol =
    explicit === 'anthropic' || explicit === 'openai'
      ? explicit
      : /\/anthropic(\/|$)/i.test(baseUrl)
        ? 'anthropic'
        : 'openai';

  return {
    baseUrl,
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || '',
    protocol,
  };
}

/** 当前生效的协议，供 /api/ai/status 展示 */
export function aiProtocol() {
  return aiConfig().protocol;
}

export function isAiEnabled() {
  const { baseUrl, apiKey, model } = aiConfig();
  return Boolean(baseUrl && apiKey && model);
}

function logAiCall(action, payload, result, success) {
  try {
    db.prepare(
      `INSERT INTO ai_logs (action, payload, result, success, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(action, payload, result, success ? 1 : 0, new Date().toISOString());
  } catch (e) {
    console.warn('[AI] 写入调用日志失败:', e.message);
  }
}

/** 统一的 HTTP 调用：首次调用 + 1 次重试 */
async function postJson(url, headers, body) {
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AI 网关返回 ${res.status}: ${text.slice(0, 300)}`);
      }

      const data = await res.json();
      clearTimeout(timer);
      return data;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt === 0) {
        console.warn('[AI] 首次调用失败，准备重试:', err.message);
      }
    }
  }

  throw upstreamError(`AI 服务调用失败：${lastError?.message || '未知错误'}`);
}

/**
 * 发起一次对话，返回纯文本回复（自动适配协议）
 * @param {Array<{role:string, content:string}>} messages
 */
async function callChat(messages, { temperature = 0.3, maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const { baseUrl, apiKey, model, protocol } = aiConfig();
  if (!isAiEnabled()) {
    throw upstreamError('未配置 AI 网关（AI_BASE_URL / AI_API_KEY / AI_MODEL），AI 扩展功能不可用');
  }

  if (protocol === 'anthropic') {
    // Anthropic Messages API：system 是顶层字段，不参与 messages 数组
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const chatMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));

    const body = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: chatMessages.length ? chatMessages : [{ role: 'user', content: '你好' }],
    };
    if (systemParts.length) body.system = systemParts.join('\n\n');

    const data = await postJson(`${baseUrl}/v1/messages`, {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      Authorization: `Bearer ${apiKey}`,
    }, body);

    const content = Array.isArray(data?.content)
      ? data.content
          .filter((block) => block?.type === 'text')
          .map((block) => block.text ?? '')
          .join('')
      : '';
    if (content.trim() === '') throw new Error('AI 返回内容为空');
    return content;
  }

  // OpenAI 兼容协议
  const data = await postJson(`${baseUrl}/chat/completions`, {
    Authorization: `Bearer ${apiKey}`,
  }, {
    model,
    messages,
    temperature,
    stream: false,
  });

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('AI 返回内容为空');
  }
  return content;
}

/** 从模型输出中稳健地解析出 JSON：兼容代码块包裹、前后多余文字、末尾注释 */
function parseJsonSafely(raw) {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    /* 继续尝试截取 */
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (e) {
      /* 落到下面统一报错 */
    }
  }

  throw upstreamError('AI 返回内容不是合法 JSON，请重试');
}

/**
 * 调用模型并解析 JSON；解析失败时带上错误样本再问一次（纠错重试）
 */
async function callJson(messages, options = {}) {
  const raw = await callChat(messages, options);
  try {
    return parseJsonSafely(raw);
  } catch (firstErr) {
    console.warn('[AI] JSON 解析失败，发起纠错重试:', firstErr.message);
    const repaired = await callChat(
      [
        ...messages,
        { role: 'assistant', content: raw.slice(0, 1500) },
        {
          role: 'user',
          content:
            '上一条回复不是合法 JSON。请严格只输出一个 JSON 对象，不要使用 Markdown 代码块，不要有任何解释文字。',
        },
      ],
      options
    );
    return parseJsonSafely(repaired);
  }
}

const VALID_PRIORITY = ['high', 'medium', 'low'];

/**
 * AI-01：把一句复杂目标拆解成结构化子任务
 * @param {string} goal 用户目标描述
 * @param {string} [startDate] 起始日期，默认今天
 */
export async function breakdownTask(goal, startDate) {
  const text = String(goal ?? '').trim();
  if (!text) throw badRequest('请先输入要拆解的目标');
  if (text.length > 300) throw badRequest('目标描述过长（最多 300 字）');

  const start = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : today();

  const systemPrompt = [
    '你是一个任务规划助手，负责把一个复杂目标拆解成可执行的子任务。',
    '只输出 JSON，不要输出任何解释文字。',
    'JSON 结构：{"subtasks":[{"title":"子任务标题","due_date":"YYYY-MM-DD","priority":"high|medium|low","estimate":"预计耗时"}]}',
    `约束：子任务 3~8 个；按依赖顺序排列；due_date 从 ${start} 开始往后递增，不要早于 ${start}；标题简洁不超过 20 个汉字；priority 只能是 high/medium/low。`,
  ].join('\n');

  const parsed = await callJson([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `请拆解这个目标：${text}` },
  ], { temperature: 0.4 });

  const list = Array.isArray(parsed?.subtasks) ? parsed.subtasks : [];

  const subtasks = list
    .slice(0, 10)
    .map((item) => ({
      title: String(item?.title ?? '').trim().slice(0, 100),
      due_date: /^\d{4}-\d{2}-\d{2}$/.test(item?.due_date) ? item.due_date : addDays(start, 3),
      priority: VALID_PRIORITY.includes(item?.priority) ? item.priority : 'medium',
      estimate: String(item?.estimate ?? '').trim().slice(0, 50),
    }))
    .filter((item) => item.title.length > 0);

  if (subtasks.length === 0) {
    throw upstreamError('AI 未生成有效的子任务，请换一种描述后重试');
  }

  logAiCall('breakdown', text, JSON.stringify(subtasks).slice(0, 2000), true);
  return { subtasks, startDate: start };
}

/**
 * AI-02：基于真实任务数据生成本周完成情况总结
 */
export async function weeklySummary() {
  const stats = getStats();
  const t = today();
  const doneTasks = dao.findRecentDone(30).slice(0, 15);
  const overdueTasks = dao.findOverdueTasks(t).slice(0, 15);

  // 近 7 天新增的任务：让周报能说清「本周新加了什么」，避免只谈存量
  const weekAgo = addDays(t, -7);
  const createdThisWeek = dao
    .findAll({ sort: 'created_at', order: 'desc' })
    .filter((x) => String(x.created_at).slice(0, 10) >= weekAgo);

  const digest = {
    统计日期: t,
    总任务数: stats.total,
    已完成: stats.done,
    进行中: stats.doing,
    待办: stats.pending,
    逾期: stats.overdue,
    完成率: `${stats.completionRate}%`,
    近7天新增: createdThisWeek.length,
    本周完成示例: doneTasks.map((x) => `${x.title}（${x.updated_at.slice(0, 10)} 完成）`),
    新增清单: createdThisWeek.slice(0, 15).map((x) => `${x.title}（${x.status} / 截止 ${x.due_date}）`),
    逾期清单: overdueTasks.map((x) => `${x.title}（截止 ${x.due_date}）`),
  };

  const systemPrompt = [
    '你是一位个人效率复盘教练，基于用户提供的任务数据做周报总结。',
    '只输出 JSON，不要输出任何解释文字。',
    'JSON 结构：{"summary":"一段 120~200 字的本周总结","highlights":["亮点1","亮点2"],"risks":["风险1"],"suggestions":["建议1","建议2"]}',
    '语气务实、具体，避免空话套话；引用真实数据，不要编造任务。',
  ].join('\n');

  const parsed = await callJson([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `这是我的任务数据：\n${JSON.stringify(digest, null, 2)}` },
  ], { temperature: 0.5 });

  const result = {
    summary: String(parsed?.summary ?? '').trim(),
    highlights: toStringArray(parsed?.highlights),
    risks: toStringArray(parsed?.risks),
    suggestions: toStringArray(parsed?.suggestions),
    stats,
    generatedAt: new Date().toISOString(),
  };

  logAiCall('weekly-summary', JSON.stringify(digest).slice(0, 2000), result.summary.slice(0, 1000), true);
  return result;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
}
