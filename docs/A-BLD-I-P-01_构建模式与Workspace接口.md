# 构建模式与 Workspace 接口

## 文档头

- 结构编码：`BLD-I-P-01`
- 文档属性：`主结构`
- 主责模块：`BLD`
- 文档职责：`构建模式与 Workspace 文件系统的接口契约：讨论结果写入规范、Project Object 落盘协议、标签记忆对接`
- 上游约束：`BLD-M-T-03`, `BLD-M-T-04`
- 直接承接：无
- 接口耦合：`A-WS-M-T-03`, `A-WS-C-T-01`, `A-AST-M-T-01`
- 汇聚影响：`A-BLD-M-T-03`
- 扩散检查：`A-WS-M-T-03`
- 使用边界：`定义构建模式对 Workspace 的写入契约，不承担 Workspace 内部实现细节`
- 变更要求：`修改本文后，必须复核：A-BLD-M-T-03、A-BLD-M-T-04、A-WS-M-T-03`

---

## 一、文档定位

本文定义构建模式与 Workspace 文件系统之间的接口契约。

本文覆盖：

1. Project Object 的落盘协议（写入时机、位置、命名、原子性）。
2. 讨论结果（记录、总结、决策快照）的写入规范。
3. 构建模式任务状态的持久化。
4. 标签记忆对接（讨论组走 AST 标签记忆规范）。

---

## 二、Project Object 落盘协议

### 2.1 写入命令

构建模式通过以下 Tauri 命令与 Workspace 交互：

> 待定：构建模式专属的 Tauri 命令名称清单

预期命令：

| 命令 | 职责 |
|---|---|
| `build_create_project_dir` | 创建 Project Object 目录，写入初始 `_build_meta.json` |
| `build_write_project_file` | 写入单个文件（增量，每步完成后调用） |
| `build_finalize_project` | 更新 `_build_meta.json` 为 completed 状态 |
| `build_mark_project_failed` | 更新 `_build_meta.json` 为 failed/partial 状态 |

### 2.2 写入位置

Project Object 写入 Workspace 根目录下。

默认位置：`<workspace_root>/<project_name>/`

> 待定：是否允许用户在触发构建时自定义写入位置？

### 2.3 目录命名冲突处理

如果目标目录已存在：

1. 追加时间戳后缀：`<project_name>_<yyyyMMddHHmm>/`
2. 不覆盖已有目录。

### 2.4 写入时序

```
1. 构建任务进入 RUNNING 状态
   → 调用 build_create_project_dir
   → 在 Workspace 文件树中创建目录（空目录，带 _build_meta.json）

2. Master AI 每完成一个文件生成步骤
   → 调用 build_write_project_file
   → 文件立即出现在文件树中（增量可见）

3. 全部步骤完成
   → 调用 build_finalize_project
   → _build_meta.json 更新 status=completed

4. 构建失败
   → 调用 build_mark_project_failed
   → _build_meta.json 更新 status=partial/failed，记录失败信息
   → 已写入文件保留不删除
```

### 2.5 写入原子性

- 单个文件写入是原子的（写完整再暴露给文件树）。
- 整个 Project Object 的写入**不是原子的**（增量可见，支持进度显示）。
- `_build_meta.json` 的 status 字段是整体完成的唯一标识。

### 2.6 不触发 Diff 机制

构建模式的文件写入**不经过 DiffStore**，直接写入 Workspace 文件系统。

构建模式不调用 `edit_current_editor_document` 或任何 Diff 相关命令。

---

## 三、讨论结果写入规范

### 3.1 写入内容

讨论组触发构建时，写入以下内容到 Workspace：

| 内容 | 文件名 | 格式 | 是否必须 |
|---|---|---|---|
| 讨论原始记录 | `_discussion_log.md` | Markdown | 可选（用户决定）|
| 结构化总结 | `_discussion_summary.md` | Markdown | 是 |
| 决策快照 | `_decision_snapshot.json` | JSON | 是 |

### 3.2 写入位置

以上文件写入 Project Object 目录根层级（与主文档同级）。

