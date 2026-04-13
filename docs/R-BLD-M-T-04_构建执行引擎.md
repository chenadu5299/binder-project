# 构建执行引擎

> 状态：`REFERENCE ONLY`
>
> 本文档属于旧版 Build Mode / Discussion Build / Multi-Actor Build 设计参考，不是当前生效主线。
> 当前唯一生效主线见 [`docs/README.md`](./README.md) 与 [`A-CBT-C-D-01_Chat Build产品定义与边界.md`](./A-CBT-C-D-01_Chat%20Build产品定义与边界.md)。
> 若本文与当前代码现状或 Active 文档冲突，以 Active 文档和代码现状为准。

## 文档头

- 结构编码：`BLD-M-T-04`
- 文档属性：`旧体系参考`
- 主责模块：`BLD`
- 文档职责：`长任务编排机制、后台执行模型、不可打断约束、进度状态管理、失败恢复策略`
- 上游约束：`BLD-M-D-02`, `BLD-M-T-01`, `BLD-M-T-03`
- 直接承接：`R-BLD-X-L-01`
- 接口耦合：`R-BLD-I-P-01`, `R-BLD-M-P-01`
- 汇聚影响：`R-BLD-M-T-01`
- 扩散检查：`R-BLD-M-P-01`, `R-BLD-I-P-01`
- 使用边界：`定义执行引擎技术机制，不承担具体 AI 模型调用协议（见 BLD-M-P-01）`
- 变更要求：`修改本文后，必须复核：R-BLD-M-T-03、R-BLD-I-P-01`

---

## 一、文档定位

本文定义构建执行引擎的技术机制。

构建执行阶段是构建模式中技术复杂度最高的部分：任务时间长（分钟到几十分钟）、不可中断、需要后台运行、需要进度追踪。

本文覆盖：任务生命周期、编排机制、后台执行模型、进度管理、失败处理。

---

## 二、执行任务生命周期

### 2.1 任务状态定义

```
PENDING → PLANNING → CONFIRMED → RUNNING → COMPLETED
                                     ↓
                                  FAILED
                                  PARTIAL
```

| 状态 | 含义 |
|---|---|
| PENDING | 构建任务已创建，等待开始规划 |
| PLANNING | 主控 AI 正在生成 Build Outline |
| CONFIRMED | Build Outline 已确认（用户确认或自动跳过），等待执行 |
| RUNNING | 主控 AI 正在按 Outline 执行，生成文件 |
| COMPLETED | 全部文件生成完成，Project Object 写入成功 |
| FAILED | 执行过程中发生不可恢复错误 |
| PARTIAL | 部分文件生成成功，但未全部完成（因错误中止） |

### 2.2 状态转换规则

| 从 | 到 | 条件 |
|---|---|---|
| PENDING | PLANNING | 用户点击「开始构建」|
| PLANNING | CONFIRMED | 用户确认 Build Outline（或自动跳过确认）|
| PLANNING | PLANNING | 用户修改后重新生成 Outline（循环）|
| CONFIRMED | RUNNING | 系统自动触发执行 |
| RUNNING | COMPLETED | 所有 Outline 步骤执行完成 |
| RUNNING | PARTIAL | 部分步骤成功，但因错误中止 |
| RUNNING | FAILED | 关键步骤失败，无法继续 |

---

## 三、Build Outline 执行编排

### 3.1 步骤执行模型

主控 AI 按 Build Outline 的 `execution_order` 顺序执行每个步骤。

每个步骤对应 Project Object 中的一个文件生成任务。

### 3.2 步骤状态

每个步骤（文件）有独立状态：

| 步骤状态 | 含义 |
|---|---|
| WAITING | 等待执行（依赖项未完成）|
| IN_PROGRESS | 正在生成 |
| COMPLETED | 生成完成并写入文件 |
| FAILED | 生成失败 |
| SKIPPED | 跳过（由于依赖失败）|

### 3.3 依赖关系处理

- `depends_on` 为空的步骤可以立即执行（或并行执行）。
- `depends_on` 非空的步骤，必须等待所有依赖步骤 COMPLETED 后才能执行。
- 依赖步骤 FAILED 时，当前步骤标记为 SKIPPED。

> 待定：第一版是否支持并行执行？（建议第一版强制串行，降低复杂度）

### 3.4 主文档最后生成

主文档（file_type = main_doc）通常依赖所有子文档，放在执行顺序最末。

