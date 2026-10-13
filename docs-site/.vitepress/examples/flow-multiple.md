---
flow:
  - image: ./assets/illustration.png
    width: 180
    defaultX: 0.53
    defaultY: 20
  - image: ./assets/desk.png
    width: 240
    defaultX: 0.5
    defaultY: 20
---

![透明插画](./assets/illustration.png)

::开头不需要标题，独立图片旁的这一段文字会自动参与环绕。透明画布保持完整，文字沿着插画的边缘展开，写完这一段也可以继续分段。

第二段仍然在同一区域。空行只改变段落间距，不会结束环绕，也不需要任何专用的开始或结束标记。

#### 另一个局部区域

这里是第二张图片之前的文字。这次使用四级标题分隔区域，而图片使用引用式写法，定义可以放在文末。

![桌面示意][desk]

图片后的文字继续参与同一处环绕。不透明图片采用矩形轮廓，显示宽度独立设置为 240px。

---

这里的 **富文本** 和后续正文采用普通 Markdown。

[desk]: ./assets/desk.png
