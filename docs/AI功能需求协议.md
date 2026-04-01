# AI 功能需求协议

## 文档信息

- **版本**：v1.0
- **创建日期**：2026年3月
- **来源**：Binder AI 功能方案整合版、Binder AI 方案落地拆解文档、当前代码实现
- **目的**：基于 AI 功能方案生成可落地的需求协议，与当前实现对齐；标注矛盾与待明确项
- **关联文档**：辅助续写悬浮卡实现规范、局部修改弹窗实现说明、对话编辑-主控设计文档、文档逻辑状态传递规范、AI功能前置协议与标准、**AI与其他功能交互规范**

---

## 一、总览

### 1.1 三层架构与触发方式

| 层次 | 名称 | 触发方式 | 当前实现 |
|------|------|----------|----------|
| 层次一 | 辅助续写 | Cmd+J / Ctrl+J | useAutoComplete + ai_autocomplete |
| 层次二 | 局部修改 | Cmd+K | useInlineAssist + ai_inline_assist |
| 层次三 | 对话编辑 | 聊天窗口工具调用 | ai_chat_stream + edit_current_editor_document |

### 1.2 双模式

| 模式 | 定位 | 当前状态 |
|------|------|----------|
| 编辑模式 | 辅助续写、局部修改、对话编辑 | 已实现 |
| 构建模式 | 多智能体；工作流内嵌对话流 | 未实现；Chat 模式为前身；工作流涌现见 Binder模板库需求文档 |

### 1.3 提示词构建方式

- **辅助续写**：单次构建，无意图识别、无工具
- **局部修改**：弹窗内每轮对话构建一次
- **对话编辑**：每轮用户消息构建一次；工具调用后将结果加入 messages 再次调用
- **意图识别**：嵌入系统提示词，由 AI 在单次调用内自行判断；**无显式两阶段**（意图识别 → 资源搜集 → 执行）

---

## 二、层次一：辅助续写需求协议

### 2.1 触发与前置条件

| 协议项 | 要求 | 当前实现 | 说明 |
|--------|------|----------|------|
| 快捷键 | Cmd+J / Ctrl+J | useAutoComplete 由 Cmd+J 触发 | ✅ |
| 光标激活 | 编辑器聚焦时有效；未聚焦时无效 | 需在快捷键拦截处判断 editor.isFocused | ⚠️ 待实现 |
| 光标无效提示 | 未聚焦时按 Cmd+J，状态栏「保存状态处」滚动显示「指令无效」 | 待实现 | 见辅助续写悬浮卡实现规范 1.1 |

### 2.2 上下文收集

| 协议项 | 要求 | 当前实现 |
|--------|------|----------|
| 光标前文 | 光标前 N 字符 | useAutoComplete：context_before |
| 光标后文 | 光标后 N 字符 | context_after |
| 文档结构 | 当前块类型、文档格式 | document_overview、EditorState |
| 记忆库 | 可选，相关术语、风格 | documentPath、workspacePath 已传；检索逻辑可扩展 |

### 2.3 调用与返回

| 协议项 | 要求 | 当前实现 |
|--------|------|----------|
| 后端命令 | ai_autocomplete | invoke('ai_autocomplete', { context, ... }) |
| 返回格式 | 3 条续写建议 | 需调整：当前可能为单条；方案要求 3 条 |
| 展示方式 | 悬浮卡，Tab/Shift+Tab 切换，Enter 应用，Esc 关闭 | 悬浮卡方案见辅助续写悬浮卡实现规范；GhostText 已放弃 |

### 2.4 关闭与重构

| 协议项 | 要求 | 当前实现 |
|--------|------|----------|
| 关闭条件 | 手动输入、点击空白、保存、缩放等 | useAutoComplete 有 clear 逻辑 |
| 重构 | 已显示时再次 Cmd+J → 重新请求 | 需确认 |

**详细规范**：见《辅助续写悬浮卡实现规范》

---

## 三、层次二：局部修改需求协议

### 3.1 触发与前置条件

| 协议项 | 要求 | 当前实现 |
|--------|------|----------|
| 快捷键 | Cmd+K / Ctrl+K | useInlineAssist |
| 光标激活 | 编辑器聚焦时有效 | 待实现（与辅助续写一致） |
| 无选区调出 | 无选区时以光标所在块为上下文 | 支持；text 可为空或块全文 |
| 光标无效提示 | 未聚焦时按 Cmd+K，状态栏滚动显示「指令无效」 | 待实现 |

### 3.2 弹窗交互

| 协议项 | 要求 | 当前实现 |
|--------|------|----------|
| 多轮对话 | 弹窗内可多轮，用户可追问调整 | useInlineAssist.messages |
| 对话历史 | 无持久化；每次覆盖上一次回复 | InlineAssistMessage 结构 |
| Diff 效果 | 弹窗内不做 Diff；原文档只显示选区 | 方案已明确 |
| 关闭 | 关闭按钮、再次 Cmd+K、点击应用 | 待确认 |

### 3.3 后端协议

| 协议项 | 要求 | 当前实现 |
|--------|------|----------|
| 命令 | ai_inline_assist | invoke('ai_inline_assist', { instruction, text, context }) |
| messages 扩展 | 需增加 messages 参数（role, text） | **当前不支持**；Phase 1 需后端改造 |
| 返回 | 修改后文本，可直接插入 | 已有 |

**详细规范**：见《局部修改弹窗实现说明》

---

## 四、层次三：对话编辑需求协议

### 4.1 模式

| 模式 | 说明 | 当前实现 |
|------|------|----------|
| Agent 模式 | 可调用工具（read_file、edit_current_editor_document 等） | ai_chat_stream + tool_definitions |
| Chat 模式 | 纯对话，无工具 | 已存在 |

