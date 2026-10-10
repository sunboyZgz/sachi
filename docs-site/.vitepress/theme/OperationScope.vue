<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

const { frontmatter } = useData();
const labels: Record<string, string> = {
  local: '本地写作', read: '检查 / 查询', public: '公开版本操作',
  backup: '写作备份 / 恢复', global: '全站资源', config: '配置', reference: '参数参考',
};
const label = computed(() => labels[frontmatter.value.scope] ?? '操作指南');
</script>

<template>
  <aside v-if="frontmatter.scope" class="operation-scope" aria-label="操作影响范围">
    <span class="scope-label">{{ label }}</span>
    <dl>
      <div><dt>本地文件</dt><dd>{{ frontmatter.files ?? '不修改正文' }}</dd></div>
      <div><dt>网络连接</dt><dd>{{ frontmatter.network ?? '不需要' }}</dd></div>
      <div><dt>公开网站</dt><dd>{{ frontmatter.online ?? '不改变' }}</dd></div>
    </dl>
  </aside>
</template>
