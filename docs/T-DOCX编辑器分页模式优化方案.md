# T-DOCX 编辑器分页模式优化方案

## 文档信息
- **版本**：v1.2
- **创建日期**：2025-02
- **更新日期**：2025-03
- **状态**：✅ 方案 E 已实现
- **目标**：将 T-DOCX 文件（应用模拟的 docx 文件）的编辑器改造为 Word 风格的分页编辑样式

> **当前实现说明**：详见 `分页功能说明.md`

---

## 〇、当前实现状态（2025-03 更新）

**已采用方案 E：tiptap-pagination-plus 开源库 + 定制**

| 功能 | 状态 | 说明 |
|------|------|------|
| 分页扩展 | ✅ | `tiptap-pagination-plus` 已接入，T-DOCX 编辑时 `layoutMode=page` |
| 页码导航 | ✅ | 简化显示在工具栏内（◀ 当前页/总页数 ▶），多页时显示；当前页随滚动实时更新 |
| 页面尺寸 | ✅ | PageSizeDropdown：A4/A3/Letter 竖排/横排 |
| 页边距 | ✅ | MarginsModal：上下、左右边距可调 |
| 编辑窗口缩放 | ✅ | 工具栏 50%-150% 缩放，使用 transform scale，width=794*(zoom/100) 使 scrollWidth 正确，支持横向滚动；窗口内横向居中 |
| 背景色 | ✅ | A4 纸内部白色，外部/页缝淡灰 `#f0f0f0` |
| 聚焦灰框 | ✅ | 已移除 ProseMirror 聚焦时的 outline/border |
| 文字遮挡修复 | ✅ | 容器 `overflow-visible`、EditorContent 无水平 padding，详见分页布局逻辑梳理 |

**关键代码路径**：
- `TipTapEditor.tsx`：`layoutMode`、`PaginationPlus`、`editorZoom`
- `EditorToolbar.tsx`：`usePaginationFromEditor`、缩放按钮、页码
- `EditorPanel.tsx`：zoom 容器、T-DOCX 淡灰背景
- `index.css`：`.rm-with-pagination` 白色、`.ProseMirror` 无 outline
- `layoutStore`：`editor.zoom`

**布局与容器方案**（详见 `docs/分页布局逻辑梳理.md`）：
- 纸张宽度固定（794px），编辑窗口可变宽，中间容器必须 `overflow-visible`，否则文字被遮挡
- TipTapEditor 包装 div 使用 `overflow-visible`，由上层 `editor-zoom-scroll` 提供滚动
- 分页模式下 EditorContent 使用 `py-4 px-0`，无水平 padding，避免与页边距叠加
- 当前页检测：`usePaginationFromEditor` 从 `editor.view.dom` 向上找第一个 `overflow-y: auto/scroll` 的祖先作为滚动容器，根据视口中心与 `.rm-page-break` 位置计算当前页

---

## 一、当前实现检查

### 1.1 编辑器架构概览

```
EditorPanel
├── EditorTabs（标签页栏）
├── EditorToolbar（工具栏）
├── 内容区域
│   ├── DOCX 只读 → DocxPdfPreview（PDF 预览）
│   ├── DOCX 编辑 → TipTapEditor（与 md/html/txt 共用同一组件）
│   ├── md/html/txt → TipTapEditor
│   └── 其他类型 → 各自预览组件
└── EditorStatusBar
```

### 1.2 TipTapEditor 样式（T-DOCX 分页模式）

| 属性 | 当前值 | 说明 |
|-----|--------|------|
| 布局模式 | `layoutMode: 'page' \| 'flow'` | T-DOCX 编辑时 `page`，其他为 `flow` |
| 分页扩展 | PaginationPlus | A4 尺寸 794×1123px，页缝淡灰 |
| 纸张内部 | 白色 `#ffffff` | `.rm-with-pagination` |
| 外部/页缝 | 淡灰 `#f0f0f0` | zoom 容器、pageBreakBackground |
| 页码 | 半透明、仅屏幕 | 每页右下角，不可编辑/保存/打印，`index.css` |
| 缩放 | 50%-150% | layoutStore.editor.zoom，滚动条固定 |

### 1.3 T-DOCX 文件识别

**定义**：应用内可编辑的 DOCX 格式文档，包括：
- `.docx`（新建、AI 生成、或通过编辑进入的草稿）
- `.draft.docx`（外部导入后创建的草稿副本）
- `.doc`、`.odt`、`.rtf`（通过 Pandoc 转换，统一按 docx 处理）

