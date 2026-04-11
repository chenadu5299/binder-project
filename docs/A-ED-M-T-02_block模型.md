# block模型

## 文档头

- 结构编码：`ED-M-T-02`
- 文档属性：`主结构`
- 主责模块：`ED`
- 文档职责：`block模型 / 模型、架构与机制主控`
- 上游约束：`CORE-C-D-04`, `SYS-C-T-01`, `WS-M-T-01`
- 直接承接：无
- 接口耦合：`WS-M-T-01`, `SYS-I-P-01`, `ENG-X-T-01`
- 汇聚影响：`CORE-C-R-01`, `ED-M-T-01`
- 扩散检查：`ED-M-T-03`, `ED-M-T-04`, `ED-M-T-05`, `ED-M-T-06`
- 使用边界：`定义技术模型、实现约束与关键机制，不承担产品边界裁定与排期管理`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 一、文档定位

本文定义编辑器系统的 Block 模型主规范，统一块对象、区间锚点、定位语义、Decoration 协作边界。  
本文是能力层模型文档，不替代具体插件/工具实现文档。

---

## 二、模型目标

1. 提供稳定的块级定位语义（供编辑、Diff、对话编辑共用）。  
2. 提供单块/跨块统一锚点协议。  
3. 提供与 Decoration 的职责边界，避免“渲染规则替代模型规则”。  

---

## 三、核心对象

## 3.1 Block

Block 是文档中的基础可定位单元，至少具备：
1. `blockId`（稳定标识）。  
2. `blockIndex`（当前文档顺序编号）。  
3. `blockType`（段落/标题/列表/表格等）。  
4. `textContent`（纯文本视图）。  

## 3.2 BlockRangeAnchor

统一锚点结构（单块与跨块共用）：

```ts
interface BlockRangeAnchor {
  startBlockId: string
  startOffset: number
  endBlockId: string
  endOffset: number
}
```

语义：
1. 偏移均为各自块内纯文本字符偏移。  
2. 单块：`startBlockId === endBlockId`。  
3. 跨块：`startBlockId !== endBlockId`。  

---

## 四、区间与顺序规则

1. 起始块必须在文档顺序上不晚于结束块。  
2. 反向区间为非法区间。  
3. 跨块文本抽取顺序固定：  
起始块尾段 -> 中间完整块 -> 结束块头段。  
4. 单块与跨块共享同一校验链，不得分叉。  

---

## 五、与 Decoration 的边界

1. Block 模型负责“语义定位与区间规则”。  
2. Decoration 负责“视觉呈现与交互反馈”。  
3. Decoration 不得改变 Block 语义结果。  
4. 任何可执行区间必须先通过 Block 模型校验，再进入 Decoration 渲染。  

---

## 六、与 Diff 的协作

1. Diff 的 `startBlockId/endBlockId/startOffset/endOffset` 直接依赖 Block 模型。  
2. originalText 校验必须使用 Block 模型定义的抽取顺序。  
3. 跨块 diff 不得拆成多条部分重叠 diff。  
4. 批量执行时仍遵循统一区间关系规则（无交集/完全包含）。  

---

## 七、与编辑执行的协作

1. `blockRangeToPMRange`（或等价函数）是从 Block 锚点到编辑器 range 的统一入口。  
2. 执行替换必须在统一 range 上一次完成，不做多次模拟替换。  
3. 解析失败属于区间不可执行，不得静默改走全文重写。  

---

## 八、禁用清单

1. 禁止用全文字符串搜索替代 block range 协议。  
2. 禁止前后端各自定义不同抽取顺序。  
3. 禁止把跨块能力降级为“可选能力”。  
4. 禁止让 Decoration 规则反向定义 Block 语义。  

---

## 九、MVP 验收口径

1. 单块/跨块区间都可稳定解析。  
2. Block 锚点到编辑器 range 映射稳定。  
3. originalText 抽取与校验前后端一致。  
4. 与 A-DE-M-T-01_diff系统规则.md、A-ED-M-T-01_编辑器架构.md无语义冲突。  

---

## 十、关联文档

1. `A-ED-M-T-01_编辑器架构.md`  
2. `A-DE-M-T-01_diff系统规则.md`  
3. `R-DE-M-R-06_跨 Block Diff 实现方案.md`  
4. `R-ED-M-R-22_ProseMirror Decoration.md`  
5. `R-DE-M-R-01_对话编辑-主控设计文档.md`  