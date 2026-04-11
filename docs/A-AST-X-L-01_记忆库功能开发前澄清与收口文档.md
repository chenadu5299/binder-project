# Binder 记忆库功能开发前澄清与收口文档

## 文档头

- 结构编码：`AST-X-L-01`
- 文档属性：`落地指引`
- 主责模块：`AST`
- 文档职责：`记忆库功能开发前澄清与收口 / 对齐当前实现现实、整理文档体系、收口真实需求、已完成全部决策收口（D-01~D-13）`
- 上游约束：`AST-M-D-01`, `AST-M-T-01`, `AST-M-P-01`
- 直接承接：`A-AST-X-L-02_记忆库功能开发计划.md`
- 接口耦合：`AG-M-T-04`, `WS-M-D-01`, `ENG-X-T-01`, `ENG-X-T-02`
- 使用边界：**开发参考。本文已完成全部待确认项决策（2026-04-07），可直接用于指导 P0 实施。**
- 决策状态：✅ D-01 ~ D-13 全部已决策，无剩余待确认项

---

> **本文定位**：记忆库体系已有较完整的设计文档（A 体系）和旧体系参考（R 体系），但当前代码实现与设计之间存在大量实质性差距。本文完成了开发启动前的全部需求收口与决策对齐，§五为已决策项（D-01~D-10），§六为综合结论，可直接作为 P0 实施的入口文档。  
> **实现状态口径**：请以 §九「实现状态回写（2026-04-08）」为当前代码对齐结论，前文中“开发前暂态”描述仅用于历史追溯。

---

## 一、本次扫描的相关文档清单

### 1.1 记忆库主结构文档（A 体系，当前权威）

| 文档 | 编码 | 定位 | 主要内容 |
|------|------|------|----------|
| `A-AST-M-D-01_Binder Agent记忆协同主控文档.md` | AST-M-D-01 | 主控 | 记忆协同总模型、4 类对象边界、写入/升格/读取规则、与上位 Agent 体系的承接关系 |
| `A-AST-M-T-01_记忆模型.md` | AST-M-T-01 | 模型 | 4 层记忆模型（tab/content/workspace_long_term/user）、数据模型（MemoryItem）、生命周期、检索协议 |
| `A-AST-M-P-01_上下文注入.md` | AST-M-P-01 | 协议 | 注入顺序、token 预算（55%/20%/10%/10%/5%）、ContextPackage 数据结构、降级暴露码、工程模块落位 |

### 1.2 旧体系参考文档（R 体系，仅参考）

| 文档 | 编码 | 状态 | 主要内容 |
|------|------|------|----------|
| `R-AST-M-R-01_Binder记忆库需求文档.md` | AST-M-R-01 | 旧体系参考，v1.3 | 详细需求锚定（做什么/为什么），树状结构、UI/UX 定义、@ 引用、P0/P1/P2 优先级 |
| `R-AST-M-R-03_记忆库-主控设计文档.md` | AST-M-R-03 | 参考，v1.0 | 技术选型（SQLite + FTS）、接口协议冻结（`search_memories` 完整签名）、数据库表结构 |
| `R-AST-M-R-02_Binder知识库需求文档.md` | AST-M-R-02 | 旧体系参考 | 知识库定义与记忆库的边界区分 |

### 1.3 上下游关联文档（影响记忆库设计的上游）

| 文档 | 与记忆库的关系 |
|------|--------------|
| `A-AG-M-D-01_Binder Agent能力描述文档.md` | 定义资产化、项目记忆沉淀、context governance 等上位规则，记忆库承接其 §5.7.1-§5.7.4 |
| `A-AG-M-T-04_Binder Agent技术主控文档.md` | 定义 artifact、state、verification、confirmation 等技术对象，它们是记忆升格链的来源 |
| `A-AST-M-T-02_知识库机制.md` | 知识库与记忆库并列，构成上下文增强体系；两者边界必须清晰 |
| `A-AG-M-T-02_prompt架构.md` | 定义 prompt 层级结构；记忆库结果进入 `augmentation` 层 |
| `A-WS-M-D-01_workspace工作台协同主控文档.md` | 记忆作用域与 workspace 路径绑定 |
| `A-TMP-M-D-01_Binder Agent模板协同主控文档.md` | 模板库与记忆库的边界：模板是约束资产，记忆是语义沉淀 |

### 1.4 当前代码中记忆相关实现

