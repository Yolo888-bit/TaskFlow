<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  task: { type: Object, required: true },
});

const emit = defineEmits(['toggle', 'edit', 'delete', 'status-change']);

const PRIORITY = {
  high: { label: '高优先', cls: 'p-high' },
  medium: { label: '中优先', cls: 'p-medium' },
  low: { label: '低优先', cls: 'p-low' },
};
const STATUS = {
  pending: '待办',
  doing: '进行中',
  done: '已完成',
};

const confirming = ref(false);

const priority = computed(() => PRIORITY[props.task.priority] || PRIORITY.medium);
const isDone = computed(() => props.task.status === 'done');

const dueText = computed(() => {
  const t = props.task;
  if (t.isOverdue) {
    const days = Math.abs(t.daysUntilDue);
    return { text: `已逾期 ${days} 天`, cls: 'd-overdue' };
  }
  if (t.isDueToday) return { text: '今天到期', cls: 'd-today' };
  if (t.daysUntilDue <= 3) return { text: `${t.daysUntilDue} 天后到期`, cls: 'd-soon' };
  return { text: `截止 ${t.due_date}`, cls: 'd-normal' };
});

function confirmDelete() {
  confirming.value = true;
}
function cancelDelete() {
  confirming.value = false;
}
function doDelete() {
  confirming.value = false;
  emit('delete', props.task);
}
</script>

<template>
  <div class="card task-card" :class="{ done: isDone, overdue: task.isOverdue }">
    <button
      class="check"
      :class="{ checked: isDone }"
      :title="isDone ? '标记为未完成' : '标记为已完成'"
      @click="emit('toggle', task)"
    >
      <svg v-if="isDone" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M5 12.5l4.5 4.5L19 7.5"
          fill="none"
          stroke="currentColor"
          stroke-width="2.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div class="body">
      <div class="title-row">
        <span class="title">{{ task.title }}</span>
        <span class="chip" :class="priority.cls">{{ priority.label }}</span>
      </div>

      <div v-if="task.description" class="desc">{{ task.description }}</div>

      <div class="meta">
        <span class="chip" :class="dueText.cls">{{ dueText.text }}</span>

        <select
          class="status-select"
          :value="task.status"
          @change="emit('status-change', task, $event.target.value)"
        >
          <option value="pending">待办</option>
          <option value="doing">进行中</option>
          <option value="done">已完成</option>
        </select>

        <span class="created">创建于 {{ task.created_at.slice(0, 10) }}</span>
      </div>
    </div>

    <div class="actions">
      <template v-if="!confirming">
        <button class="btn btn-ghost mini" @click="emit('edit', task)">编辑</button>
        <button class="btn btn-ghost mini danger-text" @click="confirmDelete">删除</button>
      </template>
      <template v-else>
        <span class="confirm-text">确认删除？</span>
        <button class="btn btn-danger mini" @click="doDelete">删除</button>
        <button class="btn btn-ghost mini" @click="cancelDelete">取消</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.task-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}

.task-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.task-card.overdue {
  border-left: 3px solid var(--danger);
}

.task-card.done {
  opacity: 0.72;
}

.check {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  border-radius: 50%;
  border: 1.6px solid #ccd8d2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: all 0.16s ease;
}

.check:hover {
  border-color: var(--brand);
}

.check.checked {
  background: var(--brand);
  border-color: var(--brand);
}

.body {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.title {
  font-size: 15px;
  font-weight: 500;
  word-break: break-word;
}

.done .title {
  text-decoration: line-through;
  color: var(--muted);
}

.desc {
  margin-top: 5px;
  font-size: 13px;
  color: var(--text-sub);
  word-break: break-word;
}

.meta {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.p-high {
  background: var(--danger-soft);
  color: var(--danger);
}
.p-medium {
  background: var(--warn-soft);
  color: var(--warn);
}
.p-low {
  background: #eef2f0;
  color: var(--muted);
}

.d-overdue {
  background: var(--danger-soft);
  color: var(--danger);
  font-weight: 500;
}
.d-today {
  background: var(--warn-soft);
  color: var(--warn);
  font-weight: 500;
}
.d-soon {
  background: var(--brand-soft);
  color: var(--brand-dark);
}
.d-normal {
  background: #f1f5f3;
  color: var(--muted);
}

.status-select {
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  background: #fff;
  font-size: 12px;
  color: var(--text-sub);
}

.created {
  font-size: 12px;
  color: var(--muted);
}

.actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn.mini {
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
}

.danger-text {
  color: var(--danger);
}

.danger-text:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.confirm-text {
  font-size: 12px;
  color: var(--danger);
}
</style>
