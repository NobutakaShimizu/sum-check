<script setup lang="ts">
import { computed } from 'vue'
import { renderTex } from './renderTex'

const props = withDefaults(defineProps<{
  tex: string
  display?: boolean
}>(), {
  display: false,
})

const html = computed(() => renderTex(props.tex, props.display))
</script>

<template>
  <span class="math" v-html="html" />
</template>
