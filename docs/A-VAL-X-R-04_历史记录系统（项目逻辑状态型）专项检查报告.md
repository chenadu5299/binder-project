# 历史记录系统（项目逻辑状态型）专项检查报告

## 1. 检查目标与检查口径

### 1.1 本次“历史记录”的定义

本次检查中的“历史记录”只指：

**项目逻辑状态已经成立后的变更记录。**

只有当某项操作已经真正使项目从状态 `S(n)` 进入 `S(n+1)`，该变化才属于本次口径下的历史记录候选。

### 1.2 哪些算历史

本次口径下，属于历史候选的对象包括：

1. 已确认并实际写入项目文件的内容修改
2. 已确认并正式进入工作区的新建文件
3. 已确认并正式进入工作区的新建文件夹
4. 已确认并实际生效的资源重命名、移动、复制、删除
5. 已确认并写入项目的格式编辑、结构编辑、块编辑
6. 任何已经改变项目成立状态的资源级操作

### 1.3 哪些明确不算历史

以下对象在本次检查中明确排除：

1. `pending diffs`
2. `reject / expired diff`
3. `DiffCard / FileDiffCard` 审阅过程
4. `chat messages`
5. `agent_tasks / agent_artifacts`
6. `memory_items`
7. `knowledge_documents(version)`
8. `file_cache`
9. `baseline / revision / positioning snapshot`
10. 外部修改检测、被动 reload、mtime 变化、cache sync
11. 调试日志、失败暴露、操作日志类结构

### 1.4 事实来源

本次检查以当前代码实现为唯一主事实来源，文档只作为补充上下文，不用文档设想替代代码事实。

---

## 2. 当前项目中“逻辑状态变更”的成立点检查

### 2.1 已打开编辑器文档的人工编辑

#### 当前链路

`TipTap onChange`
-> `EditorPanel.handleContentChange`
-> `editorStore.updateTabContent`
-> `EditorTab.content` 更新，`isDirty = content !== lastSavedContent`
-> 手动保存或自动保存
-> `documentService.saveFile`
-> `write_file` / `save_docx`
-> `markTabSaved`

关键代码：

1. `editorStore.updateTabContent` 只更新当前 tab 内容和 `isDirty`，不写盘：`src/stores/editorStore.ts:119-144`
2. `lastSavedContent` 明确区分“已保存状态”和“当前编辑中状态”：`src/stores/editorStore.ts:13-22`、`src/stores/editorStore.ts:146-159`
3. 手动保存真正调用 `documentService.saveFile` 并在成功后 `markTabSaved`：`src/components/Editor/EditorPanel.tsx:312-345`
4. 自动保存同样以 `documentService.saveFile` 为成立点：`src/components/Editor/EditorPanel.tsx:419-450`
5. `documentService.saveFile` 真正调用 `write_file` 或 `save_docx`：`src/services/documentService.ts:709-745`

#### 成立时刻

对已打开编辑器文档而言，**逻辑状态成立点不是编辑器内容变化本身，而是保存成功写盘之后。**

也就是说：

1. `updateTabContent` 只是内存中的未提交状态推进
2. `markTabSaved` 之前，变化仍处于“当前编辑态”
3. `documentService.saveFile` 成功返回后，才进入项目逻辑状态

#### 判定

1. `saveFile`：属于逻辑状态提交点
2. `updateTabContent`：不属于历史，只是候选/工作态
3. `lastSavedContent/isDirty`：部分对齐，可区分候选态与已成立态，但不是历史链

### 2.2 已打开编辑器文档中的 diff 接受

#### 当前链路

`DiffCard accept`
-> `applyDiffReplaceInEditor`
-> `diffStore.acceptDiff`
-> `editorStore.updateTabContent`

关键代码：

1. `acceptDiff` 只把 `diffStore.byTab[filePath].diffs[diffId].status` 改为 `accepted`：`src/stores/diffStore.ts:896-914`
2. 接受后会调用 `updateTabContent(tab.id, editor.getHTML())`：`src/components/Chat/ChatMessages.tsx:474-479`、`src/components/Chat/ToolCallCard.tsx:457-461`
3. `acceptAllByDiffIds` 也是把替换应用到编辑器，并调用 `acceptDiff`：`src/stores/diffStore.ts:500-566`、`src/stores/diffStore.ts:1058-1088`

