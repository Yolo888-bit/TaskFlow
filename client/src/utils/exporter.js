/**
 * 周报导出工具：Markdown / Word(.doc) / 纯文本
 * 全部在浏览器本地生成（Blob + a[download]），不依赖后端，断网也能导出。
 */

const PRIORITY_TEXT = { high: '高', medium: '中', low: '低' };

function safeText(value) {
  return String(value ?? '').replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'));
}

function formatDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 生成文件名前缀：周报_2026-09-28 */
function fileStamp(report) {
  return `周报_${formatDate(report?.generatedAt)}`;
}

/** 统计概览行 */
function statsLine(stats = {}) {
  return `总任务 ${stats.total ?? 0} 条 · 已完成 ${stats.done ?? 0} 条 · 进行中 ${stats.doing ?? 0} 条 · 待办 ${stats.pending ?? 0} 条 · 逾期 ${stats.overdue ?? 0} 条 · 完成率 ${stats.completionRate ?? 0}%`;
}

export function toMarkdown(report) {
  const list = (arr, prefix = '- ') => (arr?.length ? arr.map((x) => `${prefix}${x}`).join('\n') : '-（无）');
  return [
    `# 任务周报（${formatDate(report?.generatedAt)}）`,
    '',
    `> ${statsLine(report?.stats)}`,
    '',
    '## 一、本周总结',
    '',
    report?.summary || '（未生成）',
    '',
    '## 二、亮点',
    '',
    list(report?.highlights),
    '',
    '## 三、风险',
    '',
    list(report?.risks),
    '',
    '## 四、改进建议',
    '',
    list(report?.suggestions),
    '',
    '---',
    '',
    `由 TaskFlow AI 助手于 ${formatDate(report?.generatedAt)} 基于真实任务数据生成`,
  ].join('\n');
}

export function toPlainText(report) {
  const list = (arr) => (arr?.length ? arr.map((x, i) => `  ${i + 1}. ${x}`).join('\n') : '  （无）');
  return [
    `任务周报（${formatDate(report?.generatedAt)}）`,
    statsLine(report?.stats),
    '',
    '【本周总结】',
    report?.summary || '（未生成）',
    '',
    '【亮点】',
    list(report?.highlights),
    '',
    '【风险】',
    list(report?.risks),
    '',
    '【改进建议】',
    list(report?.suggestions),
  ].join('\n');
}

/**
 * Word 文档：输出带 Office 命名空间的 HTML，扩展名用 .doc，
 * Word / WPS 均可用「打开」直接识别并保留标题层级与列表样式。
 */
export function toWordHtml(report) {
  const section = (title, items) => `
  <h2>${safeText(title)}</h2>
  <ul>${(items?.length ? items : ['（无）']).map((x) => `<li>${safeText(x)}</li>`).join('')}</ul>`;

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>任务周报 ${formatDate(report?.generatedAt)}</title>
<!--[if gte mso 9]>
<xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml>
<![endif]-->
<style>
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 11pt; color: #1b201d; line-height: 1.7; }
  h1 { font-size: 18pt; color: #14a874; border-bottom: 1px solid #e8eeea; padding-bottom: 6px; }
  h2 { font-size: 13pt; color: #1b201d; margin-top: 16px; }
  .meta { color: #8d968f; font-size: 10pt; margin: 4px 0 14px; }
  p { margin: 6px 0; }
  ul { margin: 4px 0 12px 0; }
  li { margin: 3px 0; }
  .foot { margin-top: 22px; color: #8d968f; font-size: 9pt; }
</style>
</head>
<body>
  <h1>任务周报</h1>
  <p class="meta">生成日期：${formatDate(report?.generatedAt)}　|　${safeText(statsLine(report?.stats))}</p>
  <h2>一、本周总结</h2>
  <p>${safeText(report?.summary || '（未生成）')}</p>
  ${section('二、亮点', report?.highlights)}
  ${section('三、风险', report?.risks)}
  ${section('四、改进建议', report?.suggestions)}
  <p class="foot">由 TaskFlow AI 助手基于真实任务数据自动生成。</p>
</body>
</html>`;
}

/** 触发浏览器下载 */
export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportMarkdown(report) {
  downloadFile(`${fileStamp(report)}.md`, toMarkdown(report), 'text/markdown');
}

export function exportWord(report) {
  downloadFile(`${fileStamp(report)}.doc`, toWordHtml(report), 'application/msword');
}

export function exportText(report) {
  downloadFile(`${fileStamp(report)}.txt`, toPlainText(report), 'text/plain');
}

export async function copyReport(report) {
  const text = toPlainText(report);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // 剪贴板 API 在非 HTTPS / 无权限时不可用，回退到隐藏 textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export { PRIORITY_TEXT };
