<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import Chart from 'chart.js/auto';

const props = defineProps({
  stats: { type: Object, required: true },
});

const statusCanvas = ref(null);
const priorityCanvas = ref(null);
let statusChart = null;
let priorityChart = null;

const STATUS_META = [
  { key: 'done', label: '已完成', color: '#1dc78a' },
  { key: 'doing', label: '进行中', color: '#4a9df8' },
  { key: 'pending', label: '待办', color: '#cfd8d3' },
];
const PRIORITY_META = [
  { key: 'high', label: '高优先', color: '#e5484d' },
  { key: 'medium', label: '中优先', color: '#e08b17' },
  { key: 'low', label: '低优先', color: '#9aa8a0' },
];

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '62%',
    borderWidth: 2,
    borderColor: '#fff',
    hoverOffset: 6,
  };
}

function makeDoughnut(canvasEl, labels, colors, data) {
  const options = baseOptions();
  return new Chart(canvasEl, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, ...options }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 12 },
            color: '#5b6660',
            padding: 10,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? Math.round((ctx.parsed / total) * 100) : 0;
              return ` ${ctx.label}：${ctx.parsed} 个（${pct}%）`;
            },
          },
        },
      },
      animation: { duration: 400 },
    },
  });
}

function render() {
  const d = props.stats;
  const statusData = STATUS_META.map((m) => d.statusDistribution?.[m.key] ?? 0);
  const priorityData = PRIORITY_META.map((m) => d.priorityDistribution?.[m.key] ?? 0);

  if (statusCanvas.value) {
    if (statusChart) {
      statusChart.data.datasets[0].data = statusData;
      statusChart.update();
    } else {
      statusChart = makeDoughnut(
        statusCanvas.value,
        STATUS_META.map((m) => m.label),
        STATUS_META.map((m) => m.color),
        statusData
      );
    }
  }

  if (priorityCanvas.value) {
    if (priorityChart) {
      priorityChart.data.datasets[0].data = priorityData;
      priorityChart.update();
    } else {
      priorityChart = makeDoughnut(
        priorityCanvas.value,
        PRIORITY_META.map((m) => m.label),
        PRIORITY_META.map((m) => m.color),
        priorityData
      );
    }
  }
}

onMounted(render);
watch(() => props.stats, render, { deep: true });
onBeforeUnmount(() => {
  statusChart?.destroy();
  priorityChart?.destroy();
  statusChart = null;
  priorityChart = null;
});
</script>

<template>
  <div class="charts">
    <div class="card chart-card">
      <div class="chart-head">
        <div class="chart-title">状态分布</div>
        <div class="chart-sub">已完成 {{ stats.done }} · 进行中 {{ stats.doing }} · 待办 {{ stats.pending }}</div>
      </div>
      <div class="chart-body">
        <canvas ref="statusCanvas"></canvas>
      </div>
    </div>

    <div class="card chart-card">
      <div class="chart-head">
        <div class="chart-title">优先级分布</div>
        <div class="chart-sub">高 {{ stats.priorityDistribution.high }} · 中 {{ stats.priorityDistribution.medium }} · 低 {{ stats.priorityDistribution.low }}</div>
      </div>
      <div class="chart-body">
        <canvas ref="priorityCanvas"></canvas>
      </div>
    </div>
  </div>
</template>

<style scoped>
.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.chart-card {
  padding: 18px 20px;
}

.chart-head {
  margin-bottom: 8px;
}

.chart-title {
  font-size: 14px;
  font-weight: 600;
}

.chart-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}

.chart-body {
  height: 180px;
  position: relative;
}

@media (max-width: 900px) {
  .charts {
    grid-template-columns: 1fr;
  }
}
</style>
