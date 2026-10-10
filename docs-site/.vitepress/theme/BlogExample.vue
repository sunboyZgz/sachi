<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { data } from '../examples.data';

const props = defineProps<{ example: string }>();
const sample = computed(() => data.examples[props.example]);
const frame = ref<HTMLIFrameElement>();
const notice = ref('');
let mounted = false;
let pending = false;
let dispose: (() => void) | undefined;
const documentSource = computed(() => {
  if (!sample.value) throw new Error(`未知 Markdown 教学示例：${props.example}`);
  const style = `${data.css}\nbody{padding:24px 18px;display:flow-root}video{width:100%;height:auto}.article-prose>:first-child{margin-top:0}.example-no-js .flow-controls{display:none}@media(max-width:600px){body{padding:18px 14px}}`;
  return `<!doctype html><html lang="zh-CN" class="example-no-js"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style.replace(/<\/style/gi, '<\\/style')}</style></head><body data-example="${sample.value.id}"><main id="example-reading" class="article-prose">${sample.value.html}</main></body></html>`;
});

async function enhance() {
  if (!mounted || pending || dispose || frame.value?.contentDocument?.body?.dataset.example !== sample.value.id) return;
  pending = true;
  try {
    const { mountExample } = await import('../example-client');
    if (mounted && frame.value?.contentDocument?.body?.dataset.example === sample.value.id) dispose = mountExample(frame.value, sample.value.input);
  } catch { notice.value = '交互组件未能加载；下方保留完整的普通排版预览。'; }
  finally { pending = false; }
}
onMounted(() => { mounted = true; void enhance(); });
onBeforeUnmount(() => { mounted = false; dispose?.(); });
</script>

<template>
  <section class="blog-example" :data-example="example" :aria-label="`${sample.title}生成效果`">
    <div class="blog-example-label"><span>{{ sample.input.cover ? '效果示意' : '生成效果' }}</span><span>{{ sample.input.cover ? '栏目重点条目示意 · 教学素材' : '博客实际阅读组件 · 教学素材' }}</span></div>
    <!-- This isolates styles/anchors, not untrusted content: every input is a checked teaching fixture. -->
    <iframe ref="frame" :title="`${sample.title}效果预览`" :srcdoc="documentSource" :style="{ height: `${sample.expectedHeight}px` }" loading="lazy" @load="enhance" />
    <p v-if="notice" class="blog-example-notice" role="status">{{ notice }}</p>
  </section>
</template>
