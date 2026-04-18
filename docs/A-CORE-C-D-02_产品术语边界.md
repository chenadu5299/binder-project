# 产品术语边界

## 文档头

- 结构编码：`CORE-C-D-02`
- 文档属性：`主结构`
- 主责模块：`CORE`
- 文档职责：`产品术语边界 / 功能与规则主控`
- 上游约束：无
- 直接承接：无
- 接口耦合：`SYS-C-T-01`
- 汇聚影响：`CORE-C-R-01`, `CORE-C-D-01`
- 扩散检查：`CORE-C-D-03`, `CORE-C-D-04`, `CORE-C-D-05`, `CORE-C-D-06`
- 使用边界：`定义功能边界、模块规则与承接范围，不承担技术实现细节与开发排期`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
> 文档分级：`L1 / 一级权威文档`
> 文档类型：`术语主定义 / 边界主控`
> 当前状态：`Active`
> 受约束于：无
> 可约束：`全部 Active 描述层文档中的共享术语使用`
> 可用于：`定义共享概念、状态名、协议字段名、边界名词的唯一主定义`
> 不可用于：`替代模块规则文档定义执行流程与实现策略`

## 一、文档定位

本文是 Binder MVP 的术语边界主文档，用于统一产品、架构、协议、实现文档中的术语口径。  
优先级：本文件 > 模块文档内自定义术语。

---

## 二、术语使用规则

1. 同一语义只允许一个主术语，不允许同义混用。  
2. 产品词与技术词必须分层：先产品语义，再实现语义。  
3. 未在本文件定义的术语，不得写入总纲/主控/协议主文档。  
4. 旧术语、未来态术语和参考层术语必须标记为“禁用”或“仅参考/未来”。  
5. 术语定义必须包含边界：明确“包含/不包含”。  

---

## 三、术语主表（按领域）

### 3.1 产品与交付范围

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| Binder | 本地优先的 AI 文档工作台产品 | 文件管理、文档编辑、AI 三层、对话编辑主链 | 云端协同 SaaS |
| MVP 开源首版 | v0.1.0 首次开源可运行核心版本 | 文件管理、文档编辑、AI 三层、对话编辑主链 | 预览子系统、T-DOCX、分页子系统 |
| 核心主链 | 用户从资源到编辑到 AI 决策生效的完整闭环 | 打开/编辑/AI修改/diff确认/生效 | 独立展示增强功能 |
| 单平台发布 | MVP 发布平台策略 | macOS | Windows/Linux 首发支持 |

### 3.2 Workspace 与资源域

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| Workspace | 本地项目容器与运行上下文 | 文件树、资源、聊天上下文绑定 | 跨设备自动同步空间 |
| workspace_path | 工作区物理路径标识 | 资源隔离、检索范围、命令作用域 | 跨工作区共享 ID |
| 目标文件（targetFile） | 本轮编辑真正作用的文件 | 当前文件、非当前已打开文件、未打开静默加载文件 | 当前活动 tab 的默认等同 |
| 当前文件 | 当前轮语境下被用户或系统指称的文件对象 | 当前活动文件、目标文件、当前文档所绑定的文件路径 | 对话中未解析的泛称文件 |
| 当前活动文件 | 当前 UI 激活的编辑器文件 | 用于界面焦点 | 本轮编辑目标的唯一判定 |
| 当前文档 | 当前工作台中被激活并参与本轮对话编辑事实构建的文档对象 | 当前文件路径、当前编辑器内容、当前块结构、选区/光标现场 | 自动检索返回的知识条目 |
| 当前文档事实层 | 当前文档在对话编辑中的最高优先级事实来源层 | `currentFile/currentEditorContent/selection/当前块结构/当前文件锚点` | 知识库条目、历史摘要、自动补强层 |
| 当前文件锚点 | 用户显式点名当前文档时保留的路由锚点语义 | 显式引用当前文件、显式当前文件布尔信号或等价元信息 | 重复注入全文正文 |
| 项目文档层 | 当前 workspace 内除当前文档外、可作为问题补充事实的项目文件层 | 当前工作区相关文档、跨文档目标、同项目文件快照 | 知识库条目、外部资料 |
| workspace 文档层 | 项目文档层在 workspace 维度的同义术语 | 当前 workspace 文件事实范围 | 跨 workspace 资产与知识库结果 |
| canonical HTML | 用于定位与编辑的一致化文档表达 | data-block-id、结构化块内容 | 纯展示 DOM 快照 |
| file_cache | 工作区文件缓存层 | canonical 内容、静默加载结果 | 对用户可见的文件树节点 |
| 静默加载 | 非当前/未打开文件进入可编辑链路的准备过程 | open_file_with_cache、open_docx_with_cache、缓存构建 | 强制切换用户当前编辑焦点 |
| 时间轴（Timeline） | 项目逻辑状态历史的可浏览、可定位、可还原时间视图 | 工作区文件内容状态、资源结构状态的已成立变更 | 聊天历史、AI 过程、diff 审阅过程 |
| 时间轴节点（Timeline Node） | 一次已成立项目逻辑状态变更对应的状态断点 | 可展示、可引用、可执行时间轴还原的状态断点 | 单条 diff、单个 task 阶段、失败操作 |
| 时间轴还原（Timeline Restore） | 基于时间轴节点恢复项目逻辑状态断点的用户动作 | 文件内容恢复、资源结构恢复 | undo/redo、聊天回退、AI 过程回放 |