#### 成立时刻

对已打开编辑器文档而言，**接受 diff 不等于逻辑状态成立。**

它只意味着：

1. AI 候选修改被用户采纳到了当前编辑器内容
2. 当前内存文档发生变化
3. 若随后未保存，项目实际文件状态并未改变

因此这条链的成立点仍然回落到：

`accept diff`
-> `editor content changed`
-> `saveFile`

#### 判定

1. `acceptDiff`：不属于历史成立点
2. `acceptDiff` 之后的 `saveFile`：才属于逻辑状态成立点
3. `DiffCard`：只是候选采纳界面，必须与历史主链隔离

### 2.3 未打开文件的确认写入

#### 当前链路

`update_file(use_diff=true)`
-> 生成 `pending_diffs`
-> 用户确认
-> `accept_file_diffs`
-> 写盘
-> 删除 `pending_diffs`
-> 更新 `file_cache`

关键代码：

1. `update_file` 默认 `use_diff=true`，只生成 pending，不写盘：`src-tauri/src/services/tool_service.rs:691-806`
2. `accept_file_diffs` 读取 `pending_diffs`、生成最终内容并 `std::fs::write` / `convert_html_to_docx`：`src-tauri/src/workspace/workspace_commands.rs:431-525`
3. `reject_file_diffs` 只是删除 pending，不成立任何项目状态：`src-tauri/src/workspace/workspace_commands.rs:528-533`

#### 成立时刻

对未打开文件而言，**逻辑状态成立点就是 `accept_file_diffs` 写盘成功时。**

这里与打开文件链不同：

1. `accept_file_diffs` 本身已经包含“确认 + 写盘”
2. 不需要再经过编辑器保存
3. `pending_diffs` 在成立后被删除，不保留历史

#### 判定

1. `accept_file_diffs`：属于逻辑状态提交点
2. `pending_diffs`：不属于历史，只是候选承载体
3. `reject_file_diffs`：不属于历史

### 2.4 新建文件 / 新建文件夹

#### 当前链路

前端：

`ResourceToolbar.handleInputConfirm`
-> `fileService.createFile/createFolder`
-> 刷新文件树

`NewFileButton.handleInputConfirm`
-> `fileService.createFile/createFolder`
-> 记录元数据
-> 可选自动打开

后端：

`file_commands.create_file`
-> `std::fs::write` 或 `convert_html_to_docx`

`file_commands.create_folder`
-> `std::fs::create_dir_all`

关键代码：

1. `ResourceToolbar` 创建成功后才刷新树和本地占位历史：`src/components/FileTree/ResourceToolbar.tsx:103-169`
2. `NewFileButton` 创建成功后记录 Binder 文件来源并可自动打开：`src/components/FileTree/NewFileButton.tsx:65-127`
3. `create_file` 真正创建文件并写入初始内容：`src-tauri/src/commands/file_commands.rs:83-152`
4. `create_folder` 真正创建文件夹：`src-tauri/src/commands/file_commands.rs:154-185`

#### 成立时刻

**新建文件 / 文件夹在后端创建成功时就已经进入项目逻辑状态。**

注意：

1. 自动打开文件不是成立点，只是后续 UI 行为
2. `recordBinderFile` 只写元数据，辅助识别来源，不是历史记录

#### 判定

1. `create_file` / `create_folder`：属于逻辑状态成立点
2. `recordBinderFile`：邻接但不同，不属于历史主链
3. `HistorySection` 对这里的记录只是 UI 占位，不是事实层

### 2.5 资源树级操作：重命名 / 删除 / 复制 / 移动

#### 当前链路

前端：

`FileTree.handleRename/delete/duplicate/move`
-> `fileService.renameFile/deleteFile/duplicateFile/moveFile`
-> 刷新文件树

后端：

1. `rename_file`：`std::fs::rename`
2. `delete_file`：`remove_file` / `remove_dir_all`
3. `duplicate_file`：`std::fs::copy`
4. `move_file`：`rename` 或 `copy + remove`