**识别逻辑**：
- `EditorPanel.getFileType()`：`docx/doc/odt/rtf` → `'docx'`
- `useAutoComplete.getDocumentFormat()`：`docx/draft` → `'t-docx'`

**编辑模式入口**：
- `EditorPanel.tsx`：`fileType === 'docx' && !activeTab.isReadOnly` 时渲染 TipTapEditor（layoutMode='page'）

### 1.4 现有相关能力

- **PageNavigator**：已集成到 EditorToolbar，T-DOCX 多页时显示简化页码（◀ 1/9 ▶）
- **usePaginationFromEditor**：从 PaginationPlus DOM 获取 currentPage、totalPages、scrollToPage
- **ProseMirror/TipTap**：基于 ProseMirror，支持自定义 Node、Decoration、Plugin
- **布局**：MainLayout 支持文件树、编辑区、聊天区宽度调节，编辑区宽度可变

---

## 二、需求归纳

| 需求项 | 说明 |
|--------|------|
| 限定宽度 | 仅限定**输入区域**宽度，不限定窗口宽度；窗口仍可调节 |
| 分块高度 | 按「页」分块，模拟 Word 一页一页的视觉效果 |
| 作用范围 | **仅** T-DOCX 文件（docx/doc/odt/rtf 在编辑模式下） |
| 其他类型 | md、html、txt 保持现有流式布局，不受影响 |

---

## 三、可行方案

### 方案 A：纯 CSS 模拟分页（推荐起步）

**思路**：用 CSS 固定页面尺寸和分页视觉效果，内容仍为单一 ProseMirror 文档。

**实现要点**：
1. 为 T-DOCX 创建独立包装组件 `DocxPageEditor`，或通过 `fileType` 切换 TipTapEditor 的包装样式
2. 输入区域固定宽度：例如 A4 宽度 `210mm` 或 `794px`（96dpi），居中
3. 使用 `min-height` + `box-shadow` 或 `border` 模拟每页高度（如 A4 高度 `297mm`）
4. 通过 `page-break-after` 或 `margin-bottom` 制造「页」的视觉分隔

**优点**：实现简单、不涉及数据模型变更、兼容现有逻辑
**缺点**：分页为视觉模拟，非真实文档页；打印需额外处理
**适用**：作为 MVP，快速上线 Word 观感

---

### 方案 B：TipTap Pages 扩展（商业方案）

**思路**：使用 TipTap 官方的 Pages 扩展（Team 计划）。

**特点**：
- 内置 A4、A3、A5、Letter 等页面格式
- 支持页边距、页眉页脚、页码
- 真正的分页布局，非纯 CSS 模拟

**优点**：功能完整、与 TipTap 深度集成
**缺点**：需付费订阅 Team 计划
**适用**：若已有或计划购买 TipTap Team

---

### 方案 C：自定义 ProseMirror 分页插件

**思路**：基于 ProseMirror Plugin 计算分页位置，用 Decoration 绘制分页线，或插入虚拟「页」节点。

**实现要点**：
1. 新建 Plugin：根据容器宽度、行高、块级元素高度计算每页可容纳内容
2. 在计算出的位置插入 Decoration（如分隔线、背景色块）
3. 或：定义 `pageBreak` Node，在文档中插入分页符，渲染为独立「页」块
4. 滚动时可选：吸附到「页」边界（类似 Word 的整页滚动）

**优点**：完全可控，可自定义分页规则（A4、Letter、自定义尺寸）
**缺点**：开发成本高，需处理表格、图片跨页等复杂情况
**适用**：对分页精度和打印还原要求高的场景

---

### 方案 D：虚拟化分页容器

**思路**：将 ProseMirror 的可见区域切分为多个「页」容器，每页固定高度，内容按页分配到不同容器。

**实现要点**：
1. 定义固定页高（如 297mm），多页纵向排列
2. 使用 `contenteditable` 的 `designMode` 或类似方案，或保持单编辑器 + 多占位容器
3. 难点：ProseMirror 单文档模型，跨「页」的选区、光标需要额外处理

**优点**：每页真实隔离，便于后续做页眉页脚、独立样式
**缺点**：与 ProseMirror 单文档模型冲突，实现复杂度高
**适用**：仅作技术储备，短期不推荐

---

### 方案 E：开源分页库 + 定制

**思路**：使用如 `tiptap-pagination-breaks` 等开源方案，再按业务定制。

