# AI 与其他功能交互规范

## 文档头

- 结构编码：`AG-M-R-09`
- 文档属性：`旧体系参考`
- 主责模块：`AG`
- 文档职责：`AI与其他功能交互规范 / 参考、研究或索引文档`
- 上游约束：`CORE-C-D-04`, `AG-C-D-01`, `AG-M-D-01`, `AG-M-T-01`
- 直接承接：无
- 接口耦合：`AST-M-P-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 汇聚影响：`CORE-C-R-01`, `AG-M-D-01`, `AG-M-T-01`
- 扩散检查：`AG-M-P-01`, `AG-M-R-01`, `AG-M-T-02`, `AG-M-T-03`, `AG-M-T-04`
- 使用边界：`仅作旧体系参考，不作为当前开发主依据；若结论被吸收，应回写主结构文档`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 文档信息

- **版本**：v1.1
- **创建日期**：2026年3月
- **来源**：Binder AI 功能方案整合版、AI功能前置协议与标准、当前代码实现
- **目的**：定义 AI 与记忆库、引用资源、知识库、模板库等功能的交互协议、数据流与实现状态
- **关联文档**：引用功能完整设计文档、AI功能需求协议、AI功能前置协议与标准、reference.ts、memoryService.ts

---

## 〇、核心设计原则与本文档的关联

本文档定义的交互规范服务于以下核心设计原则（见 Binder AI 功能方案整合版）：

| 原则 | 本文档对应 |
|------|------------|
| **项目优先** | 上下文优先级以用户引用、当前文档为最高；记忆库、知识库按 workspace 检索 |
| **AI 提议，编辑器执行** | 引用类型含可编辑（TextReference + editTarget）；工具调用结果驱动编辑器 Diff |
| **工作流涌现** | 模板库工作流：Plan JSON、@ 引用、内嵌对话流执行 |

---

## 一、总览

### 1.1 交互功能与当前状态

| 功能 | 用途 | 当前实现 | AI 接入状态 |
|------|------|----------|-------------|
| **记忆库** | 术语、风格、上下文记忆 | memory_service、search_memories | 辅助续写已接入；局部修改、对话编辑未接入 |
| **引用资源** | 用户引用的文本、文件、图片等 | referenceStore、ReferenceInfo、build_reference_prompt | 对话编辑部分接入；引用未从前端传递 |
| **知识库** | 上传文档的检索与引用 | KnowledgeSection 占位 | 未实现 |
| **模板库** | 工作流模板存储与选择 | InstructionSection 占位 | 未实现 |

### 1.2 上下文优先级（CCE 简化）

```
用户引用 > 当前文档/选区 > 工作区相关 > 记忆库 > 知识库 > 聊天历史
```

---

## 二、记忆库交互规范

### 2.1 接口协议

| 协议项 | 内容 |
|--------|------|
| **命令** | `search_memories(query: string, workspace_path: string)` |
| **返回** | `Vec<Memory>` |
| **Memory 结构** | `{ id, document_path, entity_type, entity_name, content, metadata, source, confidence }` |

### 2.2 当前实现

| 组件 | 路径 | 说明 |
|------|------|------|
| 后端 | `memory_commands.rs::search_memories` | 接收 query、workspace_path |
| 后端 | `memory_service.rs::search_memories` | SQLite 全文检索 |
| 前端 | `memoryService.ts::searchMemories` | invoke('search_memories', { query, workspacePath }) |
| 前端 | `useAutoComplete.ts` | 辅助续写时调用：从 contextBefore 提取关键词 → search_memories → 最多 3 条，500ms 超时 |

### 2.3 各层次接入规范

| 层次 | 调用时机 | 检索参数 | 拼接方式 | 状态 |
|------|----------|----------|----------|------|
| **辅助续写** | 构建提示词前 | query=前文关键词，limit=3 | 作为「记忆库信息」段落传入 context | ✅ 已接入 |
| **局部修改** | 弹窗内每轮构建前 | query=指令+选中文本关键词 | 同上 | ❌ 未接入 |
| **对话编辑** | 每轮用户消息构建前 | query=用户消息关键词 | 作为第三层或上下文的一部分 | ❌ 未接入 |

### 2.4 拼接格式建议

```
[记忆库信息]（如有）
以下为相关记忆，供参考：
- [entity_name]（[entity_type]）：[content]
...
```

### 2.5 降级策略

- 检索失败：静默返回空数组，不阻塞主流程
- 超时：500ms 内未返回则使用空数组（辅助续写已实现）
- 无 workspacePath：不调用

### 2.6 矛盾与待明确

| 项 | 说明 |
|----|------|
| ai_inline_assist 入参 | 当前无 memoryItems 参数；需后端扩展 |
| ai_chat_stream 入参 | 当前无 memoryItems 参数；需后端扩展或由后端主动调用 search_memories |
| 调用方 | 前端调用 vs 后端调用：辅助续写为前端；对话编辑可考虑后端按 workspace_path 调用 |

---

## 三、引用资源交互规范

### 3.1 引用类型（reference.ts）

| 类型 | 说明 | 可编辑 | AI 消费 |
|------|------|--------|---------|
| Text | 文档内文本选区 | ✅ blockId+offset → edit_target | 完整 content + 来源 |
| File | 文件引用 | — | 路径 + 可选 content |
| Folder | 文件夹引用 | — | 路径 |
| Image | 图片引用 | — | 路径/URL + 可选描述 |
| Table | 表格引用 | — | 表格数据 |
| Memory | 记忆库引用 | — | 记忆项 content |
| Link | 链接引用 | — | URL + 可选摘要 |
| Chat | 聊天记录引用 | — | 消息内容 |
| KnowledgeBase | 知识库引用 | — | 检索结果 |

### 3.2 三种引用用途

| 用途 | 场景 | AI 行为 | 数据要求 |
|------|------|---------|----------|
| **可编辑** | TextReference，需修改文档 | 调用 edit_current_editor_document（块级用 edit_target；全文/多处置换等建议显式 `edit_mode`+`scope`，见 `对话编辑内容解析与Diff呈现一致性方案.md`） | blockId、startOffset、endOffset、pathMatch |
| **只读** | 内容已完整传入；File 的 path 可信 | 直接使用，无需 read_file；AI 根据用户指令判断是否 update_file | type、source、content；path 已解析，prompt 统一声明「可直接使用，无需 list_files/search_files」 |
| **信息获取** | 图片、链接等 | 需获取内容再传入 | 占位或实时拉取；超时策略 |

**原则**：引用层**只传内容**，不做意图预判；已删除 isOperationTarget，path 可信度由 prompt 统一声明。详见引用功能完整设计文档。

### 3.3 当前实现

| 环节 | 实现 | 说明 |
|------|------|------|
| 前端引用收集 | referenceStore、InlineChatInput、ChatInput | 用户拖拽、粘贴、@ 等添加引用 |
| edit_target 注入 | chatStore | 选区 → createAnchorFromSelection；引用 TextRef+pathMatch → edit_target |
| 引用传递后端 | ai_chat_stream | **未传递 references**；仅传 currentFile、selectedText、editTarget |
| 后端引用处理 | ai_commands | 从 messages 提取引用（逻辑留空）；仅将 current_file 作为 File 引用加入 |

### 3.4 协议缺口

| 缺口 | 说明 |
|------|------|
| references 参数 | ai_chat_stream 无 references 入参；需前端传、后端接 |
| ReferenceInfo 构建 | 需从 referenceStore 的 Reference 转为 ReferenceInfo（type、source、content） |
| 可编辑引用 | edit_target 已支持选区；引用中的 TextRef 需 pathMatch 才注入，逻辑已有 |
| build_reference_prompt | context_manager 已实现；需确保 ContextInfo.references 有数据 |

### 3.5 引用传递协议（与引用功能完整设计文档对齐）

**前端 → 后端**：

```typescript
references?: Array<{
  type: 'text' | 'file' | 'folder' | 'image' | 'table' | 'memory' | 'link' | 'chat' | 'kb' | 'template';
  source: string;
  content: string;
  editTarget?: { blockId: string; startOffset: number; endOffset: number };
  templateType?: 'workflow';
}>;
```

**后端 build_reference_prompt**：按 type 格式化；末尾「以上内容已完整传入，无需再读取」；**含 File 时**统一追加「以上文件路径均已解析，可直接使用，无需 list_files 或 search_files」。无需 isOperationTarget。

---

## 四、知识库交互规范

### 4.1 现状

- **前端**：KnowledgeSection 为占位，无实际数据
- **类型**：reference.ts 有 KnowledgeBaseReference
- **协议**：AI功能前置协议与标准 建议 `query_knowledge_base(kbId, query) -> { items }`

### 4.2 建议的交互协议（预定义）

| 协议项 | 内容 |
|--------|------|
| **接口** | `query_knowledge_base(kbId: string, query: string, options?: { limit }) -> KnowledgeSearchResult` |
| **返回** | `{ items: [{ id, content, score?, metadata? }] }` |
| **与引用** | 用户 @知识库 时走引用；AI 自动检索时走上下文注入 |
| **拼接** | 与记忆库类似，标注来源为「知识库」 |

### 4.3 实现状态

**未实现**。知识库功能可延后，协议先定，避免与记忆库、引用格式不一致。

---

## 五、模板库交互规范

### 5.1 现状

- **前端**：InstructionSection 已更名为模板库展示，为占位
- **方案**：Binder模板库需求文档、Binder AI 功能方案整合版

### 5.2 工作流模板交互协议（预定义）

| 类型 | 结构 | 与 AI |
|------|------|-------|
| **工作流模板** | Plan JSON：`{ id, name, description, source, weighted_score, steps: [{ id, type, label, params, depends_on }] }` | 对话中 `@` 引用或 AI 自动调起；无独立执行入口；AI 按 steps 注入对话上下文并执行 |

**工作流模板说明**：工作流从真实任务执行中涌现（加权分 ≥ 阈值或出现 memory_save 时询问保存）；节点类型对应 knowledge_fetch、memory_fetch、doc_read、web_fetch、extract、summarize、compare、draft_write、template_fill 等；执行完全内嵌在对话流中，用户看到语义化进度。详见 Binder模板库需求文档 二、工作流模板详细设计。

### 5.3 实现状态

**未实现**。详见 Binder模板库需求文档。

---

## 六、数据流总览

### 6.1 辅助续写

```
用户 Cmd+J
  → useAutoComplete 收集 contextBefore、contextAfter、documentOverview
  → search_memories(query=关键词, workspacePath)  [已接入]
  → ai_autocomplete({ context, memoryItems?, ... })
  → 后端拼接提示词（含记忆库段落）
  → 返回续写建议
