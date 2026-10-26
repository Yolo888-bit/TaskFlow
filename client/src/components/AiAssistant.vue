<script setup>
/**
 * 悬浮 AI 助手：右下角常驻形象按钮 + 弹窗（AI 任务规划 / AI 周报总结）
 * - 任务规划：输入目标 → AI 生成 3~8 条子任务 → 勾选编辑 → 一键批量创建
 * - 周报总结：基于真实任务数据生成总结/亮点/风险/建议 → 导出 Word / Markdown / TXT
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { api } from '../api/index.js';
import { exportWord, exportMarkdown, exportText, copyReport } from '../utils/exporter.js';

const emit = defineEmits(['created', 'notify']);

const enabled = ref(false);
const open = ref(false);
const tab = ref('plan');

// ---------- AI 任务规划 ----------
const goal = ref('');
const startDate = ref(new Date().toISOString().slice(0, 10));
const planning = ref(false);
const creating = ref(false);
const subtasks = ref([]);
const planError = ref('');
let batchId = '';

const EXAMPLES = [
  '两周内完成课程大作业',
  '准备英语六级考试',
  '完成数据库课程设计并答辩',
  '一周内复习完操作系统期末考点',
];

const selectedCount = computed(() => subtasks.value.filter((s) => s.checked).length);

function newBatchId() {
  batchId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `b-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function generateSubtasks() {
  const text = goal.value.trim();
  if (!text) {
    planError.value = '请先输入要拆解的目标';
    return;
  }
  planning.value = true;
  planError.value = '';
  try {
    const data = await api.aiBreakdown(text, startDate.value || undefined);
    newBatchId();
    subtasks.value = (data.subtasks || []).map((item, index) => ({
      key: `${batchId}#${index}`,
      checked: true,
      title: item.title,
      due_date: item.due_date,
      priority: item.priority || 'medium',
      estimate: item.estimate || '',
    }));
  } catch (e) {
    subtasks.value = [];
    planError.value = e.message || 'AI 生成失败，请稍后重试';
  } finally {
    planning.value = false;
  }
}

function toggleAll(checked) {
  subtasks.value.forEach((s) => {
    s.checked = checked;
  });
}

async function createSelected() {
  const list = subtasks.value.filter((s) => s.checked && s.title.trim());
  if (!list.length) {
    planError.value = '请至少勾选一条子任务';
    return;
  }
  creating.value = true;
  planError.value = '';
  try {
    const res = await api.bulkCreateTasks(
      list.map((s, i) => ({
        title: s.title.trim(),
        description: s.estimate ? `预计耗时：${s.estimate}` : '',
        due_date: s.due_date,
        priority: s.priority,
        // 同一批结果重复提交时走幂等令牌，避免连点产生重复任务
        client_token: `${batchId}#${subtasks.value.indexOf(s)}`,
      }))
    );
    const n = res.data?.length ?? list.length;
    emit('created', n);
    emit('notify', { message: res.duplicated ? `已创建 ${n} 条（含 ${res.duplicated} 条重复提交）` : `已创建 ${n} 条子任务`, type: 'info' });
    subtasks.value = [];
    goal.value = '';
    open.value = false;
  } catch (e) {
    planError.value = e.message || '创建失败，请重试';
  } finally {
    creating.value = false;
  }
}

// ---------- AI 周报总结 ----------
const report = ref(null);
const summarizing = ref(false);
const reportError = ref('');
const copied = ref(false);

async function generateReport() {
  summarizing.value = true;
  reportError.value = '';
  copied.value = false;
  try {
    report.value = await api.aiWeeklySummary();
  } catch (e) {
    report.value = null;
    reportError.value = e.message || 'AI 周报生成失败，请稍后重试';
  } finally {
    summarizing.value = false;
  }
}

async function onCopy() {
  const ok = await copyReport(report.value);
  copied.value = ok;
  emit('notify', { message: ok ? '周报已复制到剪贴板' : '复制失败，请手动选择文本', type: ok ? 'info' : 'error' });
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}

function onExportWord() {
  exportWord(report.value);
  emit('notify', { message: '已导出 Word 文档（.doc）', type: 'info' });
}
function onExportMarkdown() {
  exportMarkdown(report.value);
  emit('notify', { message: '已导出 Markdown 文件（.md）', type: 'info' });
}
function onExportText() {
  exportText(report.value);
  emit('notify', { message: '已导出纯文本（.txt）', type: 'info' });
}

// ---------- 悬浮球拖拽 ----------
const fabRef = ref(null);
const fabPos = ref(null); // { x, y } 为 null 时用 CSS 默认右下角
const dragging = ref(false);
const POS_KEY = 'taskflow.ai-fab.pos';
const EDGE = 12; // 距视口边缘最小间距
const DRAG_THRESHOLD = 4; // 位移小于该值视为点击，不阻止弹窗打开

let drag = null;
let justDragged = false;

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return Number.isFinite(p?.x) && Number.isFinite(p?.y) ? { x: p.x, y: p.y } : null;
  } catch (e) {
    return null;
  }
}

function savePos(pos) {
  try {
    if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
    else localStorage.removeItem(POS_KEY);
  } catch (e) {
    /* 隐私模式下 localStorage 不可用，忽略即可 */
  }
}