**实现要点**：
1. 引入 `tiptap-pagination-breaks` 或类似库
2. 配置页面尺寸、边距
3. 在 T-DOCX 模式下启用，其他文件类型禁用
4. 根据实际效果做样式和交互微调

**优点**：有现成实现，可缩短开发周期
**缺点**：依赖第三方维护，可能需 fork 适配
**适用**：希望快速实现且能接受一定定制成本

---

## 四、方案对比与建议

| 方案 | 开发量 | 效果 | 维护成本 | 推荐度 |
|------|--------|------|----------|--------|
| A 纯 CSS | 低 | 中等（视觉模拟） | 低 | ⭐⭐⭐⭐⭐ 起步首选 |
| B TipTap Pages | 低 | 高 | 低（付费） | ⭐⭐⭐⭐ 有预算时 |
| C 自定义插件 | 高 | 高 | 中 | ⭐⭐⭐ 长期可选 |
| D 虚拟化容器 | 很高 | 高 | 高 | ⭐⭐ 仅作探索 |
| E 开源库 | 中 | 中高 | 中 | ⭐⭐⭐ 折中方案 |

**推荐路径**：
1. ~~**第一阶段**：采用方案 A~~ → **已采用方案 E**（tiptap-pagination-plus）
2. **第二阶段**：可选增强（分页符、打印优化、页眉页脚）
3. **第三阶段**：若对打印、精确分页要求高，再考虑方案 C 自研

---

## 五、项目拆解与细化（历史参考）

> **说明**：以下为方案 A 阶段的任务拆解，当前已采用方案 E（tiptap-pagination-plus），上述任务已由实现替代，无需执行。保留供理解方案演进与稳定性原则参考。

- **阶段一**：T-DOCX 模式识别、宽度限定、CSS 分页、样式与主题、滚动与导航 → 已由方案 E 实现
- **阶段二**：页面尺寸与边距、分页符、打印优化 → 页面尺寸与边距已实现；分页符、打印为后续可选
- **阶段三**：精确分页、页眉页脚 → 后续可选

---

## 六、技术实现要点

### 6.1 文件与职责划分（方案 E 已实现）

```
src/components/Editor/
├── TipTapEditor.tsx          # layoutMode、PaginationPlus、editorZoom
├── EditorToolbar.tsx         # 页码导航、缩放按钮
├── EditorPanel.tsx           # zoom 容器、T-DOCX 淡灰背景
src/hooks/
├── usePaginationFromEditor.ts  # 页码/滚动
index.css                     # .rm-with-pagination 白色、ProseMirror 无 outline
```

### 6.2 稳定性原则（方案 A/E 通用）

- **单文档**：ProseMirror 内容在一棵连续 DOM 树中，无分页 div 包裹
- **分页仅作视觉**：用背景、渐变或扩展实现，不改变内容 DOM
- **单一滚动**：由 `editor-zoom-scroll` 统一处理
- **禁止 overflow: hidden 裁切**：不裁切任何文本或图片

当前实现由 tiptap-pagination-plus 负责分页渲染，布局详见 `分页布局逻辑梳理.md`。

### 6.3 与现有组件的集成点

| 组件 | 集成方式 |
|------|----------|
| EditorPanel | 根据 `fileType === 'docx' && !isReadOnly` 渲染 DocxPageEditor 包裹 TipTapEditor |
| TipTapEditor | 新增 `layoutMode`、`pageWidth` 等可选 props，或由父组件通过 className 控制 |
| EditorToolbar | 在 T-DOCX 模式下可增加「插入分页符」等按钮 |
| InlineAssistPanel | 确保在分页布局下定位正确 |
| DiffHighlightExtension | 确保高亮在分页布局下正确显示 |

---

## 七、方案 A 稳定性深度分析（重要）

> 针对以往尝试中出现的**文本展示丢失**、**光标无法丝滑换页**、**图片展示异常**等问题，本节分析根因并给出稳定实现原则。

### 7.1 问题根因分析

#### 问题 1：文本展示丢失

| 可能根因 | 说明 | 典型错误做法 |
|----------|------|--------------|
| **overflow: hidden 裁切** | 在「页」容器上使用 `overflow: hidden` 或固定 `height`，超出部分被裁切 | `.t-docx-editor-page { height: 1122px; overflow: hidden; }` |
| **将内容拆入多个容器** | 用 JS 把内容按高度拆到多个 div，破坏了 ProseMirror 的单一文档模型 | 动态在 ProseMirror 内部插入 `<div class="page">` 包裹部分节点 |
| **z-index / 层叠** | 分页背景或装饰层盖住内容，或内容被 `position` 推出可视区 | 背景层 z-index 高于内容层 |
| **transform 导致裁剪** | 父级 `transform` 会创建新的 containing block，子元素 `position: fixed` 或 `overflow` 行为异常 | 在滚动容器上使用 `transform: translateZ(0)` 等 |

