# AI 功能基础环境开发方案

## 文档信息

- **版本**：v2.1
- **创建日期**：2026年3月
- **来源**：基于《基础环境与协议差距分析》v1.3、《Diff效果优化方案》《Binder AI 功能方案整合版》《Binder AI 方案落地拆解文档》
- **目的**：基于新需求提供明确、可执行的开发方案；**不与当前代码实现混淆**，方案描述的是目标状态

---

## 一、方案总览

### 1.1 开发项与优先级

| 序号 | 开发项 | 来源 | 优先级 | 依赖 |
|------|--------|------|--------|------|
| 1 | 块 ID 稳定性验证 | 基础分析 7.6 | **前置（已完成）** | 无 |
| 2 | 光标未激活提示 | 基础分析 2.4、6.3；Diff 方案 2.1、2.2 | 中 | 无 |
| 3 | createAnchorFromSelection 跨块扩展 | 基础分析 5.2、7.1 | 高 | 1 |
| 4 | 局部修改无选区调出 | 拆解文档 2.2；Diff 方案 2.2 | 中 | 3 |
| 5 | ai_inline_assist messages 扩展 | 基础分析 7.3；拆解文档 0.2.3 | 高 | 无 |
| 6 | extract_block_range（后端跨块提取） | 基础分析 7.2 | 高 | 3 |
| 7 | 跨块 Diff 应用（前端） | 基础分析 5.2 | 高 | 3 |
| 8 | diffStore + 逻辑状态计算 | 基础分析 7.4、7.5；Diff 方案 2.3.8 | 高 | 1 |
| 9 | 后端 Diff：基于 blockId 的 diff 输出 | 基础分析 3.3、4.3；Diff 方案 2.3.7 | 高 | 《对话编辑-主控设计文档》第九节对齐（不依赖 8） |
| 10 | 文档逻辑状态传递 | 基础分析 1.4；拆解文档 2.3.1 | 高 | 8 |
| 11 | 表格整表标记迁移 | 基础分析 5.3 | 中 | 9 |
| 12 | 用户意图定位（文档结构传给 AI） | 基础分析 5.1、7.7 | 中 | 10 |

### 1.2 开发顺序建议

```
Phase 0（前置，已完成）
  └── 1. 块 ID 稳定性验证 → 结论：100% 不跨会话继承，单会话内有效

Phase 1（基础能力）
  ├── 2. 光标未激活提示
  ├── 3. createAnchorFromSelection 跨块扩展
  └── 4. 局部修改无选区调出

Phase 2（协议与后端）
  ├── 5. ai_inline_assist messages 扩展
  ├── 6. extract_block_range
  └── 9. 后端 Diff：基于 blockId 的 diff 输出（依赖规范文档，不依赖 diffStore）

Phase 3（Diff 与逻辑状态）
  ├── 7. 跨块 Diff 应用
  ├── 8. diffStore + 逻辑状态计算（getLogicalContent 走 ProseMirror doc 路径）
  └── 10. 文档逻辑状态传递

Phase 4（延伸）
  ├── 11. 表格整表标记迁移
  └── 12. 用户意图定位（文档结构传给 AI）
```

---

## 二、详细修改方案

### 2.1 块 ID 稳定性验证（前置，已完成）

**结论**：blockId **100% 不跨会话继承**。DOCX 不保存 data-block-id，每次加载重新分配。

**影响**：单会话内 blockId 有效；跨会话未接受的 diff 标记过期。属预期行为，无需修复。详见基础分析 7.6。

---

### 2.2 光标未激活提示

**目标**：Cmd+J、Cmd+K 在编辑器未聚焦时无效，状态栏「保存状态处」滚动显示「指令无效」。

**需求来源**：Diff 方案 2.1.2、2.2.1；基础分析 2.4。

**修改点**：

| 模块 | 修改内容 |
|------|----------|
| 快捷键拦截 | 在 Cmd+J/Cmd+K 处理前判断编辑器是否聚焦；未聚焦时显示提示并 return |
| 提示展示 | 状态栏「保存状态处」区域滚动显示「指令无效」，短时后清除 |

**实现要点**：编辑器聚焦判断（如 `editor.isFocused`）；提示状态存储与消费；状态栏布局。

---

### 2.3 createAnchorFromSelection 跨块扩展

**目标**：选区跨多块时，返回 `{ startBlockId, startOffset, endBlockId, endOffset }`；单块时 `startBlockId === endBlockId`。

**需求来源**：基础分析 5.2、7.1。

**修改点**：

| 模块 | 修改内容 |
|------|----------|
| 选区解析 | 找到包含 from 的块为 start，包含 to 的块为 end；单块时两者相同 |
| 返回值 | 统一结构 `{ startBlockId, startOffset, endBlockId, endOffset }`，单块时 startBlockId === endBlockId |
| chatStore | 扩展 editTarget 结构支持跨块（startBlockId、endBlockId）；后端 edit_current_editor_document 需能解析 |
| CopyReferenceExtension | **已确认**：当前 sourceData 用 `blockId`、`startOffset`、`endOffset`（单块格式）。扩展后：单块时 `blockId = startBlockId` 保持兼容；跨块时 sourceData 增加 `startBlockId`、`endBlockId`，粘贴端需支持跨块引用。**TypeScript**：返回值统一为 `{ startBlockId, startOffset, endBlockId, endOffset }`，单块时 startBlockId === endBlockId，CopyReferenceExtension 用 `blockId: anchor.startBlockId` 即可兼容现有单块消费 |