| 位置 | 内容 | 状态 |
|------|------|------|
| `src-tauri/src/services/memory_service.rs` | 后端记忆服务，SQLite，存储于 `.binder/memories.db` | **旧模型，与设计不符** |
| `src-tauri/src/commands/memory_commands.rs` | 记忆 Tauri 命令：`add_memory`, `get_document_memories`, `search_memories`, `delete_memory`, `get_all_memories` | **旧接口，与设计不符** |
| `src/services/memoryService.ts` | 前端记忆服务，封装上述命令 | **旧接口** |
| `src-tauri/src/services/context_manager.rs` | 多层 prompt 构建，有 `augmentation` 层占位符 | **记忆未注入，是 placeholder** |
| `MemoryTab`（前端 UI） | 记忆库面板，按文档路径分组 | **旧模型** |

---

## 二、文档体系问题诊断

### 2.1 设计体系内部的一致性

A 体系三份文档（AST-M-D-01、AST-M-T-01、AST-M-P-01）之间分工清晰，无重大矛盾：

- `AST-M-D-01` 负责"当前轮 artifact vs. 对话记忆 vs. 长期记忆"的协调规则
- `AST-M-T-01` 负责"4 层记忆模型的存什么、怎么生灭"
- `AST-M-P-01` 负责"怎么注入、按什么顺序、用多少 token"

**无需重构这三份文档的定位关系。**

### 2.2 R 体系与 A 体系的关系

R-AST-M-R-01（需求文档）和 R-AST-M-R-03（旧主控）的大量内容已被 A 体系吸收并重新表达。

但 R 体系中有以下内容**在 A 体系中尚未明确承接**：

| R 体系内容 | A 体系承接状态 | 问题 |
|-----------|--------------|------|
| P0/P1/P2 功能优先级分期 | **未承接** | A 体系无开发分期，只有 MVP 验收口径 |
| 树状 UI 面板设计 | **未承接** | A 体系无 UI 设计层文档 |
| @ 引用与拖拽引用协议（memory reference type） | **部分承接**（在 AST-M-P-01 的注入来源中提及，但无接口细节） | 缺少与 referenceStore / ReferenceType 枚举的对接细节 |
| 大文档"大纲优先、按需深入"策略 | **未承接** | A 体系无此策略定义 |
| 项目类型识别与 schema 适配（小说/报告/技术） | **未承接** | A 体系只定义"项目内容记忆"概念，不含 schema |
| `MemorySearchItem` 返回结构详细字段 | **部分承接**（AST-M-T-01 定义了 MemoryItem 最小字段集） | R 体系有更完整的返回结构冻结 |
| 记忆面板 UI 规范（只读、树状、展开折叠、数量标识） | **未承接** | 纯 UI 规范，尚无 A 体系文档承接 |
| 使用记录（命中的记忆项、注入方式、时间、标签） | **未承接** | AST-M-T-01 提到 `memory_usage_logs` 但无详细规范 |
| 500ms 检索超时、200 条上限等性能边界 | **未承接** | AST-M-T-01 仅标注"不以召回数量替代作用域正确性" |

**结论**：R 体系中未被 A 体系承接的内容，不需要回写 R 文档，但需要在开发前明确这些内容是否进入当前开发范围，并在 A 体系或开发计划中补齐。

### 2.3 当前代码与设计文档的差距（严重）

**这是本文最重要的部分。**

#### 差距 1：数据模型完全不符

| 维度 | 当前实现（旧模型） | A 体系设计（新模型） |
|------|----------------|--------------------|
| 分层键 | `document_path`（文件路径） | `layer`（tab/content/workspace_long_term/user）|
| 作用域 | 无 | `scope_type` + `scope_id` |
| 标签绑定 | 无 tab_id | `scope_type=tab, scope_id=tab_id` |
| 来源类型 | `MemorySource::Manual / AISuggested` | 7 种来源类型（conversation_summary、document_extract 等） |
| 实体类型 | 小说偏向（Character、Event、Location）| 通用实体类型 |
| 新鲜度 | 无 | `freshness_status` |
| 置信度标注 | 有（f64） | 有（沿用） |
| 标签关系 | 无 | 依 scope_type=tab 绑定 tab_id |
| 来源溯源 | 无 `source_ref` | `source_ref`（指向来源对话/文档） |

当前 `memory_service.rs` 的 `MemoryEntityType::Character/Event/Location/Concept/Relationship` 这个枚举是小说场景硬编码的，与 A-AST-M-T-01 定义的通用记忆体系严重不符，**必须重写**。

#### 差距 2：接口协议不符