### 4.2 提示词构建（多层）

| 层级 | 内容 | 当前实现 |
|------|------|----------|
| 第一层 | 系统提示词：角色、行为规范、意图识别原则、工具调用规范 | context_manager.build_base_system_prompt |
| 第二层 | 上下文：当前文档、选中文本、工作区路径、编辑器状态 | build_context_prompt |
| 第三层 | 引用：用户引用的文本、文件、图片等 | build_reference_prompt；ai_commands 中从消息提取 |
| 第四层 | 工具定义（仅 Agent） | get_tool_definitions 通过 API 传递 |

### 4.3 工具调用与 Diff

| 协议项 | 要求 | 当前实现 |
|--------|------|----------|
| edit_current_editor_document | 返回 canonical diffs 数组 | 见《对话编辑-主控设计文档》与《对话编辑-统一整合方案（待确认版）》 |
| Diff 格式 | diffId、startBlockId、endBlockId、startOffset、endOffset、originalText、newText、type、diff_type | 见《对话编辑-主控设计文档》第九节 |
| 文档逻辑状态 | AI 修改前需传入目标文档当前逻辑状态 `L` | 见《文档逻辑状态传递规范》 |

### 4.4 Diff 展示与执行

| 协议项 | 要求 | 当前实现 |
|--------|------|----------|
| 聊天侧 | Diff 卡片：删除区、新增区、接受/拒绝 | 待实现 |
| 文档侧 | 红色删除标记（#FCEBEB + 删除线） | DiffDecorationExtension 待新建 |
| 接受执行 | 精准替换：findBlockByBlockId + blockOffsetToPMRange + tr.replaceWith | 待实现 |
| 全部接受 | 倒序执行（最新卡片优先） | Phase 2 |

**详细规范**：见《对话编辑-主控设计文档》与《文档逻辑状态传递规范》

---

## 五、与当前实现的对应关系

### 5.1 代码路径

| 功能 | 前端路径 | 后端路径 |
|------|----------|----------|
| 辅助续写 | useAutoComplete.ts | ai_commands.rs::ai_autocomplete |
| 局部修改 | useInlineAssist.ts | ai_commands.rs::ai_inline_assist |
| 对话编辑 | chatStore、ChatPanel | ai_commands.rs::ai_chat_stream |
| 工具执行 | — | tool_service.rs::execute_tool |
| 提示词构建 | — | context_manager.rs |
| 工具定义 | — | tool_definitions.rs |

### 5.2 已实现 vs 待实现

| 项 | 状态 |
|----|------|
| ai_autocomplete 调用 | ✅ |
| ai_inline_assist 调用 | ✅ |
| ai_chat_stream 流式 | ✅ |
| edit_current_editor_document 工具 | ✅（以主控文档和统一整合方案为权威口径） |
| 悬浮卡 3 条续写 | ⚠️ 需确认当前返回条数 |
| 光标未激活提示 | ❌ 待实现 |
| ai_inline_assist messages | ❌ 后端待扩展 |
| Diff 卡片 + 文档侧删除标记 | ❌ Phase 1 |
| 文档逻辑状态传递 | ❌ Phase 1b 前置 |
| diffStore | ❌ 待新建 |

---

## 六、矛盾与待明确

### 6.1 方案与实现的矛盾

| 矛盾点 | 方案 | 当前实现 | 建议 |
|--------|------|----------|------|
| 辅助续写展示 | 悬浮卡 3 条，Tab/Enter 应用 | 可能为 GhostText 或单条；GhostText 已放弃 | 按悬浮卡方案实现；确认 ai_autocomplete 返回 3 条 |
| edit_current_editor_document 返回 | canonical diffs 数组 | 旧实现可能存在兼容路径 | 以主控文档和统一整合方案收口，旧返回格式不再作为目标口径 |
| 文档逻辑状态 | 必须传入 | 未实现 | Phase 1b 前完成 |
| 意图识别 | 可选两阶段模式 | 未实现；仅系统提示词内嵌 | 保持现状；两阶段为可选增强 |

### 6.2 待明确项

| 项 | 说明 |
|----|------|
| ai_autocomplete 返回格式 | 当前为 string \| null；方案要求 3 条，需明确 JSON 结构 |
| 记忆库检索 | 各层次均提及，但 search_memories 调用链未完全接入 |
| 引用 build_reference_prompt | 是否在 ai_commands 中实际调用；ContextInfo.references 构建是否完整 |
| newText 格式 | 纯文本 vs HTML 子集；见 AI功能前置协议与标准 五 |

### 6.3 依赖关系

```
Phase 0：块 ID 稳定性验证（已完成，结论：不跨会话继承）
Phase 1a：Diff 数据格式、diffStore、Diff 卡片、精准替换
Phase 1b：文档逻辑状态传递、DiffDecorationExtension、文档侧删除标记
前置：对话编辑-主控设计文档、文档逻辑状态传递规范、辅助续写悬浮卡实现规范、局部修改弹窗实现说明
```

---

## 七、协议文档索引

| 协议/规范 | 文档 | 对应 Phase |
|-----------|------|------------|
| 辅助续写 | 辅助续写悬浮卡实现规范 | 辅助续写 P1 |
| 局部修改 | 局部修改弹窗实现说明 | 局部修改 P1 |
| 对话编辑设计与 Diff | 对话编辑-主控设计文档 | 对话编辑 |
| 文档逻辑状态 | 文档逻辑状态传递规范 | 对话编辑 P1b 前置 |
| **AI 与功能交互** | **AI与其他功能交互规范** | 记忆库、引用、知识库、模板库 |
| 前置协议 | AI功能前置协议与标准 | 开发前 |
| 基础环境 | 基础环境与协议差距分析、AI功能基础环境开发方案 | 开发前 |

---

**文档结束。**