关键代码：

1. 前端入口：`src/components/FileTree/FileTree.tsx:284-339`
2. `rename_file`：`src-tauri/src/commands/file_commands.rs:425-457`
3. `delete_file`：`src-tauri/src/commands/file_commands.rs:460-494`
4. `duplicate_file`：`src-tauri/src/commands/file_commands.rs:514-554`
5. `move_file`：`src-tauri/src/commands/file_commands.rs:556-645`

#### 成立时刻

这些操作的成立点都在后端文件系统调用成功时，属于直接改变项目资源结构的逻辑状态变更。

#### 判定

1. 重命名 / 删除 / 复制 / 移动：都属于逻辑状态变化
2. 当前实现没有统一提交总线；每种资源操作各自直写

### 2.6 AI 直接写盘分支

虽然本次不做 AI 过程检查，但仍需判断哪些路径会直接改变项目逻辑状态。

关键代码：

1. `tool_service.create_file` 成功即直接创建文件：`src-tauri/src/services/tool_service.rs:467-560`
2. `tool_service.update_file` 若 `use_diff=false`，直接原子写盘：`src-tauri/src/services/tool_service.rs:808-831`

判定：

1. 这两条属于项目逻辑状态的直接变更路径
2. 但它们不是历史系统，只是另外两条提交入口
3. 当前不存在统一的“所有项目状态提交都必须经过同一写入器”结构

### 2.7 是否存在统一提交点

不存在统一提交点。

当前至少存在以下分叉路径：

1. 打开文件编辑器保存：`EditorPanel -> documentService.saveFile -> write_file/save_docx`
2. 未打开文件确认写入：`accept_file_diffs`
3. 资源创建：`create_file/create_folder`
4. 资源结构变更：`rename_file/delete_file/duplicate_file/move_file`
5. AI 直接写盘分支：`tool_service.create_file`、`tool_service.update_file(use_diff=false)`

结论：

当前项目逻辑状态确实有多个成立入口，但没有统一提交主链。

---

## 3. 当前实现中可作为“逻辑状态历史基础”的结构检查

| 结构名 | 所在位置 | 当前职责 | 是否服务逻辑状态成立 | 是否可作为未来历史基础 | 判定 |
|---|---|---|---|---|---|
| `EditorTab.lastSavedContent` | `src/stores/editorStore.ts` | 标记最近一次已保存内容 | 是，用于区分未保存态/已保存态 | 可作为提交前后边界信号 | 部分对齐 |
| `EditorTab.isDirty` | `src/stores/editorStore.ts` | 标记当前编辑是否偏离已保存态 | 是，但只在内存中 | 可作为候选态判别信号 | 部分对齐 |
| `documentService.saveFile` | `src/services/documentService.ts` | 已打开文档的真实保存入口 | 是 | 可作为历史写入点候选 | 对齐 |
| `accept_file_diffs` | `src-tauri/src/workspace/workspace_commands.rs` | 未打开文件的确认写盘入口 | 是 | 可作为历史写入点候选 | 对齐 |
| `create_file` / `create_folder` | `src-tauri/src/commands/file_commands.rs` | 新资源正式创建 | 是 | 可作为历史写入点候选 | 对齐 |
| `rename_file` / `delete_file` / `duplicate_file` / `move_file` | `src-tauri/src/commands/file_commands.rs` | 已成立资源结构变更 | 是 | 可作为历史写入点候选 | 对齐 |
| `tool_service.update_file(use_diff=false)` | `src-tauri/src/services/tool_service.rs` | 直接写盘更新文件 | 是 | 可作为历史写入点候选，但需单独管控 | 部分对齐 |
| `tool_service.create_file` | `src-tauri/src/services/tool_service.rs` | AI 路径下直接创建文件 | 是 | 可作为历史写入点候选，但不能混入 AI 过程链 | 部分对齐 |
| `file_cache` | `src-tauri/src/workspace/workspace_db.rs` | 当前文件缓存 | 否 | 不适合作为历史基础 | 邻接但不同 |
| `pending_diffs` | `src-tauri/src/workspace/workspace_db.rs` | 候选修改缓存 | 否 | 只能做上游信号 | 邻接但不同 |
| `HistorySection` / `binder-history` | `src/components/FileTree/HistorySection.tsx` | 本地 UI 占位 | 否 | 不建议复用为历史主链 | 不建议复用 |
| `record_binder_file` | `src-tauri/src/commands/file_commands.rs` | 记录文件来源元数据 | 否 | 只能辅助来源识别 | 邻接但不同 |
| `workspace.db` 现有表整体 | `src-tauri/src/workspace/workspace_db.rs` | 存当前态与候选态 | 部分 | 可承载未来历史表，但现有表本身不够 | 部分对齐 |

