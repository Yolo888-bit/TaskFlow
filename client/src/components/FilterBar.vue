<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  counts: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['update:modelValue']);

const STATUS_TABS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待办' },
  { value: 'doing', label: '进行中' },
  { value: 'done', label: '已完成' },
];

const keyword = ref(props.modelValue.q || '');
let timer = null;

// 搜索防抖：避免每敲一个字都请求接口
watch(keyword, (val) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    patch({ q: val });
  }, 300);
});

function patch(partial) {
  emit('update:modelValue', { ...props.modelValue, ...partial });
}

function reset() {
  keyword.value = '';
  emit('update:modelValue', { status: '', priority: '', sort: 'smart', order: 'asc', q: '' });
}
</script>

<template>
  <div class="filter-bar card">
    <div class="tabs">
      <button
        v-for="tab in STATUS_TABS"
        :key="tab.value"
        class="tab"
        :class="{ active: modelValue.status === tab.value }"
        @click="patch({ status: tab.value })"
      >
        {{ tab.label }}
        <span v-if="counts[tab.value] !== undefined" class="tab-count">{{ counts[tab.value] }}</span>
      </button>
    </div>

    <div class="controls">
      <select class="select mini" :value="modelValue.priority" @change="patch({ priority: $event.target.value })">
        <option value="">全部优先级</option>
        <option value="high">高优先级</option>
        <option value="medium">中优先级</option>
        <option value="low">低优先级</option>
      </select>

      <select class="select mini" :value="modelValue.sort" @change="patch({ sort: $event.target.value })">
        <option value="smart">智能排序</option>
        <option value="due_date">按截止日期</option>
        <option value="priority">按优先级</option>
        <option value="created_at">按创建时间</option>
      </select>

      <button
        class="order-btn"
        :class="{ disabled: modelValue.sort === 'smart' }"
        :disabled="modelValue.sort === 'smart'"
        :title="modelValue.sort === 'smart' ? '智能排序无需选择方向' : modelValue.order === 'asc' ? '当前升序，点击切换降序' : '当前降序，点击切换升序'"
        @click="patch({ order: modelValue.order === 'asc' ? 'desc' : 'asc' })"
      >
        {{ modelValue.order === 'asc' ? '升序 ↑' : '降序 ↓' }}
      </button>

      <div class="search">
        <input v-model="keyword" class="input mini" type="search" placeholder="搜索任务标题 / 描述" />
      </div>

      <button class="btn btn-ghost reset" @click="reset">重置</button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  flex-wrap: wrap;
}

.tabs {
  display: flex;
  gap: 4px;
  background: #f2f6f4;
  padding: 4px;
  border-radius: var(--radius-pill);
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  color: var(--text-sub);
  transition: all 0.16s ease;
}

.tab:hover {
  color: var(--brand-dark);
}

.tab.active {
  background: #fff;
  color: var(--brand-dark);
  font-weight: 500;
  box-shadow: 0 1px 4px rgba(24, 48, 38, 0.08);
}

.tab-count {
  font-size: 11px;
  color: var(--muted);
}

.controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.select.mini,
.input.mini {
  height: 32px;
  padding: 0 10px;
  width: auto;
  min-width: 120px;
  border-radius: var(--radius-pill);
  font-size: 13px;
}

.search .input.mini {
  min-width: 200px;
}

.order-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--line);
  font-size: 13px;
  color: var(--text-sub);
  background: #fff;
}

.order-btn:hover:not(.disabled) {
  border-color: var(--brand);
  color: var(--brand-dark);
}

.order-btn.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.reset {
  height: 32px;
  padding: 0 12px;
  font-size: 13px;
}
</style>