**协议**：见基础分析 7.1。

---

### 2.4 局部修改无选区调出

**目标**：无选区时 Cmd+K 仍可调出弹窗，以光标所在块为上下文。

**需求来源**：Diff 方案 2.2.1；拆解文档 2.2。

**修改点**：

| 模块 | 修改内容 |
|------|----------|
| 触发逻辑 | 无选区时（from === to）取光标所在块；selectedText 可为空或块全文 |
| 后端 | text 为空时，提示词说明「以当前块为操作对象」 |

---

### 2.5 ai_inline_assist messages 扩展

**目标**：支持弹窗内多轮对话，后端接收 `messages` 并按对话历史拼接提示词。

**需求来源**：基础分析 7.3；拆解文档 0.2.3。

**修改点**：

| 层级 | 修改内容 |
|------|----------|
| 前端 | 维护 messages；调用时传入 `messages: { role, text }[]` |
| 后端 | ai_inline_assist 增加 `messages: Option<Vec<{role, text}>>`；按顺序拼接为对话式 prompt，最后追加当前 instruction + text |
| 兼容 | messages 为 None 时按单轮处理 |

**协议**：见基础分析 7.3。

---

### 2.6 extract_block_range（后端跨块提取）

**目标**：`extract_block_range(html, startBlockId, startOffset, endBlockId, endOffset) -> string`。

**需求来源**：基础分析 7.2。

**修改点**：

| 层级 | 修改内容 |
|------|----------|
| 后端 | 新增 extract_block_range；解析 HTML 按 data-block-id 定位块 |
| 逻辑 | 单块：取 [startOffset, endOffset]；跨块：start 块 [startOffset..]、中间块全文、end 块 [..endOffset]，用 `\n` 拼接 |

**协议**：见基础分析 7.2。

---

### 2.7 跨块 Diff 应用（前端）

**目标**：执行跨块替换时，`tr.replaceWith(from, to, newNode)` 的 from/to 跨多个 block。

**需求来源**：基础分析 5.2。

**修改点**：

| 模块 | 修改内容 |
|------|----------|
| 工具函数 | 新增 `blockRangeToPMRange(doc, startBlockId, startOffset, endBlockId, endOffset) -> { from, to }` |
| 应用逻辑 | 用 blockRangeToPMRange 得 from/to，执行 tr.replaceWith |

---

### 2.8 diffStore + 逻辑状态计算

**目标**：新建 diffStore，维护 diff 数据与状态；实现 `getLogicalContent()` 按正序应用已接受的 diffs。

**需求来源**：基础分析 7.4、7.5；Diff 方案 2.3.8。

**修改点**：

| 模块 | 修改内容 |
|------|----------|
| 新建 | diffStore：Map<diffId, DiffEntry>；baseline（原始文档 HTML 快照） |
| DiffEntry | diffId, startBlockId, endBlockId, startOffset, endOffset, originalText, newText, type, status, acceptedAt, mappedFrom, mappedTo |
| getLogicalContent | **走 ProseMirror doc 路径**：baseline（HTML）→ 解析为 ProseMirror doc → 按 acceptedAt 正序依次应用 diff（findBlockByBlockId + blockOffsetToPMRange + tr.replaceWith）→ 序列化回 HTML。不在 HTML 字符串上做 blockId+offset 替换（易产生偏移漂移） |

**协议**：见基础分析 7.4、7.5。

---

### 2.9 后端 Diff：基于 blockId 的 diff 输出

**目标**：edit_current_editor_document 输出 `diffs` 数组，格式为 `{ diffId, startBlockId, endBlockId, startOffset, endOffset, originalText, newText, type }`。

**需求来源**：基础分析 3.3、4.3；Diff 方案 2.3.7；拆解文档 0.3.4、3.3。

**方向性决策**：

- **完全放弃 line-based**：新方案不引入 line（行号）概念。line 是旧实现的产物，与 blockId+offset 无直接对应关系。
- **直接在 HTML 上做基于 blockId 的 diff**：解析 HTML 拿到所有 block 的文本；AI 的修改指令或 diff 计算直接产出 blockId+offset；后端输出 `{ startBlockId, startOffset, endBlockId, endOffset, originalText, newText }`，**不经过 line 这一层**。

**修改点**：

| 层级 | 修改内容 |
|------|----------|
| 后端 | 解析 HTML，按 data-block-id 建立 block 列表；对比「文档逻辑状态」与「AI 返回的新内容」，在 block 粒度上计算 diff；直接输出 blockId+offset 格式的 diffs |
| 后端 | edit_current_editor_document 返回结构增加 `diffs` 字段；保持 `content` 等旧字段兼容 |
| 前端 | 解析 diffs，渲染 DiffCard；接受时用 blockRangeToPMRange + tr.replaceWith |