**核心约束**：ProseMirror 的文档是**单一连续的 DOM 树**。编辑器内部不能有多余的、由我们注入的「页」包裹 div，否则会破坏选区、解析和渲染。

---

#### 问题 2：光标无法丝滑换页

| 可能根因 | 说明 | 典型错误做法 |
|----------|------|--------------|
| **多个 contenteditable 区域** | 每「页」一个独立的 contenteditable，光标无法在区域间连续移动 | 每页一个 `<div contenteditable>` |
| **多个 ProseMirror 实例** | 每页一个 Editor，实际是多文档，选区不能跨实例 | 根据页数渲染多个 `<EditorContent />` |
| **overflow 导致滚动区域分裂** | 每页单独 `overflow-y: auto`，形成多个滚动区域，焦点/滚动逻辑混乱 | 每个 `.page` 设置 `overflow-y: auto` |
| **焦点与 scrollIntoView 异常** | 光标所在节点在「被裁切」的容器内，`scrollIntoView` 无法正确滚动 | 内容在 `overflow: hidden` 的页容器内 |

**核心约束**：**必须只有一个 ProseMirror 实例、一个 contenteditable、一个纵向滚动容器**。分页只能是视觉层，不能影响 DOM 结构。

---

#### 问题 3：图片展示异常

| 可能根因 | 说明 | 典型错误做法 |
|----------|------|--------------|
| **跨页被裁切** | 大图跨越「页」边界时，被 `overflow: hidden` 的页容器裁成两半 | 页容器有固定高度 + overflow hidden |
| **宽度计算错误** | 在限定宽度容器内，`max-width: 100%` 的参考系变化，图片撑破或过小 | 未对 `.editor-image` 做 `max-width: 100%` 约束 |
| **inline 图片与布局冲突** | Image 扩展配置了 `inline: true`，在 flex/grid 分页布局中可能错位 | 在复杂布局中未统一图片的 display |
| **Base64 大图 reflow** | 大 base64 图片加载导致布局抖动，影响分页线对齐 | 未对图片设置明确的宽高或 aspect-ratio |

**核心约束**：图片必须与文本同处**同一个连续文档流**，不能被页边界裁切；图片宽度应限制在内容区宽度内。

---

### 7.2 错误实现模式 vs 正确实现模式

#### ❌ 错误模式 A：多页容器包裹内容

```
[滚动容器 overflow-y: auto]
  ├── div.page { height: 1122px; overflow: hidden; }  ← 第 1 页
  │     └── ProseMirror 内容的一部分  ← 被裁切！
  ├── div.page { height: 1122px; overflow: hidden; }  ← 第 2 页
  │     └── ProseMirror 内容的另一部分  ← 被裁切！
  └── ...
```

问题：无法在不破坏 ProseMirror 的前提下，把文档「按高度拆」到多个 div。若用 JS 动态插入，会破坏文档模型；若整文档放在一个 page 里，只有第一页有效，其余页为空或错误。

---

#### ❌ 错误模式 B：每页一个 Editor

```
div.page → EditorContent (实例 1)
div.page → EditorContent (实例 2)
...
```

问题：多个 ProseMirror 实例 = 多个独立文档，光标、选区、undo 都无法跨页，与「丝滑换页」需求矛盾。

---

#### ✅ 正确模式：单一文档 + 纯视觉分页层

```
[滚动容器 overflow-y: auto]  ← 唯一的滚动区
  │
  ├── [装饰层：分页背景/分页线]  ← pointer-events: none，不参与布局
  │     例如：repeating-linear-gradient 或绝对定位的虚线
  │
  └── [内容层：单一块级容器]
        └── EditorContent  ← 唯一的 ProseMirror，内容连续流动
              └── div.ProseMirror
                    ├── p, p, img, table, ...
                    └── （全部在一棵 DOM 树中，无分页 div 包裹）
```

原则：
1. **只有一个 ProseMirror**：内容在一棵连续的 DOM 树中。
2. **分页仅作视觉效果**：用背景、渐变或绝对定位的装饰实现，不改变内容 DOM。
3. **单一滚动**：由最外层一个 `overflow-y: auto` 负责滚动。
4. **禁止在内容上使用 overflow: hidden**：不裁切任何文本或图片。

