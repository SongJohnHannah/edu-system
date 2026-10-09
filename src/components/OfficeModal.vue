<template><NModal :show="show" :mask-closable="true" :auto-focus="true" @update:show="$emit('update:show', $event)"><div class="office-modal-shell"><slot /></div></NModal></template>
<script setup>
import { NModal } from 'naive-ui'
defineProps({ show: Boolean })
defineEmits(['update:show'])
</script>
<style>
.office-modal-shell { width: min(600px, calc(100vw - 48px)); margin: 24px auto; outline: none; }
.office-modal-shell.n-modal > .modal { width: 100%; max-width: none; margin: 0; max-height: calc(100dvh - 48px); overflow-y: auto; box-sizing: border-box; }
.office-modal-shell .modal-actions { position: sticky; bottom: -24px; background: white; padding: 16px 0 4px; z-index: 2; }
.n-modal.n-card { width: min(600px, calc(100vw - 48px)); max-width: min(600px, calc(100vw - 48px)); max-height: calc(100dvh - 48px); overflow-y: auto; margin: 24px auto; border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); }
.n-modal.n-dialog { width: min(440px, calc(100vw - 48px)); max-height: calc(100dvh - 48px); overflow-y: auto; }
.n-modal .n-card__footer { position: sticky; bottom: 0; background: white; z-index: 2; }
@media (max-width: 599px) {
  .office-modal-shell { width: calc(100vw - 20px); margin: 10px auto; }
  .office-modal-shell.n-modal > .modal { padding: 20px 16px; max-height: calc(100dvh - 20px); }
  .n-modal.n-card, .n-modal.n-dialog { width: calc(100vw - 20px); max-width: calc(100vw - 20px); max-height: calc(100dvh - 20px); margin: 10px auto; }
}
</style>