### 3.3 引用系统与上下文输入

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| 引用（Reference） | 用户显式传给 AI 的结构化输入对象 | 文本/文件/文件夹/记忆/知识库/模板/聊天/链接 | 仅普通聊天文本 |
| 显式引用 | 用户通过 `@`、拖拽、插入对象等方式主动指定给 AI 的结构化输入动作 | `Reference` 对象、显式当前文件锚点、显式知识对象 | 当前文档默认上下文自动注入 |
| TextReference | 带内容与定位信息的文本引用 | sourceFile、content、定位四元组 | 普通 @ 文件引用 |
| FileReference | 文件级引用对象 | path、可读内容或摘要 | 直接编辑定位坐标 |
| FolderReference | 文件夹级引用对象 | path、目录上下文 | 单文件精确编辑目标 |
| MemoryReference | 记忆库引用对象 | 记忆条目内容 | 直接文件路径操作 |
| KnowledgeBaseReference | 知识库引用对象 | 知识条目内容 | 可编辑定位输入 |
| TemplateReference | 模板库引用对象 | 工作流模板定义/约束信息 | 文档当前区间定位 |
| ChatReference | 会话引用对象 | 指定聊天标签或消息片段 | 编辑器选区定位 |
| LinkReference | 链接引用对象 | URL/标题/预览信息 | 本地文件路径语义 |
| 精确引用四元组 | 引用中可用于锁定原文位置的精确区间 | startBlockId/startOffset/endBlockId/endOffset | 模糊文本位置描述 |
| 精确引用锚点（precise reference anchor）| TextReference 携带完整四元组时的精度档，用于锁定正确块与阅读上下文 | `prompt [precise reference anchor]` 标注；同文件引用内容 + 位置 | 显式 selection 零搜索输入；执行级真源 |
| 执行锚点（ExecutionAnchor）| 进入 diff 执行、accept、红删、高亮主链的唯一执行真源对象 | `filePath + blockId/startOffset/endOffset + originalText + baseline/revision` | 仅给模型看的 `block_index`、`target` 命中区间、`para_index`、引用标签文本 |
| 阅读上下文（reading context）| TextReference 行级精度或 FileReference 时的精度档，仅供模型理解 | `prompt no precise anchor` 标注，块内搜索定位 | 伪装为执行锚点；`"apply your best judgment"` 类文案 |
| RichReferenceInfo | 后端引用传输对象，IPC 接收后的统一内部表示 | ref_type/source/content/text_reference(四元组)/knowledge 细粒度 ID | 仅含 type/source/content 的拍平形式 |
| build_reference_prompt | 后端引用提示拼装函数 | 引用类型标题、source 路径、text_reference 位置（若有）、content 正文 | 仅输出 content 而不输出路径和位置的拍平形式 |
| 引用标签（Reference Label） | 引用在 UI 和消息记录中的统一简写标识 | 统一函数生成；主标签为内容摘要，位置只作弱后缀去重，文件级引用 `${fileName}` | 各入口各自拼装的非统一标签；旧格式 `${fileName} (行 N-N)` |
| 引用降级为文本 | 引用标签失效后的退化机制 | 删除引用标记后转普通文本 | 保留结构化引用语义 |
| 引用结构保真 | 引用的结构化字段在传输链路中不被丢弃的约束 | IPC → 后端 → prompt 各层必须保留 source/position/type | 中途将结构化引用拍平为匿名文本 |

