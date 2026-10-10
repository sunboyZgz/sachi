---
flow:
  image: ./assets/illustration.png
  contour: ./assets/illustration-mask.json
  width: 180
  defaultX: 0.53
  defaultY: 54
---

这一份示例使用自己提供的轮廓文件。我们用四行归一化边界描述茶杯所在的位置，让每一行文字知道应该留下多少空间。它对应整张透明画布，而不是先裁切后剩下的物体。

手工轮廓的采样较粗，会比自动生成的细轮廓留出更宽一点的空白。图片本身仍是同一张，原来的比例和透明边距都不会改变。它适合需要自己控制留白的情况；没有这类需求时，省略 contour 更方便。

![使用手工轮廓的茶杯](./assets/illustration.png)

## 后续正文

这里只演示手工轮廓覆盖自动结果，不会把这个轮廓文件用于其他文章。