主控 AI 在规划阶段生成 Outline 时，必须保证主文档的 `depends_on` 包含所有子文档路径。

---

## 四、后台执行模型

### 4.1 后台执行定义

进入 RUNNING 状态后，支持用户切走（切到编辑模式或其他操作）。

构建在后台继续运行，不因用户切换界面而暂停。

### 4.2 技术实现

> 待定：后台执行的具体技术实现（Tauri 异步任务？OS 层后台线程？）

建议：使用 Tauri 异步任务（`tokio::spawn`），与前端通过 Tauri 事件通道推送进度。

### 4.3 进度推送

执行期间，后端每完成一个步骤，通过 Tauri 事件推送进度到前端：

```json
{
  "event": "build_progress",
  "payload": {
    "task_id": "<uuid>",
    "total_steps": <number>,
    "completed_steps": <number>,
    "current_step": {
      "file_path": "<相对路径>",
      "title": "<文档标题>",
      "status": "IN_PROGRESS | COMPLETED | FAILED"
    },
    "overall_status": "RUNNING | COMPLETED | PARTIAL | FAILED"
  }
}
```

### 4.4 前端进度展示

前端在以下位置展示构建进度：

1. **构建面板**（用户未切走时）：全量进度展示，步骤列表，当前步骤高亮。
2. **状态栏/通知区**（用户切走时）：简要进度（"构建中：8/15 步"）。
3. **完成通知**：构建完成时推送系统通知，引导用户查看结果。

> 待定：具体 UI 展示形式。

---

## 五、不可打断约束

### 5.1 约束定义

进入 RUNNING 状态后：

1. 不接受用户对构建输入的修改。
2. 不接受"暂停构建"操作。
3. 不接受"取消构建"操作（第一版）。

> 待定：第一版是否需要支持"取消构建"？如果支持，取消后如何处理已生成文件？

### 5.2 不可打断的边界

不可打断仅约束**构建执行本身**，不约束用户的其他操作：

- 用户可以切换到编辑模式编辑其他文件。
- 用户可以查看文件树。
- 用户可以进行任何不涉及当前构建任务的操作。

### 5.3 并发构建限制

同一 Workspace 同一时刻只能有一个处于 RUNNING 状态的构建任务。

如果用户尝试启动第二个构建：

1. 系统拒绝，提示当前有构建任务进行中。
2. 用户可以查看当前任务进度。

---

## 六、失败处理策略

### 6.1 步骤级失败

单个文件生成步骤失败时：

1. 该步骤标记为 FAILED。
2. 依赖该步骤的后续步骤标记为 SKIPPED。
3. 不依赖该步骤的后续步骤继续执行。
4. 任务最终状态为 PARTIAL（有成功步骤）或 FAILED（关键步骤失败）。

### 6.2 关键步骤失败

以下情况定义为关键失败，任务直接转为 FAILED：

1. 主文档生成失败。
2. 主控 AI 无法生成有效响应（连续超时/空响应）。

> 待定：重试机制（步骤失败是否自动重试？重试几次？）

### 6.3 失败后的文件状态

失败后，已生成的文件**保留**在 Project Object 目录中。

`_build_meta.json` 更新：

```json
{
  "status": "partial",
  "failed_steps": ["<file_path>", ...],
  "error_summary": "<错误描述>"
}
```

### 6.4 不支持断点续建（第一版）

第一版不支持从失败点继续构建。

如需补全未完成的部分，用户需要：

1. 手动编辑已生成文件。
2. 或重新触发新的构建任务（会创建新的 Project Object）。

---

## 七、执行时长预估

构建任务的执行时间取决于：

1. Project Object 中文件数量和内容长度。
2. 模型响应速度（网络 + 模型延迟）。
3. 是否并行执行步骤。

**预估范围：** 几分钟到几十分钟。

系统应在用户触发构建前，根据 Build Outline 提供时间估算。

> 待定：时间估算算法（基于 `estimated_tokens` × 模型速率？）

---

## 八、关联文档

1. `R-BLD-M-T-01_构建模式AI架构.md`（Master AI 执行职责）
2. `R-BLD-M-T-03_项目实体模型.md`（Project Object 结构与写入规则）
3. `R-BLD-M-P-01_主控AI与角色AI协议.md`（AI 调用协议）
4. `R-BLD-I-P-01_构建模式与Workspace接口.md`（文件写入接口）