### 3.4 AI 三层与工具执行协议

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| 层次一（辅助续写） | 快捷触发的轻量续写能力 | 短建议、低侵入交互 | 多轮工具调用链 |
| 层次二（局部修改） | 选区/块级局部改写能力 | 弹窗内改写、局部上下文 | 对话 diff 池 |
| 层次三（对话编辑） | 完整对话编辑链路 | 工具调用、diff 池、确认生效 | 层次一/二替代 |
| 当前 scope | 当前轮任务默认求解范围 | 当前文档事实层、当前轮显式目标、当前轮 Agent 状态 | 自动扩展到 workspace/知识库的补充范围 |
| workspace scope | 当前轮任务扩展到当前 workspace 的求解范围 | 项目文档层、工作区相关文件和资源 | 知识库与外部资料 |
| 知识检索 | 从知识库中自动或显式取得补强信息的行为 | 自动检索、显式知识引用、结果风险标记 | 当前文档事实构建本身 |
| 知识增强 | 知识检索结果作为 augmentation 层进入上下文的语义 | 补强、裁剪、风险暴露 | 覆盖当前文档事实层或显式引用层 |
| ai_chat_stream | 层次三主执行入口 | 流式响应、tool_call 事件、上下文注入 | 非对话类 AI 快捷入口 |
| tool_call | 模型发起的结构化工具调用单元 | name、arguments、status | 纯文本回复 |
| ToolDefinition | 工具定义契约对象 | name/description/parameters(JSON Schema) | 工具运行时状态 |
| JSON Schema | 工具参数约束格式 | 字段类型、必填、枚举 | 自由文本协议 |

### 3.5 对话编辑定位与 Diff 协议

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| RequestContext | 本轮编辑上下文主对象 | targetFile/L/revision/baselineId/editorTabId | 仅聊天文本 |
| L | 本轮定位与解释使用的逻辑内容快照 | 真实内容状态快照 | pending 假想内容 |
| logicalContent | 当前文档真实逻辑内容状态的实现名 | 已生效真实内容、用于构建 `L` 的源内容 | pending diff 叠加后的展示内容 |
| baselineId | 一轮请求链路唯一基线标识 | 生成/校验/执行追踪绑定 | 统一判死其他 diff 的开关 |
| revision | 真实内容版本序号 | 真实内容变更后递增 | 视觉装饰变更递增 |
| 零搜索路径 | 直接使用显式执行坐标定位的路径 | 编辑器显式选区冻结后的 ExecutionAnchor | 块内 target 文本搜索、精确引用锚点自动冒充 selection |
| 块内搜索路径 | 在指定块内按 target 查找定位 | block_index + target + occurrence_index | 跨块精确坐标直达 |
| 整块替换降级 | 块内精确命中失败后的受控降级 | rewrite_block 或自动 block_level | 无约束整文替换 |
| rewrite_document | 全文重写模式 | 明确全文改写任务 | 多块局部任务偷懒替代 |
| canonical diff | 统一 diff 输出对象 | diffId、区间、原文、新文、类型、路由 | 仅 new_content 全文回写 |
| diff_type | diff 粒度分类 | precise/block_level/document_level | 自定义未登记分类 |
| route_source | canonical diff 的解析来源 | selection/block_search/workspace_resolve | 未标来源 |
| originalText | diff 生成区间原文基准 | 执行前校验、失效判定 | 仅展示文本 |
| occurrence_index | 同块重复命中索引 | 0-based 目标出现次序 | 跨块顺序编号 |
| block_index | 暴露给模型的块编号 | 0-based 块列表索引 | blockId |
| blockId | 块稳定标识符 | data-block-id 对应值 | 给模型直接使用 |
| data-block-id | 文档节点上的块 ID 属性 | 块定位、映射、索引构建 | 样式属性 |
| BlockTreeIndex | 与 baseline 绑定的块树索引 | block path、文本边界、hash | 脱离基线的全局长期索引 |