| 接口 | 当前实现 | A 体系要求（R-AST-M-R-03 §7.1） |
|------|---------|-------------------------------|
| `search_memories` 签名 | `(query: String, workspace_path: String)` | `(query, {tabId?, workspacePath?, limit?, scope?, entityTypes?, includeOutline?})` |
| `get_memory_tree` | 不存在 | 需要实现 |
| `get_memory_item` | 不存在 | 需要实现 |
| `upsert_tab_memories` | 不存在 | 需要实现（内部写入接口） |
| `upsert_project_content_memories` | 不存在 | 需要实现 |
| `append_long_term_memory` | 不存在 | 需要实现 |
| `record_memory_usage` | 不存在 | 需要实现 |
| `schedule_memory_job` | 不存在 | 需要实现 |
| `delete_memory` | 存在（单条删除） | 设计上用户不能单独删除记忆项，只能通过标签删除批量清除 |

**当前 `delete_memory` 命令的存在本身违反了设计原则**（设计要求记忆只读，随标签删除而删除，用户不能单独删除记忆项）。

#### 差距 3：存储位置不符

- 当前实现：`.binder/memories.db`（独立数据库，与 `workspace.db` 分离）
- R-AST-M-R-03 §3.1 要求：数据库位置固定在工作区 `.binder/` 下，技术上允许独立 `.db`
- **当前存储位置与设计位置一致（`.binder/memories.db`）**，这一点 OK。
- 但需要确认：**新的 4 层记忆是否继续存在 `memories.db`，还是迁移到 `workspace.db`？** 这是一个待确认项（见第五章）。

#### 差距 4：记忆完全未注入 AI 上下文

`context_manager.rs` 中的 7 层 prompt 结构已定义 `augmentation` 层，但：

```rust
// 在 context_manager.rs 中，augmentation 层当前为 placeholder
// 记忆库检索结果未被拼接进任何 prompt
```

这意味着：**当前 Binder 的 AI 不使用任何记忆，记忆库是完全离线的孤岛功能。**

#### 差距 5：无 AI 驱动的记忆生成链

当前：记忆只能通过 `add_memory` 手动写入（`MemorySource::Manual` 或 `MemorySource::AISuggested` 但后者也是手动调用的）。

设计要求：
- 对话后自动提炼写入标签级记忆（conversation_summary、conversation_entity）
- 文档打开/保存时自动提取项目内容记忆（document_extract、document_outline）
- 标签删除时自动写入长期记忆（tab_deletion_summary）

以上自动化生成链**全部缺失**。

#### 差距 6：前端 Memory 类型定义与设计不符

`src/services/memoryService.ts` 中的 `Memory` 接口：

```typescript
export interface Memory {
    id: string;
    document_path: string;  // 旧模型
    entity_type: string;    // 旧模型（小说偏向）
    entity_name: string;
    content: string;
    metadata: any;
    source: string;
    confidence: number;
    // 缺失：layer, scope_type, scope_id, freshness_status, source_kind, source_ref, summary
}
```

---

## 三、Binder 记忆库的系统位置

### 3.1 在 Binder 整体架构中的位置

```
用户输入层
    │
    ├── 层次一（续写）：不接入记忆库主链（仅可选接入工作区级补强）
    ├── 层次二（局改）：不接入记忆库
    └── 层次三（对话编辑）：必须接入记忆库
                │
                ▼
        context_manager.rs（上下文装配层）
                │
                ├── governance（系统 prompt）
                ├── task（Agent 状态）
                ├── conversation（对话历史）
                ├── fact（当前文档）
                ├── constraint（用户引用）
                ├── augmentation ← [记忆库注入位置，当前为 placeholder]
                └── tool_and_output（工具定义）
```

记忆库的核心作用是填充 `augmentation` 层，在用户显式引用之后、知识库之前，以 10% token 预算注入。

### 3.2 与其他模块的关系

| 模块 | 与记忆库的关系 |
|------|--------------|
| `chatStore`（tab 模型） | 记忆库标签级记忆以 `tabId` 为 scope_id，必须与 chatStore 的 tab ID 对齐 |
| `referenceStore`（引用系统） | 用户通过 @ 或拖拽将记忆项作为显式引用传入；`reference.ts` 中已有 `Memory` 类型定义 |
| `workspace.db`（工作区数据库） | 记忆作用域与工作区路径绑定；是否共用同一数据库待确认（见第五章） |
| `context_manager.rs` | 记忆检索结果进入 `augmentation` 层，遵循 `AST-M-P-01` 定义的注入协议 |
| `tool_service.rs` | 工具执行完成后，成功执行的工具结果可作为 memory seed 候选（AST-M-D-01 §5.1.1） |
| `pandoc_service.rs` / 文件系统 | 文档打开/保存时触发项目内容记忆提取 |
| `MemoryTab`（前端 UI） | 树状只读展示；当前使用旧模型（按 document_path 分组），需要重构 |

