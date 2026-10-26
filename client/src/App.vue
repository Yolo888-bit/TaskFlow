<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { api } from './api/index.js';
import StatCards from './components/StatCards.vue';
import DistributionCharts from './components/DistributionCharts.vue';
import FilterBar from './components/FilterBar.vue';
import TaskCard from './components/TaskCard.vue';
import TaskFormModal from './components/TaskFormModal.vue';
import AiAssistant from './components/AiAssistant.vue';

const tasks = ref([]);
const stats = ref({
  total: 0,
  done: 0,
  doing: 0,
  pending: 0,
  overdue: 0,
  dueToday: 0,
  completionRate: 0,
  statusDistribution: { pending: 0, doing: 0, done: 0 },
  priorityDistribution: { high: 0, medium: 0, low: 0 },
});

// 筛选条件用 ref 而非 reactive 常量：FilterBar 通过 v-model 整体替换新对象，
// 若用 reactive 常量会导致模板赋值失败、筛选条件永远不生效（此前筛选失效的根因）。
// 默认智能排序：逾期 + 高优先级置顶，已完成置底。
const filters = ref({ status: '', priority: '', sort: 'smart', order: 'asc', q: '' });

const loading = ref(false);
const submitting = ref(false);
const aiEnabled = ref(false);
const serverOnline = ref(true);

const formVisible = ref(false);
const editingTask = ref(null);

const toasts = ref([]);
let toastSeq = 0;

function toast(message, type = 'info') {
  const id = ++toastSeq;
  toasts.value.push({ id, message, type });
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 2600);
}

/** 列表与统计一起刷新，保证统计始终与列表一致（R-04） */
async function refresh() {
  loading.value = true;
  try {
    const [list, st] = await Promise.all([
      api.listTasks({ ...filters.value }),
      api.getStats(),
    ]);
    tasks.value = list;
    stats.value = st;
    serverOnline.value = true;
  } catch (e) {
    serverOnline.value = false;
    toast(e.message || '加载失败', 'error');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await refresh();
  try {
    const s = await api.aiStatus();
    aiEnabled.value = Boolean(s.enabled);
  } catch (e) {
    aiEnabled.value = false;
  }
});

// 筛选条件变化立即重新加载（搜索已在 FilterBar 内做防抖）
watch(filters, () => refresh(), { deep: true });

const counts = computed(() => ({
  '': stats.value.total,
  pending: stats.value.pending,
  doing: stats.value.doing,
  done: stats.value.done,
}));

/** 幂等令牌：表单打开时生成，提交成功后重建，防止连点产生重复任务 */
let clientToken = '';
function newToken() {
  clientToken =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openCreate() {
  editingTask.value = null;
  newToken();
  formVisible.value = true;
}

function openEdit(task) {
  editingTask.value = task;
  newToken();
  formVisible.value = true;
}

async function submitForm(payload) {
  submitting.value = true;
  try {
    if (editingTask.value) {
      const { client_token, ...rest } = payload;
      await api.updateTask(editingTask.value.id, rest);
      toast('任务已更新');
    } else {
      await api.createTask({ ...payload, client_token: clientToken });
      toast('任务已创建');
      newToken();
    }
    formVisible.value = false;
    await refresh();
  } catch (e) {
    toast(e.message || '保存失败', 'error');
  } finally {
    submitting.value = false;
  }
}

async function toggleDone(task) {
  const next = task.status === 'done' ? 'pending' : 'done';
  try {
    await api.updateTask(task.id, { status: next });
    await refresh();
  } catch (e) {
    toast(e.message || '状态更新失败', 'error');
  }
}

async function changeStatus(task, status) {
  if (status === task.status) return;
  try {
    await api.updateTask(task.id, { status });
    await refresh();
  } catch (e) {
    toast(e.message || '状态更新失败', 'error');
  }
}

async function removeTask(task) {
  try {
    await api.deleteTask(task.id);
    toast('任务已删除');
    await refresh();
  } catch (e) {
    toast(e.message || '删除失败', 'error');
  }
}

/** AI 助手批量创建子任务后刷新列表（组件已完成落库，这里只做同步） */
async function onAiCreated() {
  await refresh();
}

function onAiNotify({ message, type = 'info' }) {
  toast(message, type);
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <span class="logo">TF</span>
        <div>
          <div class="brand-name">TaskFlow</div>
          <div class="brand-sub">个人任务与进度管理系统</div>
        </div>
      </div>

      <div class="topbar-actions">
        <span v-if="!serverOnline" class="chip offline">后端未连接</span>
        <span v-else-if="!aiEnabled" class="chip">AI 未配置</span>
        <button class="btn btn-primary" @click="openCreate">+ 新建任务</button>
      </div>
    </header>

    <main class="container">
      <StatCards :stats="stats" />

      <DistributionCharts :stats="stats" />

      <FilterBar v-model="filters" :counts="counts" />

      <section class="list">
        <div v-if="loading && !tasks.length" class="empty card">加载中…</div>

        <div v-else-if="!tasks.length" class="empty card">
          <div class="empty-title">没有符合条件的任务</div>
          <div class="empty-sub">
            {{ filters.status || filters.priority || filters.q ? '试试调整筛选条件或重置' : '点击右上角「新建任务」开始记录吧' }}
          </div>
        </div>

        <TaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          @toggle="toggleDone"
          @edit="openEdit"
          @delete="removeTask"
          @status-change="changeStatus"
        />
      </section>

      <footer class="foot">
        数据保存在本地 SQLite（server/db/task.db），重启服务不丢失 · 共 {{ tasks.length }} 条当前结果 / 全部 {{ stats.total }} 条
      </footer>
    </main>

    <TaskFormModal
      :visible="formVisible"
      :task="editingTask"
      :submitting="submitting"
      @close="formVisible = false"
      @submit="submitForm"
    />

    <!-- 悬浮 AI 助手：右下角常驻入口，内部自行判断网关是否可用 -->
    <AiAssistant @created="onAiCreated" @notify="onAiNotify" />

    <div class="toasts">
      <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">{{ t.message }}</div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 40px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 28px;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.5px;
}

.brand-name {
  font-size: 16px;
  font-weight: 600;
}

.brand-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chip.offline {
  background: var(--danger-soft);
  color: var(--danger);
}

.container {
  max-width: 1080px;
  margin: 0 auto;
  padding: 22px 20px 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 220px;
}

.empty {
  padding: 40px 20px;
  text-align: center;
}

.empty-title {
  font-size: 15px;
  font-weight: 500;
}

.empty-sub {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}

.foot {
  margin-top: 10px;
  text-align: center;
  font-size: 12px;
  color: var(--muted);
}

.toasts {
  position: fixed;
  right: 24px;
  /* 抬高，避免被右下角悬浮 AI 助手遮挡 */
  bottom: 96px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 80;
}

.toast {
  padding: 10px 16px;
  border-radius: var(--radius-pill);
  background: #23302a;
  color: #fff;
  font-size: 13px;
  box-shadow: var(--shadow-md);
  animation: slide 0.2s ease;
}

.toast.error {
  background: var(--danger);
}

@keyframes slide {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 900px) {
  .topbar {
    padding: 12px 16px;
  }
}
</style>
