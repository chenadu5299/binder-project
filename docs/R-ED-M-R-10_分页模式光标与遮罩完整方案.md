# 分页模式光标与遮罩完整方案

## 文档头

- 结构编码：`ED-M-R-10`
- 文档属性：`参考`
- 主责模块：`ED`
- 文档职责：`分页模式光标与遮罩完整方案 / 参考、研究或索引文档`
- 上游约束：`CORE-C-D-04`, `SYS-C-T-01`, `WS-M-T-01`, `ED-M-T-01`
- 直接承接：无
- 接口耦合：`WS-M-T-01`, `SYS-I-P-01`, `ENG-X-T-01`
- 汇聚影响：`CORE-C-R-01`, `ED-M-T-01`
- 扩散检查：`ED-M-T-02`, `ED-M-T-03`, `ED-M-T-04`, `ED-M-T-05`, `ED-M-T-06`
- 使用边界：`仅作参考，不直接替代主结构文档、协议文档和执行文档`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 分页模式下，跨页长光标会露出。本方案通过「全篇模拟光标」与「上下遮罩」两种手段解决该问题。

---

## 一、问题概述

在 T-DOCX 分页编辑模式下，浏览器原生光标会随行高延伸，跨页时在页顶、页底、分割缝等区域露出，影响视觉。需从两个方向处理：

| 场景 | 现象 | 解决手段 |
|------|------|----------|
| **光标态** | 原生光标可能跨页露出 | 隐藏原生光标 + 全篇模拟光标 |
| **页底/分割缝** | 光标跨页延伸到底部空白、页脚、分割缝 | 白色遮罩覆盖 |

---

## 二、方案架构

### 2.1 整体关系