/** 把坐标收敛到视口内（含窗口缩放后旧位置越界的情况） */
function clampPos(x, y, w, h) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.min(Math.max(x, EDGE), Math.max(EDGE, vw - w - EDGE)),
    y: Math.min(Math.max(y, EDGE), Math.max(EDGE, vh - h - EDGE)),
  };
}

function onFabPointerDown(e) {
  if (e.button != null && e.button !== 0) return; // 只响应主键
  const el = fabRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();

  // 首次拖动前位置由 CSS 决定，这里固化成像素坐标，后续统一用 left/top 控制
  fabPos.value = { x: rect.left, y: rect.top };
  drag = {
    startX: e.clientX,
    startY: e.clientY,
    originX: rect.left,
    originY: rect.top,
    w: rect.width,
    h: rect.height,
    moved: false,
  };
  window.addEventListener('pointermove', onFabPointerMove);
  window.addEventListener('pointerup', onFabPointerUp);
  window.addEventListener('pointercancel', onFabPointerUp);
}

function onFabPointerMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.startX;
  const dy = e.clientY - drag.startY;
  if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
    drag.moved = true;
    dragging.value = true;
  }
  if (!drag.moved) return;
  e.preventDefault();
  fabPos.value = clampPos(drag.originX + dx, drag.originY + dy, drag.w, drag.h);
}

function onFabPointerUp() {
  window.removeEventListener('pointermove', onFabPointerMove);
  window.removeEventListener('pointerup', onFabPointerUp);
  window.removeEventListener('pointercancel', onFabPointerUp);
  if (drag?.moved) {
    // 拖拽结束后的 click 不应打开弹窗
    justDragged = true;
    savePos(fabPos.value);
    setTimeout(() => {
      justDragged = false;
    }, 0);
  }
  drag = null;
  dragging.value = false;
}

/** 双击复位到默认右下角 */
function onFabDblClick() {
  fabPos.value = null;
  savePos(null);
}

function onFabClick() {
  if (justDragged) return;
  open.value = true;
}

function onWindowResize() {
  if (!fabPos.value || !fabRef.value) return;
  const rect = fabRef.value.getBoundingClientRect();
  fabPos.value = clampPos(fabPos.value.x, fabPos.value.y, rect.width, rect.height);
  savePos(fabPos.value);
}

// ---------- 弹窗控制 ----------
function onKeydown(e) {
  if (e.key === 'Escape' && open.value) open.value = false;
}

onMounted(async () => {
  try {
    const s = await api.aiStatus();
    enabled.value = Boolean(s.enabled);
  } catch (e) {
    enabled.value = false;
  }
  fabPos.value = loadPos();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', onWindowResize);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', onWindowResize);
  window.removeEventListener('pointermove', onFabPointerMove);
  window.removeEventListener('pointerup', onFabPointerUp);
  window.removeEventListener('pointercancel', onFabPointerUp);
});

watch(open, (v) => {
  document.body.style.overflow = v ? 'hidden' : '';
});

// 恢复记忆位置后（窗口可能已被缩放）重新收敛一次，避免悬浮球落在视口外
watch(enabled, async (v) => {
  if (!v || !fabPos.value) return;
  await nextTick();
  onWindowResize();
});
</script>