### 3.3 与知识库、模板库、指令库的边界

**三者不可混淆：**

| 模块 | 性质 | 写入者 | 可修改性 | 用途 |
|------|------|--------|---------|------|
| **记忆库** | 语义沉淀（发生过什么、用户偏好什么） | 系统自动生成 | 只读，随标签删除 | 为 AI 提供连续上下文 |
| **知识库** | 用户主动管理的参考资料 | 用户显式导入 | 用户可管理 | 作为检索型知识补充 |
| **模板库** | 约束资产（过程约束） | 用户创建或 AI 建议后确认 | 用户可管理 | 约束 AI 的工作流推进 |
| **对话历史** | 原始消息序列 | 系统自动记录 | 只读 | 多轮对话上下文连贯（不等于记忆库） |

**关键区分**：
- 记忆库是"从对话/文档中提炼的稳定语义结论"，不是原始对话历史。
- 知识库是"用户主动导入的外部知识"，不是 AI 自动从对话中学到的。
- 模板库是"行为约束"，不是"事实记忆"。

---

## 四、Binder 记忆库的真实需求

### 4.1 当前确定需要的记忆类型

基于 Binder 当前产品阶段和真实工作场景：

#### 4.1.1 对话级/标签级记忆（最核心，P0）

**场景**：用户在同一聊天标签内进行多轮对话（例如，修改一份商业报告）。在第 10 轮时，AI 不应忘记第 3 轮用户提到的"保持正式语气"或"这个数据引用不要删"。

**需要记什么**：
- 用户在本次对话中表达的偏好（风格、约束、明确的拒绝）
- 本次对话中引用的关键实体（文档名、人名、项目名）
- 本次对话的主题摘要（供后续轮次和标签删除时使用）

**不需要记什么**：
- 原始对话消息（那是对话历史，不是记忆）
- 每一轮 AI 的输出（噪声太高）

#### 4.1.2 项目内容记忆（重要，P1）

**场景**：用户在一个写作项目中打开了 10 个文档，AI 在各种编辑任务中需要知道"李明是男主角"、"第三章还未完成"、"术语'上界算法'是本项目定义的专有名词"。

**需要记什么**：
- 文档中提取的命名实体（人物、地点、概念、术语）及其定义
- 文档结构摘要（章节、大纲）
- 项目自定义术语和约定

**可更新性**：随文档内容变化而更新（与标签级记忆不同）。

#### 4.1.3 工作区长期记忆（P1，可延后）

**场景**：用户删除了一个聊天标签"第二章写作"，但希望 AI 在后续标签中仍能知道"第二章已经完成，风格是轻松幽默"。

**来源**：标签删除时自动触发，将标签摘要追加写入。

#### 4.1.4 用户级记忆（P2）

**场景**：用户在多个项目中都表现出"偏好简洁的表格格式而非列举式"，这种跨项目稳定偏好值得沉淀。

当前阶段**不优先**，P2 实现。

### 4.2 不属于记忆库的内容

以下内容**明确不属于记忆库**：

| 内容 | 正确归属 |
|------|---------|
| 当前轮 Agent 的 plan、scope、verification 中间态 | `chatStore` 中的 Agent 状态，非记忆库 |
| 文档本体内容 | 通过 `current_editor_content` 或 `read_file` 实时获取，非记忆库 |
| 用户显式引用的文件/文本 | referenceStore 处理，非记忆库 |
| 未经确认的 AI 候选稿 | 当前轮 artifact，非记忆库 |
| workspace.db 中的 file_cache | 文档缓存，非记忆库 |
| pending_diffs | Diff 状态，非记忆库 |

### 4.3 典型工作路径

#### 路径 A：标签级记忆的自动生成与注入

```
[写入路径]
用户/AI 多轮对话
  -> 达到轮次阈值（如 5 轮）或标签空闲
  -> 后台异步调用 AI 提炼对话摘要 + 实体 + 偏好
  -> 写入 memory_items (layer=tab, scope_id=tab_id)
  -> 不阻塞主对话

[注入路径]
用户发送新消息
  -> context_manager 装配 augmentation 层
  -> 调用 search_memories(query, {tabId, scope:'tab', limit:10})
  -> 结果格式化为 [记忆库信息] 文本块
  -> 注入 augmentation 层（10% token 预算）
  -> AI 处理时可以感知到之前轮次的偏好
```