### 3.6 Diff 状态、执行与观测

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| Diff 池 | 同目标文档共享的待处理修改集合 | 跨轮次、跨聊天标签 pending 项统一管理 | 每个聊天独立互不影响池 |
| 显示状态 | 用户可见的视觉状态 | 删除标记、卡片三态、高亮 | 真实内容判定依据 |
| 逻辑状态 | 文档真实生效状态 | 原文 + accepted 结果 | pending/rejected/expired |
| pending diff | 尚未被用户接受或拒绝、仅处于待决策池中的 diff 项 | 待确认卡片、文档侧删除标记候选 | 真实逻辑内容的一部分 |
| pending | 待用户决策状态 | 可接受/可拒绝 | 已生效 |
| accepted | 已执行并生效状态 | 真实内容已写入 | 仅视觉确认 |
| rejected | 用户拒绝状态 | 不生效，退出待执行 | 自动失败状态 |
| expired | 失效状态 | 不可继续操作、静默灰态 | 执行失败观测事件本身 |
| execute_failed | 执行层失败事件语义 | 应用失败、约束失败、失败暴露记录；含 `retryable` 字段，retryable=true 时由 `DiffRetryController` 排入重试队列，retryable=false 时转为 `expired` | `expired` 业务状态本身；retryable 字段不改变本事件的"观测层"定性 |
| 全部接受事务化 | 批量执行规则 | 先读后写、稳定排序、统一刷新 | 边执行边重算集合 |
| 跳过继续 | 局部失败不中断整批任务 | 失败条目跳过、其余继续 | 一条失败全量回滚 |
| ExecutionExposure | 执行失败观测对象 | 错误码、阶段、上下文、可追踪信息 | 业务状态（pending/expired）替代 |
| 失效处理 | diff 的业务状态流转 | pending -> expired 的静默处理 | 错误上报机制 |
| 失败暴露 | 执行层可观测事件输出 | 日志/观测面板统一输出 | 改写 diff 业务状态语义 |
| verification | Agent/任务闭环中的验证对象 | 输出验证、步骤验证、verification summary | 用户确认动作本身 |
| confirmation | 需要用户做出显式确认的闭环对象 | 接受/确认/阻断判断 | 自动验证结果本身 |
| stage_complete | 当前阶段正式闭合的状态结论 | 验证满足、确认满足、闭环决策成立 | 仅自然语言总结或 UI 展示完成；由 `AgentTaskController` 唯一推进，禁止 UI 组件或 shadow runtime 直接写入 |
| invalidated | 当前阶段或任务链路失效并需回退重建的状态 | restore 后失效、边界变化、关键前提被破坏 | 一般失败提示；由 `AgentTaskController` 按规则裁决，不由 diff 操作自动触发 |
| shadow runtime | 非业务主真源的运行时镜像/投影状态，生命周期仅限会话内存 | 运行时快照、展示同步对象、过渡运行态 | 业务状态和协议主真源；持久化存储（数据库/磁盘）；跨会话状态恢复依据 |

### 3.7 编辑器与展示语义

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| Diff 卡 | 聊天侧修改决策载体 | 待执行/已执行/已失效展示与操作 | 文档正文直接改写预览 |
| 删除标记（Deletion Mark） | 文档侧待确认修改可视标记 | 红底、删除线、状态联动清理 | 新增内容正文直写 |
| Decoration | 文档侧动态渲染装饰层 | 删除标记、状态映射 | 真实内容存储 |
| Mapping | 用户编辑后位置映射机制 | mappedFrom/mappedTo 更新 | 逻辑状态重建主算法 |
| 红删范围 | 待审阅 diff 在文档中的删除定位范围 | 从 ExecutionAnchor 解析，并可派生 mappedFrom/mappedTo | 独立于执行真源的第二套定位 |
| 绿高亮范围 | diff 接受后对新写入内容的反馈范围 | 接受应用事务产生的 acceptedFrom/acceptedTo | 原始 ExecutionAnchor 本体 |

