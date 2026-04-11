# 跨 Block Diff 实现方案

## 文档头

- 结构编码：`DE-M-R-06`
- 文档属性：`参考`
- 主责模块：`DE`
- 文档职责：`跨 Block Diff 实现方案 / 参考、研究或索引文档`
- 上游约束：`CORE-C-D-04`, `WS-M-D-01`, `AG-M-T-01`, `ED-M-T-01`, `DE-M-D-01`, `DE-M-T-01`
- 直接承接：无
- 接口耦合：`WS-M-D-01`, `ED-M-T-01`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`, `DE-M-D-01`, `DE-M-T-01`
- 扩散检查：`DE-M-P-01`, `DE-M-T-02`, `DE-X-L-01`
- 使用边界：`仅作参考，不直接替代主结构文档、协议文档和执行文档`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 与主控关系：对话编辑区间协议以 [R-DE-M-R-01_对话编辑-主控设计文档.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/R-DE-M-R-01_对话编辑-主控设计文档.md) 为主轴；区间关系、失效、接受规则以 [对话编辑-统一整合方案（待确认版）.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/对话编辑-统一整合方案（待确认版）.md) 为执行底稿。本文只定义跨 Block 区间的专项实现口径。

## 一、文档定位

本文只解决一个问题：

当一条 diff 跨越多个块时，前后端如何用同一套区间协议进行定位、抽取、校验、渲染与应用。

本文不再讨论：

- 单块 diff 的普通流程
- 旧 anchor 结构
- 旧 `edit_target.anchor`
- 旧按行 diff 或字符串 diff 的回退逻辑

---

## 二、统一区间协议

### 2.1 统一结构

跨 Block diff 与单块 diff 共用同一结构：

```ts
interface BlockRangeAnchor {
  startBlockId: string
  startOffset: number
  endBlockId: string
  endOffset: number
}
```

规则：

- 单块区间：`startBlockId === endBlockId`
- 跨块区间：`startBlockId !== endBlockId`
- `startOffset`、`endOffset` 都是各自块内的纯文本字符偏移

### 2.2 顺序规则

跨块区间必须满足：

- 起始块在文档顺序上位于结束块之前
- 若顺序颠倒，则该区间非法

---

## 三、文本抽取协议

### 3.1 统一抽取顺序

跨块 `originalText` 抽取顺序固定为：

1. 起始块取 `[startOffset, 起始块末尾]`
2. 中间完整块按文档顺序取全部纯文本
3. 结束块取 `[0, endOffset]`

若起止块相同，则退化为单块区间。

### 3.2 统一分隔语义

前后端必须使用同一文档顺序和同一块间连接语义。

约束：

- 不允许按视觉换行推断顺序
- 不允许按 DOM 偶然顺序拼接
- 不允许前后端各自定义不同的连接逻辑

### 3.3 `originalText` 校验

执行前校验时：

- 前端必须用与后端完全一致的抽取顺序重新获取当前区间文本
- 重新获取的当前文本等于 `originalText` 时，该 diff 才可执行

---

## 四、后端口径

### 4.1 Resolver 输出

后端输出 canonical diff 时：

- 单块和跨块统一输出 `startBlockId/startOffset/endBlockId/endOffset`
- 不为跨块引入额外专用字段

### 4.2 区间抽取

后端需要具备统一的跨块区间抽取能力：

```text
extract_block_range(html, startBlockId, startOffset, endBlockId, endOffset) -> string
```

该能力必须用于：

- 生成 `originalText`
- 生成执行前校验所需的区间语义

### 4.3 后端禁止做法

禁止：

- 将跨块 diff 强制切碎成多条部分重叠 diff
- 以全文字符串搜索替代跨块区间协议
- 因为跨块而自动降级成 `rewrite_document`

---

## 五、前端口径

### 5.1 区间解析

前端必须具备统一的跨块 PM 区间解析能力：

```ts
blockRangeToPMRange(
  doc,
  startBlockId,
  startOffset,
  endBlockId,
  endOffset
) => { from: number; to: number } | null
```

要求：

- 起止块都必须能找到
- 起止块顺序必须合法
- 单块和跨块共用同一入口

### 5.2 Decoration 渲染

跨块区间在 ProseMirror 中仍是连续区间。

规则：

- 一个跨块 diff 对应一个连续区间装饰
- 不按块拆成多张 diff 卡
- 不按块拆成多组互相重叠的装饰

### 5.3 执行

执行时：

- 用统一的区间解析能力得到 `{ from, to }`
- 用统一的 `originalText` 抽取能力做校验
- 校验通过后一次性应用替换

### 5.4 前端禁止做法

禁止：

- 用多次局部替换模拟一个跨块 diff
- 在前端把一条跨块 diff 拆成多条部分重叠 diff
- 前端自行修改跨块区间的抽取顺序

---

## 六、与区间关系规则的协作

### 6.1 共存规则

跨块 diff 进入 diff 池后，仍适用统一区间关系规则：

- 完全无交集：允许共存
- 完全包含：允许共存
- 部分重叠：禁止

### 6.2 完全包含场景

若一条新跨块 diff 完全包含一个旧 diff：

- 允许进入同池
- 倒序执行时，内容已变化的旧 diff 在执行阶段失效

### 6.3 失效规则

跨块 diff 的失效规则与单块 diff 相同：

- 目标内容已变
- 目标区间无法稳定解析
- 与其他 pending diff 形成非法部分重叠

不会因为以下原因单独失效：

- `revision` 前进
- baseline 刷新
- 无关块插入新块

---

## 七、选区与引用的输入对齐

### 7.1 选区

若用户选区跨块：

- 选区识别必须输出完整区间坐标
- 不得只保留起始块信息

### 7.2 精确引用

若用户复制并粘贴的是跨块内容：

- 精确引用标签必须保存完整区间坐标
- 不得退化为单块标签

### 7.3 零搜索对齐

跨块选区和跨块精确引用进入同一零搜索路径：

- 协议相同
- Resolver 入口相同
- 后续 diff 执行规则相同

---

## 八、实现边界

### 8.1 支持要求

跨 Block diff 属于正式能力，不是后续可选增强。

### 8.2 不允许的退路

不能因为实现复杂而采用以下退路：

- 统一降级成全文重写
- 强行切碎为多条部分重叠 diff
- 放弃 `originalText` 校验

### 8.3 唯一允许的降级

若跨块目标命中严格降级白名单且精确替换不能稳定执行：

- 只允许进入块级替换
- 不允许直接进入 `rewrite_document`

---

## 九、统一结论

1. 跨 Block diff 与单块 diff 共用同一套区间字段
2. `startOffset/endOffset` 永远是各自块内的纯文本字符偏移
3. 前后端必须按同一顺序抽取和校验 `originalText`
4. 跨块 diff 不允许拆成多条部分重叠 diff
5. 跨块 diff 的失效规则与单块 diff 完全一致
6. 跨块选区与跨块精确引用必须保留完整区间坐标
7. 跨 Block diff 是正式能力，不是延后能力