#### 路径 B：项目内容记忆的自动提取

```
[写入路径]
用户打开或保存文档
  -> 后台异步触发文档分析任务
  -> AI 提取文档中的命名实体、章节摘要
  -> 写入 memory_items (layer=content, scope_id=workspace_path)
  -> 更新时：先查 scope_id + entity_name 是否存在，存在则 upsert

[注入路径]
同路径 A，但 scope:'content'，优先级低于标签级记忆
```

#### 路径 C：用户显式引用记忆

```
用户在输入框中 @ 或拖拽记忆项
  -> referenceStore 记录 {type: 'memory', content: ...}
  -> ai_commands.rs 将其放入 references 字段
  -> context_manager 的 constraint 层（用户显式引用层）注入
  -> 优先级高于自动检索记忆
```

#### 路径 D：标签删除触发长期记忆写入

```
用户删除聊天标签
  -> 删除该 tab 的所有 memory_items (scope_type=tab, scope_id=tab_id)
  -> 后台生成标签摘要（删除时间、标签名、主题）
  -> append_long_term_memory() 追加写入 (layer=workspace_long_term)
```

### 4.4 用户对记忆的控制方式

**当前设计（从 R-AST-M-R-01 继承）**：

| 操作 | 是否支持 | 说明 |
|------|---------|------|
| 查看记忆库面板 | ✅ | 树状只读展示 |
| 查看记忆项详情 | ✅ | 点击展开 |
| 通过 @ 引用记忆 | ✅ | 显式引用，优先级最高 |
| 拖拽记忆到输入框 | ✅ | 同上 |
| 手动编辑记忆内容 | ❌ | 不支持，保证与 AI 生成逻辑一致 |
| 单独删除一条记忆 | ❌ | 不支持；通过删除标签批量清除 |
| 搜索记忆 | ✅ | 面板内搜索 |

**与当前代码的冲突**：`memory_commands.rs` 中有 `delete_memory` 命令，允许单条删除。根据设计原则，**此命令在新版本中应被移除或设为仅内部使用**。

---

## 五、已决策项（2026-04-07 收口）

以下所有决策项已由产品负责人逐条确认，结论直接用于开发实施。

---

### 【D-01】记忆生成依赖 AI 调用 ✅

**决策**：使用 AI 提炼生成记忆，不做纯规则提取。

**实施要求**：
- 记忆生成链需调用 AI（轻量摘要/实体提取 prompt）
- 必须在后台异步执行，不阻塞主对话链（`MC-WRITE-001`）
- P0 阶段实现标签级记忆的 AI 提炼；项目内容记忆的 AI 提取放 P1

---

### 【D-02】项目内容记忆仅在文件保存时触发 ✅

**决策**：使用建议方案——记忆提取钩子挂在 `sync_workspace_file_cache_after_save`，不在文件打开时触发。

**实施要求**：
- 触发点：`sync_workspace_file_cache_after_save` 成功回调后
- 仅处理当前保存文件，不批量扫描整个项目
- 打开文件时不触发任何 AI 记忆提取

---

### 【D-03】记忆表合并进 workspace.db ✅

**决策**：废弃独立 `.binder/memories.db`，记忆相关表迁移至 `workspace.db`。

**实施要求**：
- 在 `workspace.db` 中新建 `memory_items` 表（按 A-AST-M-T-01 最小字段集）
- 同时新建 `memory_usage_logs` 表用于注入记录
- `memory_service.rs` 改为使用 workspace 的 SQLite 连接池，删除独立 db 初始化路径
- 工作区切换时，记忆随 workspace.db 一起切换

---

### 【D-04】用户级记忆存储在 Tauri App Data 目录 ✅

**决策**：用户级记忆存储在 Tauri 应用数据目录（`app_data_dir()`），与工作区隔离。

**实施要求**：
- 路径：`tauri::api::path::app_data_dir(config)` 返回的目录下，文件名 `user_memory.db`
- `MemoryService` 初始化时区分两个连接：工作区级（`workspace.db` 内）和用户级（`user_memory.db`）
- 用户级记忆在 P2 阶段实现；P0 只建用户级表结构，不实现写入

---

### 【D-05】chat tab ID 必须稳定 ✅

**决策**：方案 B，引入持久化 UUID + Zustand persist 中间件。