<template>
  <div v-if="enabled">
    <!-- 悬浮入口：可拖拽，双击复位到默认位置 -->
    <button
      ref="fabRef"
      class="ai-fab"
      :class="{ active: open, dragging }"
      :style="fabPos ? { left: `${fabPos.x}px`, top: `${fabPos.y}px`, right: 'auto', bottom: 'auto' } : null"
      title="AI 助手（可拖拽，双击复位）"
      @pointerdown="onFabPointerDown"
      @click="onFabClick"
      @dblclick="onFabDblClick"
    >
      <span class="halo" />
      <svg class="bot" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="8" width="17" height="12" rx="5" stroke="currentColor" stroke-width="1.7" />
        <path d="M12 8V4.8M12 3.2v1.6M12 3.2c-1 0-1.8.7-1.8 1.6h3.6c0-.9-.8-1.6-1.8-1.6Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        <circle cx="9" cy="13.6" r="1.25" fill="currentColor" />
        <circle cx="15" cy="13.6" r="1.25" fill="currentColor" />
        <path d="M9.8 16.8h4.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
      <span class="fab-text">AI 助手</span>
    </button>

    <!-- 弹窗 -->
    <Teleport to="body">
      <div v-if="open" class="ai-mask" @click.self="open = false">
        <div class="ai-panel" role="dialog" aria-modal="true">
          <header class="ai-head">
            <span class="ai-avatar">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3.5" y="8" width="17" height="12" rx="5" stroke="currentColor" stroke-width="1.7" />
                <path d="M12 8V4.8M12 3.2c-1 0-1.8.7-1.8 1.6h3.6c0-.9-.8-1.6-1.8-1.6Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                <circle cx="9" cy="13.6" r="1.25" fill="currentColor" />
                <circle cx="15" cy="13.6" r="1.25" fill="currentColor" />
                <path d="M9.8 16.8h4.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              </svg>
            </span>
            <div class="ai-head-text">
              <div class="ai-title">AI 助手</div>
              <div class="ai-sub">任务规划 · 周报总结，基于你的真实任务数据</div>
            </div>
            <button class="ai-close" title="关闭" @click="open = false">✕</button>
          </header>

          <nav class="ai-tabs">
            <button class="ai-tab" :class="{ on: tab === 'plan' }" @click="tab = 'plan'">AI 任务规划</button>
            <button class="ai-tab" :class="{ on: tab === 'report' }" @click="tab = 'report'">AI 周报总结</button>
          </nav>

          <!-- Tab 1：任务规划 -->
          <section v-if="tab === 'plan'" class="ai-body">
            <label class="ai-label">想完成什么目标？</label>
            <textarea
              v-model="goal"
              class="ai-textarea"
              rows="2"
              maxlength="300"
              placeholder="例如：两周内完成课程大作业（含调研、开发、撰写、答辩）"
            />

            <div class="ai-row">
              <div class="ai-date">
                <label class="ai-label">开始日期</label>
                <input v-model="startDate" type="date" class="ai-input date" />
              </div>
              <button class="btn btn-primary ai-generate" :disabled="planning" @click="generateSubtasks">
                <span v-if="planning" class="spinner" />
                {{ planning ? 'AI 正在拆解…' : '生成子任务' }}
              </button>
            </div>

            <div class="ai-examples">
              <button v-for="ex in EXAMPLES" :key="ex" class="example-chip" @click="goal = ex">{{ ex }}</button>
            </div>

            <p v-if="planError" class="ai-error">{{ planError }}</p>

            <template v-if="subtasks.length">
              <div class="ai-result-head">
                <span>AI 给出 <b>{{ subtasks.length }}</b> 条子任务，已选 <b>{{ selectedCount }}</b> 条</span>
                <span class="ai-mini-actions">
                  <button @click="toggleAll(true)">全选</button>
                  <button @click="toggleAll(false)">取消全选</button>
                </span>
              </div>

              <div class="ai-subtask-list">
                <div v-for="(s, i) in subtasks" :key="s.key" class="ai-subtask" :class="{ off: !s.checked }">
                  <input v-model="s.checked" type="checkbox" class="ai-check" />
                  <span class="ai-index">{{ i + 1 }}</span>
                  <input v-model="s.title" class="ai-input title" maxlength="100" />
                  <select v-model="s.priority" class="ai-input prio">
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                  <input v-model="s.due_date" type="date" class="ai-input date" />
                  <span v-if="s.estimate" class="ai-estimate">{{ s.estimate }}</span>
                </div>
              </div>

              <div class="ai-foot">
                <button class="btn btn-ghost" :disabled="planning" @click="generateSubtasks">重新生成</button>
                <button class="btn btn-primary" :disabled="creating || selectedCount === 0" @click="createSelected">
                  <span v-if="creating" class="spinner" />
                  {{ creating ? '创建中…' : `一键创建 ${selectedCount} 条任务` }}
                </button>
              </div>
            </template>

            <p v-else class="ai-hint">
              输入一个复杂目标，AI 会拆解成 3~8 条可执行的子任务，勾选后一键写入任务列表。
            </p>
          </section>

          <!-- Tab 2：周报总结 -->
          <section v-else class="ai-body">
            <div class="ai-row">
              <p class="ai-hint inline">
                基于任务库真实数据（完成率、逾期、本周完成与新增）生成周报，可直接导出。
              </p>
              <button class="btn btn-primary ai-generate" :disabled="summarizing" @click="generateReport">
                <span v-if="summarizing" class="spinner" />
                {{ summarizing ? 'AI 正在分析…' : (report ? '重新生成周报' : '生成本周总结') }}
              </button>
            </div>

            <p v-if="reportError" class="ai-error">{{ reportError }}</p>

            <template v-if="report">
              <div class="report-stats">
                <span class="chip rchip">全部 {{ report.stats.total }}</span>
                <span class="chip rchip">已完成 {{ report.stats.done }}</span>
                <span class="chip rchip">进行中 {{ report.stats.doing }}</span>
                <span class="chip rchip">逾期 {{ report.stats.overdue }}</span>
                <span class="chip rchip brand">完成率 {{ report.stats.completionRate }}%</span>
              </div>

              <div class="report-block">
                <div class="report-label">本周总结</div>
                <p class="report-summary">{{ report.summary }}</p>
              </div>

              <div class="report-grid">
                <div class="report-block">
                  <div class="report-label ok">亮点</div>
                  <ul class="report-list">
                    <li v-for="(x, i) in report.highlights" :key="`h${i}`">{{ x }}</li>
                    <li v-if="!report.highlights.length" class="muted">（无）</li>
                  </ul>
                </div>
                <div class="report-block">
                  <div class="report-label risk">风险</div>
                  <ul class="report-list">
                    <li v-for="(x, i) in report.risks" :key="`r${i}`">{{ x }}</li>
                    <li v-if="!report.risks.length" class="muted">（无）</li>
                  </ul>
                </div>
              </div>

              <div class="report-block">
                <div class="report-label">改进建议</div>
                <ul class="report-list">
                  <li v-for="(x, i) in report.suggestions" :key="`s${i}`">{{ x }}</li>
                  <li v-if="!report.suggestions.length" class="muted">（无）</li>
                </ul>
              </div>

              <div class="export-bar">
                <span class="export-label">导出：</span>
                <button class="btn btn-ghost small" @click="onExportWord">Word（.doc）</button>
                <button class="btn btn-ghost small" @click="onExportMarkdown">Markdown（.md）</button>
                <button class="btn btn-ghost small" @click="onExportText">纯文本（.txt）</button>
                <button class="btn btn-ghost small" @click="onCopy">{{ copied ? '已复制 ✓' : '复制文本' }}</button>
              </div>
            </template>

            <p v-else class="ai-hint">还没有生成周报，点击右上角按钮开始。</p>
          </section>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ---------------- 悬浮入口 ---------------- */
