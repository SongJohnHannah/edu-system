<template><NModal :show="show" :mask-closable="true" :auto-focus="true" @update:show="$emit('update:show', $event)"><div class="office-modal-shell"><slot /></div></NModal></template>
<script setup>
import { NModal } from 'naive-ui'
defineProps({ show: Boolean })
defineEmits(['update:show'])
</script>
<style>
.office-modal-shell { width: min(94vw, 600px); margin: 24px auto; outline: none; }
.office-modal-shell > .modal { width: 100%; max-width: none; margin: 0; max-height: calc(100dvh - 48px); overflow-y: auto; box-sizing: border-box; }
.office-modal-shell .modal-actions { position: sticky; bottom: -24px; background: white; padding: 16px 0 4px; z-index: 2; }
.n-modal.detail-modal, .n-modal.move-modal, .n-modal.editor-modal { max-height: calc(100dvh - 40px); overflow-y: auto; margin: 20px auto; }
.n-modal .n-card__footer { position: sticky; bottom: 0; background: white; z-index: 2; }
@media (max-width: 599px) { .office-modal-shell { width: calc(100vw - 20px); margin: 10px auto; } .office-modal-shell > .modal { padding: 20px 16px; max-height: calc(100dvh - 20px); } }
</style>