**背景确认（2026-04-07 代码扫描）**：
- 当前 `chatStore` tab ID 格式：`chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`（非 UUID，非标准格式）
- 当前 `chatStore` 无任何 Zustand persist 中间件
- 应用每次重启时，所有旧 tab ID 失效，记忆库 `scope_id` 绑定全部孤立

**实施要求**：
- tab ID 改为 `crypto.randomUUID()`（Tauri WebView 支持，无需额外依赖）
- 引入 Zustand `persist` 中间件，仅持久化 tab 元数据（不持久化 messages）
- 存储键名：`binder-chat-tabs-storage`（localStorage）
- tab 重命名时 UUID 不变；应用重启后 UUID 不变

**专项规范文档**：`A-ENG-X-F-01_ChatTab持久化UUID专项修复规范.md`

**孤立 tab 记忆处理**：孤立 tab 记忆的完整处理规则（触发时机、stale 降级策略、30 天物理删除）见 `A-ENG-X-F-01 §四`。

**注**：此修复为记忆库 P0 的前置条件，必须先于 P0 实施完成。

---

### 【D-06】search_memories query 构造规则 ✅

**决策**：query = 用户当前输入 + 当前文件路径 + 当前选区（若有）

**实施要求**：

```
query = {用户消息文本}
      + " [file: {current_file_path}]"
      + (若有选区) " [selection: {selected_text前100字}]"
```

- 由 `context_manager.rs` 在调用 `search_memories` 前组装 query 字符串
- 不使用 AI 子目标描述作为 query（P0 阶段）
- `search_memories` 需支持 `scope`（tab/project）过滤参数

---

### 【D-07】检索方案：P0 FTS5，P2 embedding ✅

**决策**：
- **P0**：SQLite FTS5 全文检索 + 结构化字段过滤（layer, scope, entity_type）
- **P2**：引入本地 embedding 模型做语义检索（不引入外部向量数据库）

**实施要求**：
- `memory_items` 表需建 FTS5 虚拟表，对 `content` 和 `tags` 字段建索引
- P0 检索优先级：scope 过滤 → FTS5 关键词匹配 → 时效性排序（`updated_at` DESC）
- 不引入 `pgvector`、`qdrant`、`chroma` 等外部向量库

---

### 【D-08】P0 无 UI，P1 Memory 管理界面 ✅

**决策**：
- **P0**：`MemoryTab` 维持现状（旧模型，可能显示不正确），不做 UI 工作
- **P1**：实现 Memory 管理界面，支持 4 层树状浏览、查看/屏蔽/删除记忆项

**注意**：P0 完成后用户能感知记忆工作（记忆内容会出现在 AI 的 context 中），但 MemoryTab 界面不能正确反映新数据模型。这是预期内的暂态。

**2026-04-08 实现回写**：该“暂态”已收口。`FileTreePanel` 已切换挂载 `MemoryTab` 主链，旧 `MemorySection` 不再作为入口组件使用，相关遗留组件已从仓库移除。

---

### 【D-09】P0 采用系统规则写入 ✅

**决策**：P0 阶段记忆写入由系统规则触发，不给 AI 提供 `save_memory` 工具。

**触发规则（P0）**：
- 标签级记忆：chat tab 对话轮次达到阈值（建议 5 轮）时，后台触发 AI 提炼当前标签对话摘要
- 项目内容记忆：文件保存时触发（详见 D-02）

**P1 扩展**：
- 长期记忆：标签关闭时，将标签级记忆升格到工作区长期记忆
- AI 主动写入（`save_memory` 工具）：P2 阶段评估，需要额外工具调用成本分析

**2026-04-08 实现回写**：`save_memory` 已从工具矩阵主链移除，当前阶段不存在“已实现但不可调用”的伪接入状态。

---

### 【D-10】P0 实现边界（已收敛）✅

**决策**：P0 严格收敛在以下 4 个功能模块：

| 模块 | 具体内容 | 文件范围 |
|------|---------|---------|
| **memory schema** | `workspace.db` 中新建 `memory_items` + `memory_usage_logs` 表，按 A-AST-M-T-01 字段集；FTS5 虚拟表 | `memory_service.rs`, `workspace/workspace_db.rs` |
| **写入规则** | 文件保存触发项目内容记忆提取（AI 调用，后台异步）；对话 N 轮触发标签记忆提炼 | `memory_service.rs`, `ai_commands.rs` |
| **FTS 检索** | `search_memories` 接口支持 `query`/`tab_id`/`scope`/`limit` 参数，FTS5 + 时效性排序 | `memory_commands.rs`, `memory_service.rs` |
| **context 注入** | `context_manager.rs` augmentation 层接入 `search_memories`，简单文本拼接注入，带来源标签 | `context_manager.rs` |