### 3.8 Chat Build（当前唯一生效构建主线）

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| Chat Build | 当前唯一生效的项目级构建主线，以自然对话完成需求收敛，经大纲确认后进入单主控冻结式构建 | chat 前置讨论、构建触发、轻量确认、大纲确认、正式构建、手动中断、结果结束 | Discussion Build、多人协作构建、真人讨论房间 |
| 自由讨论 | 构建开始前的自然语义讨论阶段 | 澄清目标、补充约束、引入引用输入 | 正式构建执行 |
| 构建触发 | 从自由讨论进入构建流程的显式动作或明确意图成立点 | 按钮触发、明确构建指令、进入确认层 | 直接开跑正式构建 |
| 轻量确认层 | 构建触发后的最小准入闸口，用于确认系统是否进入大纲阶段 | 进入大纲、返回继续讨论 | 直接替代大纲确认 |
| Build Outline / 构建大纲 | 正式构建前的规划结果，用于冻结本轮构建目标和预计产物范围 | 目标摘要、产物范围、执行骨架 | 最终生成内容本身 |
| 大纲确认 | 正式构建前的硬边界，用户确认本轮构建目标与执行骨架 | 确认开始、取消返回讨论、要求重生大纲 | 跳过确认直接构建 |
| 正式构建 | 大纲确认后启动的单主控执行阶段 | 冻结式执行、状态推进、结果生成 | 继续自由讨论、语义改向 |
| 构建执行态 | 正式构建运行中的状态区间 | `building` / `interrupted` / `completed` / `failed` | 大纲确认前的讨论态 |
| 只读展示 | 构建执行中的用户侧表现形式 | 状态、进度、可读过程说明、中断控制 | 边执行边编辑需求 |
| 手动中断 | 用户主动终止当前构建运行的控制动作 | 显式中断、结束当前运行、返回讨论前置条件 | 通过自然聊天改写当前构建 |
| 完成结束 | 构建成功完成后的结束态 | 结果可查看、可进入后续处理 | 继续在同一运行里改需求 |
| 失败结束 | 构建因错误结束后的结束态 | 失败暴露、停止当前运行 | 静默吞错继续运行 |
| 中断结束 | 构建因用户手动中断而结束的状态 | 当前运行终止、回到讨论并重新开始 | 将中断理解为需求修改成功生效 |
| 新项目资源 | Chat Build 当前允许生成的输出对象 | 新目录、新文件、相关资源文件、必要状态记录 | 修改既有工作区内容 |

当前 Chat Build 术语对应的统一规则源头见：`A-CBT-I-P-01_Chat Build最小协议与状态.md` 中的 `BR-CBT-*` 规则矩阵。

### 3.8.1 旧 BLD / Future Design 术语（非当前生效）

以下术语只保留为 `Reference / Future Design Term`，不得在当前主线中当作标准术语使用：

| 术语 | 状态 | 说明 |
|---|---|---|
| 构建模式（Build Mode） | Future / Reference | 旧 BLD 体系总称，不等于当前 Chat Build 主线 |
| Direct Build | Future / Reference | 旧 BLD 路径名，不作为当前标准术语 |
| Discussion Build | Future / Reference | 当前不生效，不得写为当前主线 |
| Discussion Room | Future / Reference | 当前不存在讨论房间主链 |
| Master AI | Future / Reference | 当前不存在主控 AI / 角色 AI 协作主链 |
| Role AI | Future / Reference | 当前不存在多角色 AI 执行体系 |
| Project Object | Future / Reference | 当前不作为主线产物对象定义 |

### 3.9 模型接入与兼容策略

| 术语 | 定义 | 包含 | 不包含 |
|---|---|---|---|
| 官方适配模型 | MVP 保证可用的模型接入 | DeepSeek、OpenAI、Anthropic | 所有供应商逐一原生接入 |
| 兼容接口适配层 | OpenAI 兼容协议接入策略 | 自定义 Base URL / API Key / Model Name | 100% 行为一致承诺 |
| 测试基线模型 | 日常回归与成本控制基线 | DeepSeek 优先回归 | 限制用户仅用单模型 |

---

## 四、禁用术语与禁用字段