```

### 6.2 局部修改

```
用户 Cmd+K
  → useInlineAssist 收集 instruction、selectedText、context、messages
  → [未] search_memories  ← 待接入
  → ai_inline_assist({ instruction, text, context, messages })
  → 后端拼接提示词
  → 返回修改结果
```

### 6.3 对话编辑

```
用户发送消息
  → chatStore 收集 messages、currentFile、selectedText、editTarget、currentEditorContent
  → [未] getReferences(tabId) 传递 references  ← 待接入
  → [未] search_memories 或后端调用  ← 待接入
  → ai_chat_stream({ messages, currentFile, selectedText, editTarget, currentEditorContent })
  → 后端从 messages 提取引用（当前逻辑空）；将 current_file 作为引用
  → build_multi_layer_prompt（含 build_reference_prompt）
  → 流式调用 AI
```

---

## 七、实现优先级与改造清单

### 7.1 P0（对话编辑 Phase 1 前）

| 项 | 说明 |
|----|------|
| 引用传递 | ai_chat_stream 增加 references 参数；chatStore 从 referenceStore 获取并传递 |
| ReferenceInfo 构建 | 前端或后端将 Reference 转为 ReferenceInfo |

### 7.2 P1（记忆库集成）

| 项 | 说明 |
|----|------|
| 局部修改 + 记忆库 | ai_inline_assist 增加 memoryItems 参数；useInlineAssist 调用 search_memories |
| 对话编辑 + 记忆库 | ai_chat_stream 增加 memoryItems 或后端按 workspace 调用 search_memories |

### 7.3 P2（知识库、模板库）

| 项 | 说明 |
|----|------|
| 知识库协议 | query_knowledge_base 接口与返回格式 |
| 模板库格式 | 工作流模板 Plan JSON 结构（id、name、source、weighted_score、steps） |

---

## 八、矛盾与待明确

| 矛盾/待明确 | 说明 |
|-------------|------|
| 引用从消息解析 vs 前端传递 | 当前后端从 messages 解析引用（逻辑空）；建议改为前端显式传递 references |
| 记忆库调用方 | 辅助续写为前端调用；对话编辑可后端调用（有 workspace_path）或前端调用后传入 |
| 引用 content 大小 | 大文件是否传全文；建议超阈值仅传摘要，提示 AI 可 read_file |
| 知识库与记忆库边界 | 记忆库=项目内记忆；知识库=上传文档检索；两者格式应对称 |

---

**文档结束。**
