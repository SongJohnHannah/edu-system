<template>
  <Transition name="toast">
    <div class="toast" v-if="state.visible" :class="state.type">
      <span class="toast-icon">{{ iconMap[state.type] }}</span>
      <span class="toast-message">{{ state.message }}</span>
      <button class="toast-close" type="button" aria-label="关闭提示" title="关闭提示" @click="state.visible = false">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
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
  padding: 12px 16px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 5000;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  width: max-content; max-width: min(92vw, 560px); max-height: 70vh; overflow-y: auto;
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
.toast-message {
  flex: 1 1 auto;
  min-width: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
  text-align: left;
}

.toast-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: flex-start;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: var(--transition);
  -webkit-tap-highlight-color: transparent;
}

.toast-close:hover {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.toast-close:active { background: var(--color-selected); }
.toast-close:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.toast-close svg { pointer-events: none; }

.toast.success {
  background: white;
  color: var(--color-success);
  border: 1px solid rgba(53, 124, 101, 0.2);
}
.toast.success .toast-icon { background: rgba(53, 124, 101, 0.15); }

.toast.error {
  background: white;
  color: var(--color-danger);
  border: 1px solid rgba(179, 79, 80, 0.2);
}
.toast.error .toast-icon { background: rgba(179, 79, 80, 0.15); }

.toast.warning {
  background: white;
  color: var(--color-warning);
  border: 1px solid rgba(173, 108, 29, 0.2);
}
.toast.warning .toast-icon { background: rgba(173, 108, 29, 0.15); }

.toast.info {
  background: white;
  color: var(--color-primary);
  border: 1px solid rgba(65, 120, 185, 0.2);
}
.toast.info .toast-icon { background: rgba(65, 120, 185, 0.15); }

.toast-enter-active { animation: toast-in 0.3s ease; }
.toast-leave-active { animation: toast-in 0.25s ease reverse; }

@keyframes toast-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