### 3.1 关键判断

当前最接近“逻辑状态历史基础”的，不是某张已有历史表，而是以下几类**成立点入口**：

1. `documentService.saveFile`
2. `accept_file_diffs`
3. `create_file/create_folder`
4. `rename_file/delete_file/duplicate_file/move_file`
5. `tool_service.update_file(use_diff=false)` 与 `tool_service.create_file`

当前最缺的是：

1. 成立后事件的持久记录点
2. 提交后的状态快照链
3. 统一的历史对象 ID
4. 项目级统一收口

---

## 4. 容易与逻辑状态历史混淆的现有结构排查

### 4.1 `pending diffs`

为什么会混淆：

1. 它描述的是“将要变成项目状态的候选变化”
2. 它看起来像“上一版本到下一版本”的差异

真实职责：

1. 候选审阅载体
2. 未成立前的待确认修改池

判断：

1. 是否可作为上游信号：可以
2. 是否能进入历史主链：不能
3. 是否必须隔离：必须

### 4.2 `DiffCard / FileDiffCard`

为什么会混淆：

1. UI 上像“变更记录卡”
2. 用户会在卡片上做接受/拒绝

真实职责：

1. 审阅界面
2. 候选交互层

判断：

1. 是否可作为上游信号：可以，间接
2. 是否能作为历史主链：不能
3. 是否必须隔离：必须

### 4.3 `accept/reject`

为什么会混淆：

1. “接受”这个词很像“提交”
2. 但当前有两种语义

真实职责：

1. 打开文件链的 `acceptDiff` 只改编辑器内存态：`src/stores/diffStore.ts:896-914`
2. 未打开文件链的 `accept_file_diffs` 直接写盘：`src-tauri/src/workspace/workspace_commands.rs:431-525`

判断：

1. `acceptDiff`：必须隔离，不能当历史成立点
2. `accept_file_diffs`：属于状态成立点，可作为历史接入点
3. `reject*`：都不应进入逻辑状态历史

### 4.4 `file_cache`

为什么会混淆：

1. 有“快照”“缓存内容”“hash”“mtime”
2. 容易被误读成版本存储

真实职责：

1. 当前态缓存
2. 打开文件与未打开文件链的对齐基线

判断：

1. 是否可作为上游信号：可以，辅助比对当前态
2. 是否能作为历史主链：不能
3. 是否必须隔离：必须

### 4.5 `baseline / revision / snapshot`

为什么会混淆：

1. 命名上非常像版本控制
2. 实际用于当前轮校验与定位

真实职责：

1. 保证候选 diff 不在过期文档上误应用
2. 不承担项目成立状态的持久记录

判断：

1. 可作为上游信号：可以
2. 可作为历史主链：不能
3. 必须隔离：必须

### 4.6 `agent_tasks / agent_artifacts`

为什么会混淆：

1. 带有过程留痕与阶段概念
2. 容易被误并入“项目历史”

真实职责：

1. 任务过程状态
2. 产物摘要

判断：

1. 与逻辑状态历史概念混淆：高
2. 可作为上游信号：一般不需要
3. 必须隔离：必须

### 4.7 `chat messages`

为什么会混淆：

1. 表面上是时间顺序记录
2. 但它记录的是对话，不是项目成立状态

判断：

1. 只能做追溯引用
2. 不能进入历史主链
3. 必须隔离

### 4.8 `memory_items`

为什么会混淆：