---

### 7.3 稳定实现的具体建议

#### 1. 限定宽度（安全）

```
外层：flex + justify-center，背景灰色（模拟页面外）
内层：width: 794px; max-width: 100%; margin: 0 auto; padding: 40px;
```

- 仅限制宽度，**不做**任何 `height` / `overflow` 限制。
- 内容高度自然撑开，无裁切风险。

#### 2. 分页视觉效果（安全做法）

**方案 2a：背景渐变（推荐）**

在内容区使用 `background` 模拟等高分页线，不增加 DOM：

```css
.t-docx-content-area {
  background: repeating-linear-gradient(
    to bottom,
    white 0,
    white 1122px,      /* A4 页高 */
    #e5e7eb 1122px,
    #e5e7eb 1146px     /* 页间隙 24px */
  );
}
```

- 内容与背景在同一层，无额外节点。
- 不改变布局，不裁切内容。

**方案 2b：背后装饰层（备选）**

```
[相对定位的滚动容器]
  [绝对定位的装饰层]  ← z-index: 0; pointer-events: none;
    若干 div，每块高度 1122px，仅画边框/阴影
  [内容层]  ← z-index: 1; 与 EditorContent 同一流
```

- 装饰层仅作视觉效果，不包裹内容。
- 装饰层需设置 `pointer-events: none`，避免影响点击和选区。

#### 3. 必须避免的写法

| 禁止项 | 正确替代 |
|--------|----------|
| 在内容父级使用 `overflow: hidden` | 不在包裹 ProseMirror 的容器上使用 overflow: hidden |
| 用 div 按高度「包裹」部分内容 | 不向 ProseMirror 内部注入任何页包裹节点 |
| 每页单独 `overflow-y: auto` | 只保留一个滚动容器 |
| 多个 EditorContent / 多个 contenteditable | 唯一 EditorContent，唯一实例 |

#### 4. 图片与表格

- 图片：`max-width: 100%`；必要时加 `height: auto`，避免撑破容器。
- 表格：`table { width: 100%; }` 或 `max-width: 100%`，确保不溢出。
- 大图/大表会自然跨多「页」显示，不会被裁切，视觉上可能被分页线穿过，但可接受（目标为视觉模拟）。

---

### 7.4 稳定性结论

| 风险项 | 正确实现下的稳定性 |
|--------|--------------------|
| 文本丢失 | ✅ 安全：内容连续、无 overflow 裁切 |
| 光标换页 | ✅ 安全：单文档、单滚动、无多实例 |
| 图片展示 | ✅ 安全：同一文档流，仅限制宽度、不裁切 |
| 性能 | ✅ 可接受：无非必要 DOM，仅背景/装饰 |
| 局部修改 / Diff 高亮 | ⚠️ 需验证：依赖 `getBoundingClientRect` 等，在固定宽度+背景布局下应仍然可用，建议单独回归 |

**总结**：方案 A 的稳定性取决于是否**严格保持 ProseMirror 单文档、单实例、单一滚动**，分页只做视觉装饰、不参与内容布局。原文档中的 `.t-docx-editor-page` 分块结构容易导致错误模式，应弃用；改用**背景/装饰层**实现分页线更稳妥。

---

## 八、风险与注意事项（方案 A 补充）

1. **性能**：长文档时，仅增加背景或少量装饰节点，对性能影响小。
2. **表格/图片**：方案 A 不处理跨页裁切，大表格或大图可能被分页线「穿过」，但不丢失、不裁切。
3. **光标与选区**：按正确模式实现时，行为与流式布局一致。
4. **保存格式**：HTML → Pandoc → DOCX 流程不变。
5. **响应式**：小屏使用 `max-width: 100%`，避免横向溢出。
6. **InlineAssistPosition / DiffHighlightExtension**：首次上线后需在分页布局下完整回归定位与高亮。

---

## 九、总结

当前编辑器为流式 HTML 布局，无宽度和分页限制。改造目标是在**仅 T-DOCX 编辑模式**下：

1. 限定输入区域宽度（如 A4）
2. 用纯视觉方式模拟 Word 的分页效果
3. 保持 md/html/txt 等类型不变

**方案 A 稳定性要点**：必须保持 **ProseMirror 单文档、单实例、单一滚动**，分页仅通过背景或装饰层实现，绝不使用多页容器包裹内容或 `overflow: hidden` 裁切。按此原则实现，可避免文本丢失、光标异常和图片显示问题。本文档中的任务拆解可直接用于排期和进度跟踪。