| 禁用项 | 替换项 | 说明 |
|---|---|---|
| 智能关联修改（旧层次三） | 对话编辑 | 旧命名废弃 |
| 黑盒改写 | 对话编辑（diff 决策） | 强调“先确认后生效” |
| 自动覆盖 | 用户决策生效 | 禁止误导为无确认写入 |
| 历史记录（当指项目逻辑状态演进视图时） | 时间轴 | 该功能主术语已升级 |
| 历史项（当指项目逻辑状态断点时） | 时间轴节点 | 统一节点语义 |
| 历史还原（当指项目状态恢复时） | 时间轴还原 | 与 undo/redo 区分 |
| 历史系统（当指该功能时） | 时间轴系统 | 统一系统语义 |
| 模糊定位 | 结构化定位 | 必须有坐标或明确块定位 |
| 构建模式（当指当前主线时） | Chat Build | 当前唯一生效术语 |
| 直接构建（当指当前主线时） | Chat Build / 正式构建 | 禁止把旧 BLD 路径名写成当前主线名 |
| 讨论构建 | 非当前生效术语 | 当前只可作为 reference/future term 提及 |
| 讨论组 / 主控AI / 角色AI / Project Object | 未来参考术语 | 不得写成当前版本术语 |
| scope（旧编辑协议） | edit_mode + block_index 体系 | 旧字段禁用 |
| target_content / instruction | target / content | 旧字段禁用 |
| edit_target.anchor（模型直接给 blockId） | 零搜索坐标注入或 block_index | 模型不直接接触 blockId |
| `editTarget`（`ReferenceProtocol` 旧字段） | **已废弃（2026-04）**：前端不再写入，后端不再读取 | 执行锚点统一由 `ExecutionAnchor` 承载；`textReference` 只保留精确引用锚点语义 |

---

---

> **本轮修订说明（2026-04-14）**：  
> 1. §3.6 `stage_complete`：补充唯一推进主体（`AgentTaskController`）与禁止路径。  
> 2. §3.6 `invalidated`：补充由 `AgentTaskController` 裁决，不由 diff 操作自动触发。  
> 3. §3.6 `shadow runtime`：补充生命周期边界（会话内存）与持久化禁止范围。  
> 4. §3.6 `execute_failed`：补充 `retryable` 字段语义与 `DiffRetryController` 消费规则。  
> 新增关联文档：`A-AG-M-T-05_AgentTaskController设计.md`。
>
> **本轮修订说明（2026-04-16）**：  
> 1. §4 禁用术语表：新增 `editTarget`（`ReferenceProtocol` 旧字段）废弃说明。  
>    前端 `referenceProtocolAdapter.ts` 不再写入，后端 `ai_commands.rs` `extract_reference_anchor_for_zero_search` 不再读取。  
>    执行级真源统一收口为 `ExecutionAnchor`；`textReference` 只保留精确引用锚点语义。  
> 2. §5 清单第 12 条：新增零搜索路径锚点失效必须结构化报错，禁止 `unwrap_or_default` 兜底。

## 五、MVP 术语一致性检查清单

1. “目标文件”与“当前活动文件”必须分开描述。  
2. “L / baselineId / revision”必须同时出现并语义区分。  
3. “pending”不得被描述为“已应用”。  
4. “失效处理”和“失败暴露”不得混用。  
5. “零搜索/块内搜索/降级”必须按固定层级描述。  
6. “rewrite_document”只能用于明确全文改写。  
7. 文档定位口径统一使用“块号/块ID语义”，不以行号作为主定位。  

8. "RichReferenceInfo"必须保留 text_reference 四元组（若前端提供），不得在 IPC 转换层丢弃。  
9. "build_reference_prompt"输出必须包含 source 路径和 text_reference 位置（若有），不得仅输出 content。  
10. 引用标签必须由统一函数生成，禁止各入口各自拼装。主标签格式为内容摘要，位置只允许作为弱后缀去重，文件级引用保留 `${fileName}`。  
11. 引用正文不得同时通过用户消息 content 展开和 references 协议双重注入。  
12. 零搜索路径（Step 2a）中若 `extract_block_range` 失败（block anchor 过期），必须返回结构化 `Err`（`E_RANGE_UNRESOLVABLE`），**禁止** `unwrap_or_default()` 产生空 `originalText` 继续下游，避免生成无效 diff。