1. 它也保留“过去的信息”
2. 但保存的是提炼后的知识，不是项目状态变更

判断：

1. 不能进入历史主链
2. 必须隔离

### 4.9 `external modification detection`

为什么会混淆：

1. 它会导致编辑器内容刷新
2. 刷新后看起来像“状态变化”

真实职责：

1. 处理磁盘外部变化带来的冲突
2. 不是项目内部确认后的变更

判断：

1. 可作为告警信号：可以
2. 可进入历史主链：不能
3. 必须隔离：必须

### 4.10 `HistorySection` 本地占位结构

为什么会混淆：

1. 它直接命名为“历史记录”
2. `type` 枚举里甚至包含 `save_file`、`edit_file`、`ai_edit_file`

真实职责：

1. 只是 localStorage UI 占位
2. 当前只有 `ResourceToolbar` 调用，且仅记录创建文件/文件夹成功或失败：`src/components/FileTree/HistorySection.tsx:132-154`、`src/components/FileTree/ResourceToolbar.tsx:118-168`

判断：

1. 可作为上游信号：基本不建议
2. 能否作为历史主链：绝不能
3. 必须隔离：必须

---

## 5. 外部修改、被动同步、缓存刷新与历史记录的边界检查

### 5.1 当前系统对外部修改的处理路径

当前路径：

1. 编辑器每 5 秒检查一次外部修改：`src/components/Editor/EditorPanel.tsx:142-170`
2. 若检测到外部修改，用户可选择：
   - 继续覆盖：仅更新 `lastModifiedTime`，不改内容：`src/components/Editor/EditorPanel.tsx:175-186`
   - 加载外部更改：读取磁盘内容，令 pending diff 失效，并更新编辑器内容：`src/components/Editor/EditorPanel.tsx:188-214`

结论：

**外部修改进入编辑器显示，不属于本次口径下的历史记录。**

因为：

1. 这不是 Binder 内部确认形成的项目逻辑状态提交
2. 它是系统对外部现实状态的被动对齐

### 5.2 当前系统对 reload / refresh / cache sync 的处理路径

1. 保存后会更新 `file_cache`：`src/services/documentService.ts:727-739`
2. 后端 `sync_workspace_file_cache_after_save` 只是把已保存内容同步到缓存：`src-tauri/src/workspace/workspace_commands.rs:536-590`
3. 文件树监听 `file-tree-changed` 后刷新，但会忽略自身保存引发的短时刷新：`src/components/FileTree/FileTree.tsx:50-77`、`src/stores/fileStore.ts:10-23`、`src/stores/fileStore.ts:64-73`

结论：

1. `cache sync` 不是历史
2. `file-tree refresh` 不是历史
3. `markEditorSaveComplete/shouldIgnoreFileTreeRefresh` 是 UI 稳定性逻辑，不是状态历史

### 5.3 这些路径是否会误进入逻辑状态历史

当前代码里没有正式逻辑状态历史系统，因此还没有“误记入历史表”的现成问题。

但如果后续建设历史系统，以下路径最容易被误记：

1. `handleLoadExternalChanges` 重新读盘后的 `updateTabContent`
2. `sync_workspace_file_cache_after_save` 的 cache 更新
3. `file-tree-changed` 引发的界面刷新
4. `mtime/content_hash` 变化

### 5.4 后续建设时应如何避免误记

必须坚持以下边界：

1. 只有 Binder 内部确认后的写盘/资源变更入口可以写历史
2. 外部修改加载路径一律不写历史
3. cache 更新、刷新、重读、索引更新一律不写历史
4. 历史写入点必须在“成立动作成功返回”之后，而不是在 UI 层之前

---

## 6. 当前实现距离“项目逻辑状态历史系统”还缺哪些关键基础

### 6.1 状态提交基础

已具备：

1. 多个真实成立点入口已经存在
2. 打开文件链可用 `lastSavedContent/isDirty` 区分未提交态与已保存态

缺失：

1. 没有统一提交总线
2. 没有统一“状态成立事件”模型

### 6.2 状态快照基础

已具备：

1. 当前态文件内容可从磁盘或 `file_cache` 获得

