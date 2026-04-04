<template>
  <Transition name="toast">
    <div class="toast" v-if="state.visible" :class="state.type">
      <span class="toast-icon">{{ iconMap[state.type] }}</span>
      <span class="toast-message">{{ state.message }}</span>
    </div>
  </Transition>
</template>

<script setup>
import { state } from '../composables/useToast'

const iconMap = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ'
}
</script>

<style scoped>
.toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  padding: 14px 28px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 2000;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  max-width: 400px;
  text-align: center;
}

.toast-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.toast.success {
  background: white;
  color: var(--color-success);
  border: 1px solid rgba(52, 199, 89, 0.2);
}
.toast.success .toast-icon { background: rgba(52, 199, 89, 0.15); }

.toast.error {
  background: white;
  color: var(--color-danger);
  border: 1px solid rgba(255, 59, 48, 0.2);
}
.toast.error .toast-icon { background: rgba(255, 59, 48, 0.15); }

.toast.warning {
  background: white;
  color: var(--color-warning);
  border: 1px solid rgba(255, 149, 0, 0.2);
}
.toast.warning .toast-icon { background: rgba(255, 149, 0, 0.15); }

.toast.info {
  background: white;
  color: var(--color-primary);
  border: 1px solid rgba(0, 113, 227, 0.2);
}
.toast.info .toast-icon { background: rgba(0, 113, 227, 0.15); }

.toast-enter-active { animation: toast-in 0.3s ease; }
.toast-leave-active { animation: toast-in 0.25s ease reverse; }

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
