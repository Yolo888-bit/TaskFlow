<script setup>
import { ref, watch, computed } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  task: { type: Object, default: null },
  submitting: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'submit']);

const form = ref({ title: '', description: '', due_date: '', priority: 'medium', status: 'pending' });
const errors = ref({});

const isEdit = computed(() => Boolean(props.task));

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    errors.value = {};
    if (props.task) {
      form.value = {
        title: props.task.title,
        description: props.task.description || '',
        due_date: props.task.due_date,
        priority: props.task.priority,
        status: props.task.status,
      };
    } else {
      // 新建时默认截止日期为 3 天后，减少用户录入成本
      const d = new Date();
      d.setDate(d.getDate() + 3);
      const p = (n) => String(n).padStart(2, '0');
      form.value = {
        title: '',
        description: '',
        due_date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
        priority: 'medium',
        status: 'pending',
      };
    }
  }
);

/** 前端先行校验：与后端规则保持一致，非法输入不发出请求 */
function validate() {
  const e = {};
  const title = form.value.title.trim();
  if (!title) e.title = '任务标题不能为空';
  else if (title.length > 100) e.title = '标题不能超过 100 个字符';

  if (!form.value.due_date) {
    e.due_date = '请选择截止日期';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.value.due_date)) {
    e.due_date = '日期格式应为 YYYY-MM-DD';
  } else {
    const [y, m, d] = form.value.due_date.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
      e.due_date = '请选择真实存在的日期';
    }
  }

  if (form.value.description.length > 1000) e.description = '描述不能超过 1000 个字符';

  errors.value = e;
  return Object.keys(e).length === 0;
}

function onSubmit() {
  if (!validate()) return;
  emit('submit', {
    ...form.value,
    title: form.value.title.trim(),
    description: form.value.description.trim(),
  });
}

function onMaskClick(event) {
  if (event.target === event.currentTarget) emit('close');
}
</script>

<template>
  <div v-if="visible" class="mask" @click="onMaskClick">
    <div class="modal card">
      <div class="modal-head">
        <div class="modal-title">{{ isEdit ? '编辑任务' : '新建任务' }}</div>
        <button class="close" @click="emit('close')">×</button>
      </div>

      <form class="modal-body" @submit.prevent="onSubmit">
        <div class="field">
          <label>任务标题 <span class="required">*</span></label>
          <input
            v-model="form.title"
            class="input"
            :class="{ invalid: errors.title }"
            placeholder="例如：完成数据库实验报告"
            maxlength="120"
          />
          <span v-if="errors.title" class="err">{{ errors.title }}</span>
        </div>

        <div class="field">
          <label>任务描述</label>
          <textarea
            v-model="form.description"
            class="textarea"
            placeholder="补充说明（选填）"
          ></textarea>
          <span v-if="errors.description" class="err">{{ errors.description }}</span>
        </div>

        <div class="row">
          <div class="field flex1">
            <label>截止日期 <span class="required">*</span></label>
            <input
              v-model="form.due_date"
              class="input"
              :class="{ invalid: errors.due_date }"
              type="date"
            />
            <span v-if="errors.due_date" class="err">{{ errors.due_date }}</span>
          </div>

          <div class="field flex1">
            <label>优先级</label>
            <select v-model="form.priority" class="select">
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          <div class="field flex1">
            <label>状态</label>
            <select v-model="form.status" class="select">
              <option value="pending">待办</option>
              <option value="doing">进行中</option>
              <option value="done">已完成</option>
            </select>
          </div>
        </div>

        <div class="modal-foot">
          <button type="button" class="btn btn-ghost" @click="emit('close')">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="submitting">
            {{ submitting ? '保存中…' : isEdit ? '保存修改' : '创建任务' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 32, 26, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 20px;
  backdrop-filter: blur(2px);
}

.modal {
  width: 100%;
  max-width: 520px;
  box-shadow: var(--shadow-md);
  animation: pop 0.18s ease;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 4px;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
}

.close {
  font-size: 22px;
  line-height: 1;
  color: var(--muted);
}

.close:hover {
  color: var(--text);
}

.modal-body {
  padding: 12px 20px 20px;
}

.row {
  display: flex;
  gap: 12px;
}

.flex1 {
  flex: 1;
  min-width: 0;
}

.err {
  font-size: 12px;
  color: var(--danger);
}

.input.invalid {
  border-color: var(--danger);
  background: #fffafa;
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}
</style>