缺失：

1. 没有“提交后快照表”
2. 没有“前一状态 -> 后一状态”的净变化归档

### 6.3 历史对象基础

已具备：

1. 文件路径、资源路径、工作区路径这些对象主键

缺失：

1. 历史事件 ID
2. 事件类型枚举
3. 事件与对象的稳定关联表

### 6.4 回退 / 重做基础

已具备：

1. 已打开编辑器内存在“当前编辑态 vs 最近保存态”区分

缺失：

1. 历史状态链
2. 任意一个已成立状态的回退能力
3. 项目级重做语义

### 6.5 项目级统一状态基础

已具备：

1. 文件、文件夹、文档编辑、未打开文件确认写入这些都已有明确物理写入点

缺失：

1. 项目级统一收口
2. 各类成立操作的统一落账口径

### 6.6 多类型操作统一收口基础

当前问题最明显的地方是：

1. 已打开文档通过 `saveFile` 成立
2. 未打开文件通过 `accept_file_diffs` 成立
3. 新建/删除/移动等通过各自 Tauri command 成立
4. 直接工具写盘又是一条旁路

结论：

当前最缺的不是“能不能记录”，而是“从哪个统一层记录”。

---

## 7. 结论

### 7.1 当前项目是否已经存在“逻辑状态历史”的雏形？

**不存在正式雏形。**

更准确地说：

1. 存在“逻辑状态成立点”
2. 存在“未提交态与已保存态”的局部区分
3. 不存在任何真正的“已成立状态历史链”

### 7.2 当前最接近历史主链的结构是什么？

最接近的不是某个现成表，而是几类**真实提交入口**：

1. `documentService.saveFile`
2. `accept_file_diffs`
3. `create_file/create_folder`
4. `rename_file/delete_file/duplicate_file/move_file`

其中，最像“文档状态提交主链”的是：

`EditorPanel -> documentService.saveFile -> write_file/save_docx`

### 7.3 当前最容易误接入历史系统、但实际上必须隔离的结构是什么？

最需要隔离的有五类：

1. `pending diffs`
2. `DiffCard / FileDiffCard`
3. `file_cache`
4. `baseline / revision / snapshot`
5. `HistorySection` localStorage 占位

尤其要强调：

`acceptDiff` 很容易被误当“历史成立”，但对打开文件链来说它只是把候选改动放进当前编辑器内容，不等于项目状态已提交。

### 7.4 当前若直接做历史系统，最大的结构风险是什么？

最大风险是：

**把“编辑器候选态采纳”“保存写盘”“未打开文件确认写盘”“资源结构改动”“cache sync”“外部修改加载”混成一个历史入口。**

这会直接导致：

1. 候选态被误记为已成立历史
2. 外部同步被误记为用户历史
3. cache 被误当版本
4. 多条提交路径口径不一致

### 7.5 当前是否需要先做新的专项约束文档，再进入开发？

需要。

原因：

1. 当前没有统一提交总线
2. 不先冻结“什么时刻算成立”，后续一定会把候选层、缓存层和事实层混掉

---

## 8. 附录A：历史记录准入对象草表（按本次口径）

