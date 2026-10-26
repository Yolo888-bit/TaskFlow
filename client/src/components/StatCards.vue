<script setup>
import { computed } from 'vue';

const props = defineProps({
  stats: { type: Object, required: true },
});

const cards = computed(() => [
  {
    key: 'total',
    label: '任务总数',
    value: props.stats.total,
    unit: '个',
    hint: `待办 ${props.stats.pending} · 进行中 ${props.stats.doing}`,
    tone: 'neutral',
  },
  {
    key: 'rate',
    label: '完成率',
    value: `${props.stats.completionRate}%`,
    unit: '',
    hint: `已完成 ${props.stats.done} 个`,
    tone: 'brand',
  },
  {
    key: 'dueToday',
    label: '今天到期',
    value: props.stats.dueToday,
    unit: '个',
    hint: '需要今日处理',
    tone: 'warn',
  },
  {
    key: 'overdue',
    label: '已逾期',
    value: props.stats.overdue,
    unit: '个',
    hint: '未完成且已过截止日',
    tone: 'danger',
  },
]);
</script>

<template>
  <div class="stat-grid">
    <div v-for="c in cards" :key="c.key" class="card stat-card" :class="`tone-${c.tone}`">
      <div class="stat-label">{{ c.label }}</div>
      <div class="stat-value">
        {{ c.value }}<span v-if="c.unit" class="stat-unit">{{ c.unit }}</span>
      </div>
      <div class="stat-hint">{{ c.hint }}</div>
    </div>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.stat-card {
  padding: 18px 20px;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--line);
}

.stat-card.tone-brand::before {
  background: var(--brand);
}
.stat-card.tone-warn::before {
  background: var(--warn);
}
.stat-card.tone-danger::before {
  background: var(--danger);
}

.stat-label {
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.4px;
}

.stat-value {
  margin-top: 8px;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.tone-brand .stat-value {
  color: var(--brand-dark);
}
.tone-danger .stat-value {
  color: var(--danger);
}
.tone-warn .stat-value {
  color: var(--warn);
}

.stat-unit {
  margin-left: 3px;
  font-size: 13px;
  font-weight: 400;
  color: var(--muted);
}

.stat-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
}

@media (max-width: 900px) {
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