**P0 明确不做**：
- MemoryTab UI 重构
- 长期记忆升格逻辑
- 用户级记忆写入
- embedding 检索
- `save_memory` AI 工具
- 记忆冲突检测（Mem0 模式）

---

### 【D-11】记忆提炼使用单独 AI 配置 ✅

**决策**：记忆提炼（标签级摘要、项目内容提取）使用独立的 AI provider/model 配置，不复用主对话配置。

**实施要求**：
- 配置键名：`memory_extraction_provider`、`memory_extraction_model`
- 配置读取位置：`memory_service.rs` 初始化时从应用配置读取，不硬编码
- 未配置时默认降级：复用主对话 provider，但 model 强制切换至轻量版（如 `deepseek-chat` 而非 `deepseek-reasoner`）
- 详细规范见：`A-AST-M-S-03 §十`

---

### 【D-12】P1 受限升格：最多一条候选，满足三条件才写入 ✅

**决策**：P1 阶段 `on_tab_deleted` 触发的长期记忆升格采用受限模式（不做自动全量升格）。

**实施要求**：
- 最多生成**一条**工作区长期摘要候选（`layer='workspace_long_term'`）
- 必须同时满足以下三条件才写入：
  1. 该 tab 对话轮次 >= 5（`role=user` 消息数 >= 5）
  2. 该 tab 有关联工作区（`workspacePath != null`，非临时聊天）
  3. AI 提炼返回的摘要置信度 >= 0.6
- 任一条件不满足：不生成长期记忆，tab 记忆进入 expired 状态自然衰减
- 详细规范见：`A-AST-M-S-03 §十一`

---

### 【D-13】P1 stale 清理用懒执行 + 启动检查，不做常驻定时器 ✅

**决策**：P1 stale/expired 记忆的物理清理不使用常驻后台高频定时器，改用懒执行 + 启动检查策略。

**实施要求**：
- 每次应用启动（workspace 加载完成后），执行一次 `startup_maintenance()` 清理任务
- 清理逻辑：删除 `freshness_status='stale'` 或 `'expired'` 且 `updated_at < NOW()-30天` 的记忆；`'superseded'` 保留 7 天
- 实现位置：`memory_service::startup_maintenance()`，在 workspace 加载完成后 `tokio::spawn` 异步调用
- 失败不中断启动流程，错误只记录 `tracing::warn!`
- 详细规范见：`A-AST-M-S-03 §十二`

---

## 六、当前明确可执行的结论（含决策后更新）

以下结论综合决策项，直接指导开发：

1. **数据模型必须重写**：废弃 `memories.db`，在 `workspace.db` 中建 `memory_items` 表（4 层 layer + scope + 来源字段 + FTS5），去除旧 `document_path` 和 `MemoryEntityType` 枚举。

2. **chat tab ID 必须先确认稳定性**：开发前先 Grep `chatStore` 中 tab 创建逻辑，如不是 UUID 则必须先修复，这是记忆绑定的基础。

3. **`delete_memory` 命令从前端暴露接口中移除**：与设计原则冲突（用户不能单独删除记忆项），改为系统内部接口或仅通过 P1 UI 以"屏蔽"方式暴露。

4. **`context_manager.rs` augmentation 层必须实现记忆注入**：这是 P0 核心交付。注入格式：带来源标签的文本块，不允许匿名注入。

5. **`search_memories` 接口签名扩展**：增加 `tab_id`、`scope`（`tab` | `project` | `all`）、`limit` 参数；query 由 `context_manager` 按 D-06 规则组装后传入。

6. **前端 `Memory` TypeScript 类型更新**：与后端新数据模型对齐，增加 `layer`、`scope_type`、`scope_id`、`freshness_status`，但 P0 阶段 MemoryTab UI 不使用新字段（UI 重构延至 P1）。

7. **所有记忆生成操作后台异步执行**：不阻塞主对话链，任何记忆 AI 调用失败只记录日志，不向用户报错。

---

## 七、与上游文档的关系图