```
┌─────────────────────────────────────────────────────────────┐
│  分页模式光标与遮罩方案                                        │
├─────────────────────────────────────────────────────────────┤
│  方案 A：全篇模拟光标（PageTopCaretExtension）                    │
│  - 分页模式 + 光标态：隐藏原生，显示 div.rm-page-top-caret（文档任意位置） │
│  - 挂载到 scrollContainer ?? body                             │
├─────────────────────────────────────────────────────────────┤
│  方案 B：遮罩（PaginationPlus 内置）                            │
│  - maskTop：覆盖下一页内容区顶部（含半行距）                     │
│  - maskBottom：覆盖上一页内容区底部                             │
│  - 页底遮罩：文档顺序 + 高度累加，或 fallback 固定值             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 与现有方案的关系

| 方案 | 关系 |
|------|------|
| 全篇模拟光标 | 独立，不依赖遮罩 |
| 页底遮罩 | 独立，不依赖模拟光标 |
| PaginationPlus 遮罩 | 模拟光标不依赖 mask 判定，仅依赖分页 DOM 存在 |

---

## 三、方案 A：全篇模拟光标（隐藏原生 + 模拟）

### 3.1 策略

| 状态 | 原生光标 | 模拟光标 |
|------|----------|----------|
| 分页模式 + 光标态（无选区） | 隐藏（`caret-color: transparent`） | 显示 |
| 分页模式 + 有选区 | 隐藏 | 隐藏 |
| 分页模式 + 失焦 | 隐藏 | 隐藏 |
| 流式布局 | 正常 | 不启用 |

### 3.2 实现方式

- **扩展**：`PageTopCaretExtension.ts`
- **范围**：全篇模拟（光标在文档任意位置时均显示模拟光标，非仅首行）
- **启用条件**：存在分页 DOM（`rm-with-pagination` 或 `[data-rm-pagination]`）
- **模拟光标**：`div.rm-page-top-caret`，`position: fixed`
- **挂载容器**：优先挂载到**编辑器滚动容器**（`getScrollContainer(view.dom)`），若无则 `document.body`。挂载到滚动容器可保持与内容同一层叠上下文，滚动时被工具栏正确遮挡。

### 3.3 核心逻辑

**原生光标隐藏**：通过 `data-caret-at-page-top` 控制（命名沿袭历史，实际为全篇光标态）

```css
.ProseMirror.rm-with-pagination[data-caret-at-page-top="true"] {
  caret-color: transparent;
}
```

**模拟光标位置与尺寸**：

```ts
const rect = view.coordsAtPos(selection.from);
const scale = getScaleFactor(view.dom);
const width = Math.max(0.5, 2 * scale);
const height = rect.bottom - rect.top;
// 设置 left, top, width, height
```

**挂载容器**：

```ts
const scrollContainer = getScrollContainer(view.dom);
const mountParent = scrollContainer ?? document.body;
mountParent.appendChild(simulatedCaret);
```

- `getScrollContainer`：从 `view.dom` 向上递归查找 `overflow-y: auto | scroll | overlay` 的祖先
- 目的：模拟光标与内容在同一层叠上下文，滚动时被工具栏遮挡

### 3.4 更新触发

| 事件 | 处理 |
|------|------|
| `selectionUpdate`、`transaction`、`blur` | `scheduleUpdate` |
| `scroll`（滚动容器） | `scheduleUpdate` |
| `ResizeObserver`（view.dom） | `scheduleUpdate` |
| 初始化 | `setTimeout(scheduleUpdate, 100)` |

### 3.5 生命周期

- **销毁判断**：`const isDestroyed = () => !simRef?.parentNode`（避免 React Strict Mode / HMR 时序问题）
- **清理**：`onDestroy` 中移除事件监听、ResizeObserver、从 DOM 移除 simulatedCaret

### 3.6 与缩放实现的依赖关系

当前缩放使用 **transform: scale**（非 CSS zoom），外层 `width=794*(zoom/100)` 使 scrollWidth 正确。该方案下：

- `getScaleFactor` 依赖 `rect.width`（含 transform）与 `offsetWidth`（不含 transform）的比值，能正确反映缩放
- `coordsAtPos` 返回视口坐标，与 `position: fixed` 一致
- 模拟光标挂载到 `editor-zoom-scroll`（无 transform），层叠与滚动行为正确

### 3.7 影响光标方案效果的改动清单

以下改动可能破坏模拟光标的位置、尺寸或显示，修改时需回归验证：

| 类别 | 改动 | 影响 |
|------|------|------|
| **缩放实现** | 改用 CSS zoom 替代 transform: scale | `getScaleFactor`、`coordsAtPos` 在 zoom 下行为可能不一致；zoom 可能为 fixed 创建新 containing block |
| **滚动容器** | 滚动从 editor-zoom-scroll 改到 EditorContent 等 | 挂载点变化，可能浮在工具栏上方或与内容不同步 |
| **EditorContent overflow** | 分页模式下改为 overflow-y-auto 等 | getScrollContainer 会找到 EditorContent，挂载点与层叠关系改变 |
| **DOM 层级** | 调整 editor-zoom-scroll 的父/子结构 | 影响 getScrollContainer 查找、transform 应用位置 |
| **transform 位置** | 将 transform: scale 移到 editor-zoom-scroll 上 | 为 fixed 创建新 containing block，坐标系统改变 |
| **z-index** | 修改 .rm-page-top-caret 的 z-index 或工具栏层级 | 可能被遮挡或遮挡其他元素 |
| **CSS 选择器** | 修改 `[data-caret-at-page-top="true"]` 或 `.rm-with-pagination` | 原生光标隐藏失效或误触发 |
| **启用条件** | 移除 `rm-with-pagination` 或 `[data-rm-pagination]` | 扩展不启用 |
| **ProseMirror 升级** | 升级 TipTap/ProseMirror | `coordsAtPos` 行为可能变化 |

---

## 四、方案 B：遮罩（页顶 + 页底）

### 4.1 DOM 结构

```
.breaker
├── pageFooter
├── .rm-caret-mask-wrapper
│   ├── .rm-caret-mask-bottom  ← 覆盖上一页下边缘（gap 上方）
│   ├── .rm-pagination-gap     ← 分割缝
│   └── .rm-caret-mask-top     ← 覆盖下一页上边缘（gap 下方）
└── pageHeader
```

- maskBottom：`bottom: 100%`，底边对齐 gap 顶部，向上延伸
- maskTop：`top: 100%`，顶边对齐 gap 底部，向下延伸
- 遮罩不覆盖分割缝，分割缝保持灰色可见

### 4.2 高度公式

**页顶遮罩**（含首行半行距）：

```
maskTop = contentMarginTop + marginTop + halfLeading
halfLeading = max(0, (lineHeight - fontSize) / 2)  // 从首行内容块 getComputedStyle 获取
```

**页底遮罩**（固定公式）：

```
maskBottom = contentMarginBottom + marginBottom
```

**页底遮罩（方案 B 动态）**：当存在 page→block 映射时，可精确计算：

```
maskHeight = pageHeight − pageTop − contentHeightOnPage
```

- `contentHeightOnPage`：该页内容块高度之和，通过**文档顺序 + 高度累加**得到
- 若无映射或计算失败，使用 fallback（105px）

### 4.3 高度影响因素

| 因子 | 用户可调？ | 说明 |
|------|------------|------|
| marginTop / marginBottom | ✅ 页边距弹窗 | 页眉/页脚 padding |
| contentMarginTop / contentMarginBottom | ❌ | 页眉页脚与内容区间距 |
| halfLeading | ❌ 自动计算 | 首行半行距，由 line-height、font-size 决定 |

### 4.4 实现要点

- 页顶遮罩：`computeCaretMaskTopHeight`，注入 `--rm-caret-mask-top-height`
- 页底遮罩：`computeCaretMaskBottomHeight` 或 `computePerPageMaskBottomHeights`，注入或内联 `style.height`
- 调用时机：`view.update` 中防抖 120ms 后执行

---

## 五、相关代码位置

| 功能 | 文件 |
|------|------|
| 全篇模拟光标扩展 | `src/components/Editor/extensions/PageTopCaretExtension.ts` |
| 模拟光标样式 | `src/index.css`（`.rm-page-top-caret`、`data-caret-at-page-top`） |
| 遮罩变量与计算 | `tiptap-pagination-plus/utils.ts`（`computeCaretMaskTopHeight`、`computeCaretMaskBottomHeight`、`computePerPageMaskBottomHeights`） |
| 遮罩应用 | `tiptap-pagination-plus/PaginationPlus.ts` |

---

## 六、版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.1 | 2025-02 | 补充 3.6 与缩放实现的依赖关系、3.7 影响光标方案效果的改动清单 |
| v1.2 | 2025-02 | 明确方案 A 为全篇模拟光标（非仅首行），清理首行相关表述 |
| v1.0 | 2025-02 | 整合页首行光标方案、页底遮罩方案、遮罩设计、遮罩逻辑与数值说明、遮罩高度影响因素分析、遮罩问题深度分析、页底遮罩方案B逻辑检查报告；删除冗余文档 |