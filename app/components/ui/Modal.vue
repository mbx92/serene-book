<script setup>
const props = defineProps({ title: String, open: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
watch(() => props.open, async open => { await nextTick(); if (open) dialog.value?.showModal(); else dialog.value?.close() })
onMounted(() => { if (props.open) dialog.value?.showModal() })
</script><template><dialog ref="dialog" class="modal" @cancel.prevent="emit('close')" @click="e => { if (e.target === dialog) emit('close') }"><div class="modal-heading"><h2>{{ title }}</h2><button class="icon-button" aria-label="Tutup dialog" @click="emit('close')"><UiIcon name="close" /></button></div><slot v-if="open" /></dialog></template>