```
A-AG-M-D-01（Agent 能力主控）
    └── 资产化、项目沉淀、context governance 上位规则
        │
        ├── A-AST-M-D-01（记忆协同主控）← [本文的决策来源]
        │       │ 协调对象边界、写入升格规则、读取优先级
        │       │
        │       ├── A-AST-M-T-01（记忆模型）
        │       │       4 层模型、MemoryItem 数据结构
        │       │       生命周期、检索协议
        │       │
        │       └── A-AST-M-P-01（上下文注入）
        │               注入顺序、预算、ContextPackage
        │               工程模块落位
        │
        └── 本文（A-AST-X-L-01，澄清收口）← [你正在阅读的文档]
                梳理差距、列出待确认项
                供开发前对齐使用
```

---

## 八、结构性缺口（历史记录）

以下为开发前扫描时发现的缺口，当前状态请结合 §九 回写结果阅读：

### 缺口 1：记忆库无开发分期落地计划（已关闭）

该缺口已关闭：`A-AST-X-L-02_记忆库功能开发计划.md` 已建立并持续回写。

### 缺口 2：记忆库 UI 规范无 A 体系承接

R-AST-M-R-01 §9 和 R-AST-M-R-03 §9 中有详细的 UI 规范（树状结构、交互动作、大纲/完整两种状态），但 A 体系中无对应文档。如果 MemoryTab UI 需要在本阶段重构，需要先确认 UI 是否以 R 体系的定义为准，还是需要重新设计。

### 缺口 3：记忆与 Agent 工具的交互协议未定义（阶段性收口）

该缺口已阶段性收口：当前阶段明确“不暴露 `save_memory` 工具”，记忆写入由系统规则触发；后续若启用 MemGPT 模式，需在 P2/P3 单独立项。

### 缺口 4：记忆库性能指标未进入 A 体系

R-AST-M-R-03 §10.1 定义了 500ms 检索超时和 200 条单标签上限，但这些数字在 A 体系中没有出现。如果这些数字是确定的，应写入 `A-VAL-X-V-05_性能限制清单.md`。

---

## 九、实现状态回写（2026-04-08）

> 本节用于区分“已决策”与“已实现”，以当前代码实现为准。

| 决策项 | 决策状态 | 实现状态 | 代码落位 | 说明 |
|------|---------|---------|---------|------|
| D-03（workspace.db 统一存储） | 已决策 | 已实现 | `src-tauri/src/workspace/workspace_db.rs`、`src-tauri/src/services/memory_service.rs` | schema 已收口到 migration v3 + 运行时幂等兜底 |
| D-05（tab UUID + persist） | 已决策 | 已实现 | `src/stores/chatStore.ts`、`src/stores/fileStore.ts` | `crypto.randomUUID` + persist + rehydrate 已落地 |
| D-08（Memory UI 分阶段） | 已决策 | P1 部分已实现 | `src/components/FileTree/FileTreePanel.tsx`、`src/components/Memory/MemoryTab.tsx` | 入口已接入 MemoryTab，只读展示链可用 |
| D-09（P0 不暴露 save_memory） | 已决策 | 已实现 | `src-tauri/src/services/tool_service.rs`、`src-tauri/src/services/tool_definitions.rs`、`src/types/tool.ts` | `save_memory` 已从工具主链移除，避免伪接入 |
| D-12（tab 删除受限升格） | 已决策 | 已实现（含降级修复） | `src-tauri/src/commands/memory_commands.rs`、`src-tauri/src/services/memory_service.rs` | provider 缺失仅跳过 AI 升格，基础治理仍执行 |
| D-13（启动时治理） | 已决策 | 已实现 | `src-tauri/src/services/memory_service.rs`、`src/stores/fileStore.ts` | `startup_memory_maintenance` 在 workspace 切换后异步触发 |

---

## 来源映射

1. `A-AST-M-D-01_Binder Agent记忆协同主控文档.md`
2. `A-AST-M-T-01_记忆模型.md`
3. `A-AST-M-P-01_上下文注入.md`
4. `R-AST-M-R-01_Binder记忆库需求文档.md`（旧体系参考）
5. `R-AST-M-R-03_记忆库-主控设计文档.md`（旧体系参考）
6. `src-tauri/src/services/memory_service.rs`（当前实现）
7. `src-tauri/src/commands/memory_commands.rs`（当前实现）
8. `src/services/memoryService.ts`（当前实现）
9. `src-tauri/src/services/context_manager.rs`（当前实现）
10. `R-AST-M-R-04_记忆库前沿调研与对比分析.md`（配套调研文档）
11. `A-ENG-X-F-01_ChatTab持久化UUID专项修复规范.md`（D-05 落地规范；D-11~D-13 详细实现见 A-AST-M-S-03）