.ai-fab {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 54px;
  padding: 0 22px 0 16px;
  border-radius: var(--radius-pill);
  background: linear-gradient(135deg, #23d394, #14a874);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
  box-shadow: 0 10px 26px rgba(20, 168, 116, 0.38);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  animation: floaty 3.6s ease-in-out infinite;
  cursor: grab;
  touch-action: none; /* 触屏拖动时不要触发页面滚动 */
  user-select: none;
  -webkit-user-select: none;
}

.ai-fab:hover {
  transform: translateY(-3px);
  box-shadow: 0 14px 32px rgba(20, 168, 116, 0.46);
}

.ai-fab.active {
  animation: none;
}

/* 拖拽中：禁用浮动动画与位移过渡，避免跟手抖动 */
.ai-fab.dragging {
  cursor: grabbing;
  animation: none;
  transition: none;
  transform: scale(1.05);
  box-shadow: 0 18px 38px rgba(20, 168, 116, 0.52);
}

.bot {
  width: 26px;
  height: 26px;
}

.halo {
  position: absolute;
  left: 12px;
  top: 50%;
  width: 26px;
  height: 26px;
  margin-top: -13px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.35);
  animation: pulse 2.4s ease-out infinite;
  pointer-events: none;
}

@keyframes pulse {
  0% { transform: scale(0.9); opacity: 0.55; }
  70% { transform: scale(2.1); opacity: 0; }
  100% { transform: scale(2.1); opacity: 0; }
}