| 对象/操作 | 当前实现位置 | 是否属于逻辑状态历史 | 原因 | 是否需要与历史系统隔离 | 备注 |
|---|---|---|---|---|---|
| 编辑器确认修改后未保存 | `src/stores/editorStore.ts` + `src/stores/diffStore.ts` | 不属于 | 只改内存态/当前编辑态 | 需要隔离 | `acceptDiff` 不等于提交 |
| 编辑器保存成功 | `src/components/Editor/EditorPanel.tsx` + `src/services/documentService.ts` | 属于 | 已真实写盘 | 不隔离，应接入 | 手动保存和自动保存同口径 |
| 新生成内容确认写入（未打开文件） | `src-tauri/src/workspace/workspace_commands.rs` `accept_file_diffs` | 属于 | 用户确认后直接写盘 | 不隔离，应接入 | 当前最明确的确认提交点 |
| 新建文档 | `src-tauri/src/commands/file_commands.rs:create_file` | 属于 | 文件创建成功即进入项目 | 不隔离，应接入 | 初始模板内容也算成立状态 |
| 新建文件夹/资源 | `src-tauri/src/commands/file_commands.rs:create_folder` | 属于 | 资源结构已变化 | 不隔离，应接入 | 与 UI 是否打开无关 |
| 格式编辑 | `TipTap -> saveFile` | 属于，但仅在保存成功后 | 格式变更随 HTML/DOCX 一并写盘 | 候选态需要隔离 | 无单独格式提交点 |
| 结构编辑 | `TipTap -> saveFile` | 属于，但仅在保存成功后 | 块结构变化保存后成立 | 候选态需要隔离 | 与内容编辑共用保存链 |
| `pending diff` | `workspace.db.pending_diffs` / `diffStore` | 不属于 | 候选态 | 必须隔离 | 只能作上游信号 |
| `reject diff` | `diffStore` / `reject_file_diffs` | 不属于 | 未形成项目成立状态 | 必须隔离 | 明确排除 |
| `task/artifact` | `agent_tasks/agent_artifacts` | 不属于 | 任务过程，不是项目逻辑状态 | 必须隔离 | 明确排除 |
| 聊天消息 | `chatStore.messages` | 不属于 | 对话不是项目状态变更 | 必须隔离 | 明确排除 |
| 外部修改同步 | `EditorPanel.handleLoadExternalChanges` | 不属于 | 被动对齐外部状态 | 必须隔离 | 明确排除 |
| `file_cache` 更新 | `sync_workspace_file_cache_after_save` | 不属于 | 只是缓存同步 | 必须隔离 | 不能当版本 |
| `save` 行为 | `documentService.saveFile` | 属于 | 对已打开文档是实际提交点 | 不隔离，应接入 | 当前最关键接入点之一 |
| 重命名/删除/复制/移动 | `file_commands.rs` | 属于 | 资源结构直接变化 | 不隔离，应接入 | 当前无留痕 |
| `HistorySection` localStorage | `src/components/FileTree/HistorySection.tsx` | 不属于 | 只是 UI 占位，且记录极少 | 必须隔离 | 不能当事实层 |

---

## 9. 附录B：后续若建设历史系统，最小接入点候选清单

### 9.1 状态提交入口候选

1. `src/services/documentService.ts` 的 `saveFile`
2. `src-tauri/src/workspace/workspace_commands.rs` 的 `accept_file_diffs`
3. `src-tauri/src/commands/file_commands.rs` 的 `create_file`
4. `src-tauri/src/commands/file_commands.rs` 的 `create_folder`
5. `src-tauri/src/commands/file_commands.rs` 的 `rename_file`
6. `src-tauri/src/commands/file_commands.rs` 的 `delete_file`
7. `src-tauri/src/commands/file_commands.rs` 的 `duplicate_file`
8. `src-tauri/src/commands/file_commands.rs` 的 `move_file`
9. `src-tauri/src/services/tool_service.rs` 的 `update_file(use_diff=false)`
10. `src-tauri/src/services/tool_service.rs` 的 `create_file`

### 9.2 适合作为历史写入点候选的位置

1. 各后端命令成功返回之后
2. `documentService.saveFile` 调用底层写入成功之后
3. `accept_file_diffs` 写盘成功并删除 pending 之后
4. 资源结构操作命令成功完成之后

### 9.3 绝不能作为历史主入口的位置

1. `editorStore.updateTabContent`
2. `diffStore.acceptDiff`
3. `diffStore.rejectDiff`
4. `pending_diffs`
5. `file_cache`
6. `sync_workspace_file_cache_after_save`
7. `handleLoadExternalChanges`
8. `HistorySection.addHistoryRecord`
9. `agent_tasks / agent_artifacts`
10. `chatStore.messages`

### 9.4 需进一步核查项

1. 当前是否还有其它未被 UI 主链调用、但可直接改写工作区文件的 Tauri 命令
2. 拖拽导入路径 `fileService.writeFile` 是否应纳入未来逻辑状态历史边界
3. `tool_service.create_file/update_file(use_diff=false)` 在实际产品策略中是否全部暴露给用户可见流程
