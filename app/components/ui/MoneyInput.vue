<script setup>
import { formatMoneyInput, parseMoneyInput } from '#shared/utils/money-input.js'
const props = defineProps({ modelValue: { type: [Number, String], default: null }, min: { type: [Number, String], default: 0 }, max: { type: [Number, String], default: 1000000000 }, required: Boolean })
const emit = defineEmits(['update:modelValue'])
const input = ref(null)
const display = ref(formatMoneyInput(props.modelValue))
const parsed = computed(() => parseMoneyInput(display.value))
const validation = computed(() => {
  if (!parsed.value.valid) return 'Masukkan nominal rupiah yang valid, maksimal 2 angka desimal.'
  if (parsed.value.amount === null) return ''
  if (parsed.value.amount < Number(props.min)) return 'Nominal minimal ' + formatMoneyInput(props.min) + ' rupiah.'
  if (parsed.value.amount > Number(props.max)) return 'Nominal maksimal ' + formatMoneyInput(props.max) + ' rupiah.'
  return ''
})
watch(() => props.modelValue, value => {
  const amount = value === '' || value === null || value === undefined ? null : Number(value)
  if (amount !== parsed.value.amount) display.value = formatMoneyInput(value)
})
watchEffect(() => { input.value?.setCustomValidity(validation.value) })
async function onInput(event) {
  const element = event.target
  const raw = element.value
  const caret = element.selectionStart ?? raw.length
  const result = parseMoneyInput(raw)
  let before = raw.slice(0, caret)
  if (result.valid && result.text.includes(',') && !raw.includes(',')) before = before.replace('.', ',')
  const meaningful = before.replace(/[^\d,]/g, '').length
  display.value = result.text
  element.value = result.text
  emit('update:modelValue', result.amount)
  if (!result.valid) return
  let position = 0, seen = 0
  while (position < result.text.length && seen < meaningful) {
    if (/[\d,]/.test(result.text[position])) seen++
    position++
  }
  await nextTick()
  if (document.activeElement === element) element.setSelectionRange(position, position)
}
</script>
<template><input ref="input" type="text" inputmode="decimal" :value="display" :required="required" :aria-invalid="validation?true:undefined" @input="onInput" /></template>
