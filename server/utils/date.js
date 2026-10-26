/**
 * 日期工具：一律使用「本地时区」的 YYYY-MM-DD 字符串比较，
 * 避免 UTC 解析导致的跨日误差（例如 2026-09-26 被解析成 UTC 前一天）。
 */

/** 把 Date 格式化成本地时区的 YYYY-MM-DD */
export function formatDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 今天的日期字符串 */
export function today() {
  return formatDate(new Date());
}

/** 在日期字符串上加减天数，返回新的日期字符串 */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

/**
 * 相差天数：due - today
 * 负数表示已过期，0 表示今天到期，正数表示还有 N 天。
 */
export function diffDaysFromToday(dueStr, todayStr = today()) {
  return parseToUtcDay(dueStr) - parseToUtcDay(todayStr);
}

/** 把 YYYY-MM-DD 转成一个可比较的"天序号"，规避时区与夏令时问题 */
function parseToUtcDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** 是否为合法的 YYYY-MM-DD 真实日期（2026-02-30 会被判为非法） */
export function isValidDateStr(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}