以 `_` 开头的文件为系统生成文件，建议在文件树中以特殊样式区分。

> 待定：`_` 前缀文件在文件树中的展示策略。

### 3.3 `_discussion_summary.md` 结构

```markdown
# 讨论总结

## 讨论组信息
- 讨论组 ID：{id}
- 创建时间：{created_at}
- 结束时间：{finished_at}
- 讨论组类型：{open | internal}
- 参与者：{participants}

## 主控 AI 收束结论

### 共识点
{consensus_list}

### 分歧点
{divergence_list}

### 最终采用方案
{adopted_proposal}

## 构建触发信息
- 触发人：{triggered_by}
- 触发时间：{triggered_at}
- 触发时确认状态：{confirmation_snapshot_summary}
```

### 3.4 `_decision_snapshot.json` 结构

```json
{
  "discussion_room_id": "<uuid>",
  "final_summary": { ... },
  "trigger": {
    "triggered_by": "<发起人 ID>",
    "triggered_at": "<ISO 8601>",
    "room_state_at_trigger": "IN_PROGRESS | WAITING_CONFIRMATION",
    "confirmation_snapshot": [...]
  }
}
```

---

## 四、构建任务状态持久化

### 4.1 存储位置

构建任务状态持久化到 Workspace DB（`workspace.db`）。

> 待定：构建任务表的具体 Schema 定义。

预期表结构：

```sql
CREATE TABLE build_tasks (
  task_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  project_name TEXT NOT NULL,
  build_mode TEXT NOT NULL,          -- direct | discussion
  status TEXT NOT NULL,              -- PENDING | PLANNING | ...
  project_dir TEXT,                  -- Project Object 目录路径
  outline_json TEXT,                 -- Build Outline 快照
  discussion_room_id TEXT,           -- 讨论构建时非空
  created_at INTEGER NOT NULL,       -- Unix timestamp
  started_at INTEGER,
  completed_at INTEGER,
  error_message TEXT
);
```

### 4.2 状态查询

前端通过以下命令查询构建任务状态：

> 待定：查询命令名称

### 4.3 历史记录

构建完成后，任务记录保留在 `build_tasks` 表中（不自动清理）。

> 待定：历史记录的清理策略（保留多少条？时间窗口？）

---

## 五、标签记忆对接

### 5.1 讨论组作为聊天标签

讨论组在记忆体系中被视为一个聊天标签（与普通聊天 Tab 同等对待）。

讨论组的记忆走 `A-AST-M-T-01_记忆模型.md` 定义的标签记忆规范。

### 5.2 对接边界

| 内容 | 归属 | 说明 |
|---|---|---|
| 讨论消息历史 | BLD 模块管理 | 不进入 AST 记忆体系 |
| 标签级摘要记忆 | AST 模块（标签记忆） | 遵循标签记忆生命周期 |
| 知识库 | AST 模块（用户主动生产） | 与构建模式无直接关系 |
| 项目级记忆 | 讨论总结写入 Workspace | 不使用 AST 记忆库 |

### 5.3 记忆写入时机

讨论组进入 FINISHED 状态后，触发标签记忆写入（遵循标签记忆规范定义的写入时机）。

---

## 六、文件树展示约束

构建完成后，Project Object 在 Workspace 文件树中的展示：

1. Project Object 目录与普通目录相同展示方式。
2. `_build_meta.json`、`_discussion_summary.md`、`_decision_snapshot.json` 等系统文件：

> 待定：是否默认隐藏？还是展示但标注只读？

3. 构建中的目录：在文件树中展示构建进度标识（如加载动画）。

> 待定：构建中状态的文件树 UI 方案。

---

## 七、关联文档

1. `A-BLD-M-T-03_项目实体模型.md`（Project Object 结构定义）
2. `A-BLD-M-T-04_构建执行引擎.md`（写入时序）
3. `A-WS-C-T-01_workspace模型定义.md`（Workspace 基础模型）
4. `A-WS-M-T-03_文件系统.md`（文件系统实现）
5. `A-AST-M-T-01_记忆模型.md`（标签记忆规范）