@keyframes floaty {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

/* ---------------- 弹窗 ---------------- */
.ai-mask {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 34, 28, 0.34);
  backdrop-filter: blur(3px);
  animation: fade 0.18s ease;
}

@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.ai-panel {
  width: min(780px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 22px;
  box-shadow: 0 24px 60px rgba(18, 40, 30, 0.24);
  overflow: hidden;
  animation: pop 0.2s ease;
}

@keyframes pop {
  from { opacity: 0; transform: translateY(14px) scale(0.98); }
  to { opacity: 1; transform: none; }
}

.ai-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--line);
}

.ai-avatar {
  width: 40px;
  height: 40px;
  border-radius: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.ai-avatar svg {
  width: 24px;
  height: 24px;
}

.ai-head-text {
  flex: 1;
}

.ai-title {
  font-size: 16px;
  font-weight: 600;
}

.ai-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
}

.ai-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: var(--muted);
  font-size: 14px;
}

.ai-close:hover {
  background: var(--bg);
  color: var(--text);
}

.ai-tabs {
  display: flex;
  gap: 6px;
  padding: 12px 20px 0;
}

.ai-tab {
  height: 34px;
  padding: 0 16px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  color: var(--text-sub);
  background: var(--bg);
}

.ai-tab.on {
  background: var(--brand);
  color: #fff;
  font-weight: 500;
}

.ai-body {
  padding: 16px 20px 20px;
  overflow-y: auto;
}

.ai-label {
  display: block;
  font-size: 12px;
  color: var(--text-sub);
  margin-bottom: 6px;
}

.ai-textarea {
  width: 100%;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: #fbfdfc;
  resize: vertical;
  font-size: 14px;
  line-height: 1.6;
}

.ai-textarea:focus {
  border-color: var(--brand);
  background: #fff;
}

.ai-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.ai-date {
  display: flex;
  flex-direction: column;
}

.ai-generate {
  min-width: 132px;
  justify-content: center;
}

.ai-input {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: #fbfdfc;
  font-size: 13px;
}

.ai-input:focus {
  border-color: var(--brand);
  background: #fff;
}

.ai-input.date {
  width: 140px;
}

.ai-input.title {
  flex: 1;
  min-width: 120px;
}

.ai-input.prio {
  width: 62px;
}

.ai-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.example-chip {
  padding: 5px 12px;
  border-radius: var(--radius-pill);
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 12px;
}

.example-chip:hover {
  background: #d8f3e6;
}

.ai-error {
  margin: 12px 0 0;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
}

.ai-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
}

.ai-hint.inline {
  margin: 0;
  flex: 1;
}

.ai-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
  font-size: 13px;
  color: var(--text-sub);
}

.ai-mini-actions button {
  margin-left: 10px;
  font-size: 12px;
  color: var(--brand-dark);
}

.ai-subtask-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 4px;
}

.ai-subtask {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: #fcfefd;
}

.ai-subtask.off {
  opacity: 0.5;
}

.ai-check {
  width: 16px;
  height: 16px;
  accent-color: var(--brand);
  cursor: pointer;
}

.ai-index {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand-dark);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ai-estimate {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}

.ai-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

/* ---------------- 周报 ---------------- */
.report-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.rchip {
  background: var(--bg);
  color: var(--text-sub);
}

.rchip.brand {
  background: var(--brand-soft);
  color: var(--brand-dark);
}

.report-block {
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: #fbfdfc;
  border: 1px solid var(--line);
}

.report-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub);
  margin-bottom: 8px;
}

.report-label.ok {
  color: var(--brand-dark);
}

.report-label.risk {
  color: var(--danger);
}

.report-summary {
  margin: 0;
  font-size: 14px;
  line-height: 1.85;
  color: var(--text);
}

.report-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.report-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-sub);
}

.report-list .muted {
  color: var(--muted);
  list-style: none;
  margin-left: -18px;
}

.export-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}

.export-label {
  font-size: 12px;
  color: var(--muted);
}

.btn.small {
  height: 30px;
  padding: 0 13px;
  font-size: 12px;
}

/* ---------------- 加载指示 ---------------- */
.spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 720px) {
  .ai-fab {
    right: 16px;
    bottom: 16px;
    height: 48px;
    padding: 0 18px 0 14px;
  }
  .ai-panel {
    max-height: 92vh;
  }
  .report-grid {
    grid-template-columns: 1fr;
  }
  .ai-subtask {
    flex-wrap: wrap;
  }
}
</style>
