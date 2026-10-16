---
title: 替换站点头像
scope: global
files: 个人资料引用、本地保护副本与头像预览缓存
network: 保存到 Yandu 时需要连接
online: 发布后改变；只上传不会上线
---

# 替换站点头像

## 什么时候用

为首页、目录和文章末署名选择头像。头部与半身用途继续保持，Yandu 保存原图和展示版本，个人资料引用具体对象及版本。

## 开始前

先[配置 Yandu](/setup/yandu)并加载本地上传凭证。准备头部、半身图片，建议使用透明背景。原 `src/assets/avatar/avatar-head.png` 与 `avatar-half.png` 保留作未迁移回退和历史版本，迁移时不覆盖或删除。

## 操作步骤

1. 使用原本地 CLI 向导中的「Yandu 存储」→「选择并上传个人头像」，或直接指定用途和本地原图：

   ```sh
   npm run blog -- storage avatar head --file ./head.png --dry-run
   npm run blog -- storage avatar head --file ./head.png --yes
   npm run blog -- storage avatar half --file ./half.png --yes
   ```

   命令先保存原件保护副本，上传原图和展示 PNG；Yandu READY 后回读核验摘要，再更新 `src/config/profile.json.avatars.head/half`。仅选文件、字节传输完毕或 HTTP 成功都不表示保存完成。

2. 检查日常与编辑器预览，保留原展示位置：

   ```sh
   npm run dev
   ```

   首页、目录使用头部头像，正文结束使用半身头像。文章首屏、栏目分页和共享页头不新增头像。任一用途尚未选择时继续使用原静态头像。

3. 同步私有个人资料，保留可恢复历史：

   ```sh
   npm run blog -- storage sync --yes
   npm run blog -- storage status
   ```

   原图和旧版本留在 Yandu，本地旧资料位于 `.blog-store/profile-history/`。`public/media/profile/` 只是日常预览缓存，编辑器允许读取该目录；它不直接复制到正式构建。

4. 按[全站基线](/release/baseline)查看冻结计划并发布：

   ```sh
   npm run blog -- publish <文章> --dry-run
   ```

   构建读取冻结个人资料，将精确头像版本加入资源清单。接受基线后发布，资源代理才授权匿名读取。旧发布和回滚继续引用原头像版本。

## 确认结果

个人资料头像引用包含项目、对象、版本、SHA256、类型、大小和尺寸；日常与编辑器预览可显示本地缓存，正式页面使用 HTTPS 同站资源代理。只选 head 或 half 也可构建，另一用途保留回退。

## 影响与取消

头像属于全站资料基线。变更保留原图和旧资料；整站回滚同步恢复头像版本。删除 Yandu 对象或父目录会影响历史读取，保留所有被保留发布版本引用的对象。

## 常见问题

断网可继续本地编辑，已上传失败时保留原件与意图，恢复网络后重试。本地新头像不自动更新线上；不要修改 out 伪装源资料更新。若丢失预览缓存，从 Yandu 私有检查点恢复到新目录后重新核对。

## 参数方式

[storage avatar 参数](/reference/commands/storage) · [配置个人信息](/setup/profile)