**输出格式**（见 Diff 方案 2.3.7）：

```json
{
  "diffId": "uuid-v4",
  "startBlockId": "block-abc",
  "startOffset": 3,
  "endBlockId": "block-abc",
  "endOffset": 6,
  "originalText": "二狗",
  "newText": "石头",
  "type": "replace"
}
```

**实现要点**：后端需有 HTML 解析能力（按 data-block-id 提取块）；diff 算法在 block 文本粒度上做；不依赖纯文本行号。

---

### 2.10 文档逻辑状态传递

**目标**：AI 发起 edit_current_editor_document 前，传入的 current_editor_content 为逻辑状态（baseline + 已接受 diffs），而非显示状态。

**需求来源**：基础分析 1.4；拆解文档 2.3.1。

**修改点**：

| 模块 | 修改内容 |
|------|----------|
| 前端 | 调用 ai_chat_stream 时，current_editor_content 改为 diffStore.getLogicalContent()（有 diff 时）或 editor.getHTML()（无 diff 时） |
| 时机 | AI 调用 edit_current_editor_document 前，必须传入逻辑状态 |

---

### 2.11 表格整表标记迁移

**目标**：从 DiffHighlightExtension 迁移表格整表标记逻辑；**为 table 节点新增 blockId**（已决策）。

**需求来源**：基础分析 5.3；拆解文档 3.3.1。

**决策**：**为 table 节点新增 blockId**。理由：语义更清晰，后端处理更简单，不需要用 tableCell 间接代表整表。需将 table 加入 BLOCK_NODE_NAMES，BlockIdExtension 为 table 节点分配 data-block-id。

**修改点**：BlockIdExtension、blockConstants 增加 table；DiffDecorationExtension 实现表格整表 Decoration（以 table 的 blockId 定位）。

---

### 2.12 用户意图定位（文档结构传给 AI）

**目标**：用户说「修改第十段」时，AI 能理解并准确定位；歧义时反问确认。

**需求来源**：基础分析 5.1、7.7；整合版 3.2 第二层上下文。

**正确架构**：不硬编码映射；传完整文档结构（含 block 类型与 blockId）给 AI；歧义时 AI 反问确认。

**修改点**：

| 模块 | 修改内容 |
|------|----------|
| 文档序列化 | 将 editor 内容转为「带类型与 blockId」的文本格式 |
| 上下文传递 | current_editor_content 或 context 中传入上述格式 |
| 提示词 | 说明：用户用自然语言描述位置时，若有歧义应反问确认 |

**格式示例**（见基础分析 7.7）：

```
[标题] 第一章 市场分析
[正文 block-001] 全球科技行业保持稳健增长...
[列表项 block-003] 亚太市场增速23%
```

---

## 三、共用模块改动前检查清单

以下改动涉及共用模块，**改动前必须执行「调用方排查」**：

| 模块 | grep 命令 |
|------|----------|
| createAnchorFromSelection | `grep -r "createAnchorFromSelection" src/ --include="*.ts" --include="*.tsx"` |
| findBlockByBlockId | `grep -r "findBlockByBlockId" src/ --include="*.ts" --include="*.tsx"` |
| blockOffsetToPMRange | `grep -r "blockOffsetToPMRange" src/ --include="*.ts" --include="*.tsx"` |
| getBlockId | `grep -r "getBlockId" src/ --include="*.ts" --include="*.tsx"` |
| BLOCK_NODE_NAMES | `grep -r "BLOCK_NODE_NAMES" src/ --include="*.ts" --include="*.tsx"` |
| EditorStatusBar | `grep -r "EditorStatusBar" src/ --include="*.ts" --include="*.tsx"` |
| useInlineAssist | `grep -r "useInlineAssist" src/ --include="*.ts" --include="*.tsx"` |
| useAutoComplete | `grep -r "useAutoComplete" src/ --include="*.ts" --include="*.tsx"` |
| extract_block_text_by_id | `grep -r "extract_block_text_by_id" src-tauri/ --include="*.rs"` |
| edit_current_editor_document | `grep -r "edit_current_editor_document" src/ src-tauri/ --include="*.ts" --include="*.tsx" --include="*.rs"` |

---

## 四、附加方案：改之前先做一件事

### 4.1 原则

**在动任何共用模块之前，先在代码库里搜这个模块被哪些地方引用，把调用方列出来。**

例如要改 `createAnchorFromSelection`，先执行：

```bash
grep -r "createAnchorFromSelection" src/ --include="*.ts" --include="*.tsx"
```

把所有调用方列出来，逐一确认改动是否影响它们，再动手。

### 4.2 目的

防止改了一处、坏了三处。这不是流程，是最简单的保护措施。

### 4.3 操作步骤

1. **搜索**：用 grep 列出所有引用
2. **列清单**：文件、行号、用途
3. **逐一分析**：判断改动是否影响各调用方
4. **动手**：确认无误后再修改

---

**文档结束。**
