# Binder 时间轴系统技术主控文档

## 文档头

- 结构编码：`WS-M-T-06`
- 文档属性：`主结构`
- 主责模块：`WS`
- 文档职责：`Binder 时间轴系统技术主控 / 时间轴技术架构、主链规则与专项承接总入口`
- 上游约束：`CORE-C-D-02`, `WS-M-D-01`, `WS-M-D-02`, `WS-M-T-03`, `WS-M-T-04`, `WS-M-T-05`, `A-VAL-X-R-04`
- 直接承接：`WS-M-T-07`, `WS-M-T-08`, `WS-M-T-09`
- 接口耦合：`DE-M-D-01`, `SYS-I-P-01`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`, `WS-M-D-01`, `WS-M-D-02`, `WS-M-T-04`
- 扩散检查：`WS-M-T-07`, `WS-M-T-08`, `WS-M-T-09`, `src/services/documentService.ts`, `src-tauri/src/workspace/workspace_commands.rs`, `src-tauri/src/services/tool_service.rs`, `src/components/FileTree/HistorySection.tsx`
- 使用边界：`定义时间轴系统的技术主链、总体架构、承接关系与规则映射，不直接承担数据库定稿和具体开发排期`
- 变更要求：`修改本文后，必须复核上游描述文档、专项规则文档、实现入口文件与测试映射`
- 规则映射要求：`本文规则统一使用 TL-MAIN-R-*；专项文档必须引用本文对应主规则`

---

## 1. 文档目标与适用范围

### 1.1 文档定位

本文是 Binder 时间轴系统的技术主控文档。

本文回答的不是“时间轴在产品上是什么”，而是：

1. 时间轴系统在技术上是什么
2. 时间轴系统在当前 Binder 架构中的位置是什么
3. 时间轴主链如何从成立入口收口到节点生成、持久化、展示和还原
4. 哪些问题由主控文档定义，哪些问题拆给专项文档承接
5. 后续开发和测试应从哪些入口进入

### 1.2 适用对象

本文面向：

1. 时间轴系统开发
2. 时间轴系统测试设计
3. 时间轴相关架构评审
4. 与工作台、文件系统、对话编辑链路的接口对齐

### 1.3 本文解决什么问题

本文解决以下问题：

1. 时间轴系统的技术主语和边界
2. 时间轴主链的技术结构
3. 时间轴与当前实现入口的衔接关系
4. 时间轴与 diff / AI / task / 外部同步 / cache 的隔离方式
5. 专项文档的拆分依据与承接关系

### 1.4 本文不解决什么问题

本文不直接解决：

1. 最终数据库字段定稿
2. 还原弹窗的最终 UI 视觉稿
3. 所有边缘异常的逐条实现细节
4. 完整开发排期和人力分工

这些内容分别由专项文档与后续落地计划承接。

---

## 2. 时间轴系统技术定义

### 2.1 技术主语

时间轴系统在技术上不是“历史列表组件”，也不是“日志表”。

时间轴系统的技术主语是：

**围绕项目逻辑状态成立点，对稳定且可恢复的状态变化进行准入判断、节点化持久化、列表展示与断点还原的工作区级系统。**

### 2.2 与描述文档的对应关系

本文严格承接 [A-WS-M-D-02_Binder时间轴功能描述文档.md](/Users/chenzhenqiang/Desktop/test/binder-project/docs/A-WS-M-D-02_Binder时间轴功能描述文档.md) 已冻结的产品语义：

1. 时间轴只记录项目逻辑状态的已成立变更
2. 当前阶段只覆盖工作区文件内容状态与资源结构状态
3. 时间轴节点粒度是一次已成立状态变更对应的状态断点
4. 时间轴还原是恢复到状态断点，不是逆操作，也不是 diff 重放
5. 成立入口成功不等于必然新增节点，只有发生实际状态变化才新增
6. 当前阶段上限为 50 条正式时间轴节点

### 2.3 当前阶段范围

当前阶段时间轴系统的技术范围包括：

1. 文件内容成立点收口
2. 资源结构成立点收口
3. 时间轴节点准入判断
4. 时间轴节点持久化
5. 工作台“时间轴”标签加载与展示
6. 时间轴还原执行链

当前阶段明确不包括：

1. AI 过程归档
2. diff 审阅过程归档
3. task / artifact 过程归档
4. 外部修改同步归档
5. 通用审计日志系统

### 2.4 非目标与排除项

当前阶段的非目标：

1. 不把时间轴系统实现成操作日志回放系统
2. 不把时间轴系统实现成编辑器 undo/redo 栈
3. 不把时间轴系统实现成 file_cache 的版本扩展
4. 不把当前 localStorage 占位记录升级为正式事实层

---

## 3. 系统整体架构

### 3.1 时间轴系统在 Binder 中的位置

时间轴系统位于 Binder 当前架构中的“成立状态之后、工作台展示之前”的层级。

它与现有模块的关系如下：

1. 编辑器和文件服务负责产生“文件内容成立点”
2. Workspace 命令和文件命令负责产生“未打开文件 / 资源结构成立点”
3. 时间轴系统在这些成立点之后执行统一准入判断
4. 准入通过后写入时间轴事实层
5. 工作台“时间轴”标签从时间轴事实层加载节点
6. 时间轴还原从时间轴节点回到文件系统和资源结构主链

### 3.2 文字化结构图

当前阶段推荐采用以下结构化表达：

1. `StateCommit Entry`
   - 来自 `documentService.saveFile`
   - 来自 `workspace_commands.accept_file_diffs`
   - 来自 `file_commands.*`
   - 来自 `tool_service.create_file/update_file(use_diff=false)/delete_file/move_file/rename_file/create_folder`

2. `TimelineCommit Adapter`
   - 统一把成立入口规范化为 `StateCommitCandidate`
   - 执行准入判断和实际状态变化判断

3. `Timeline Persistence`
   - 将通过准入的提交转换为时间轴节点和还原载荷
   - 落入 `workspace.db` 的正式时间轴表

4. `Timeline Presentation`
   - `HistorySection` 保留组件壳
   - 数据源切换为正式时间轴事实层

5. `Timeline Restore`
   - 从时间轴节点加载断点载荷
   - 执行文件内容恢复 / 资源结构恢复
   - 成功后重新进入一次时间轴提交主链

### 3.3 与现有模块的具体关系

1. 与 [documentService.ts](/Users/chenzhenqiang/Desktop/test/binder-project/src/services/documentService.ts)
   - `saveFile` 是已打开编辑器文件的成立点
   - 当前只负责写盘和同步 `file_cache`
   - 后续需在此后挂接时间轴提交适配层

2. 与 [workspace_commands.rs](/Users/chenzhenqiang/Desktop/test/binder-project/src-tauri/src/workspace/workspace_commands.rs)
   - `accept_file_diffs` 是未打开文件链的成立点
   - 当前负责写盘、删除 pending diff、更新 `file_cache`
   - 后续需在写盘成功后进入时间轴提交适配层

3. 与 [tool_service.rs](/Users/chenzhenqiang/Desktop/test/binder-project/src-tauri/src/services/tool_service.rs)
   - `update_file(use_diff=true)` 只生成候选 diff，不进入时间轴
   - `update_file(use_diff=false)`、`create_file`、`delete_file`、`move_file`、`rename_file`、`create_folder` 属于直接成立入口

4. 与 [file_commands.rs](/Users/chenzhenqiang/Desktop/test/binder-project/src-tauri/src/commands/file_commands.rs)
   - 前端工具栏直接调用 `create_file/create_folder/rename_file/delete_file/duplicate_file/move_file`
   - 当前只有 localStorage 占位侧写
   - 后续应统一接入正式时间轴提交适配层

5. 与 [workspace_db.rs](/Users/chenzhenqiang/Desktop/test/binder-project/src-tauri/src/workspace/workspace_db.rs)
   - 当前有 `file_cache`、`pending_diffs`、`agent_tasks`、`agent_artifacts`
   - 当前没有正式时间轴事实层
   - 后续应在 `workspace.db` 新增时间轴相关表

### 3.4 与未来 StateCommit 的关系

当前代码没有正式的 `StateCommit` 统一提交层。

因此，当前阶段的技术主张是：

**时间轴系统先引入 `StateCommitCandidate -> TimelineCommit Adapter` 统一适配层，再逐步演化为更通用的 StateCommit 层。**

这层的职责是：

1. 统一不同成立入口的提交语义
2. 统一“实际状态变化”判断口径
3. 统一时间轴节点写入触发
4. 统一时间轴还原成功后的再入链逻辑

代码示例：

```ts
type StateCommitCandidate =
  | {
      kind: 'file_content';
      source: 'saveFile' | 'accept_file_diffs' | 'tool_update_file' | 'tool_create_file';
      workspacePath: string;
      filePath: string;
      beforeContent: string | null;
      afterContent: string;
      actor: 'user' | 'ai' | 'system_restore';
    }
  | {
      kind: 'resource_structure';
      source: 'create_file' | 'create_folder' | 'rename_file' | 'delete_file' | 'duplicate_file' | 'move_file';
      workspacePath: string;
      operation: string;
      targetPath: string;
      beforeState: unknown;
      afterState: unknown;
      actor: 'user' | 'ai' | 'system_restore';
    };

async function commitTimelineCandidate(candidate: StateCommitCandidate): Promise<void> {
  if (!shouldCreateTimelineNode(candidate)) return;
  const node = buildTimelineNode(candidate);
  await timelineRepository.insertNode(node);
  await timelineRepository.trimToLimit(candidate.workspacePath, 50);
}
```

---

## 4. 时间轴主链

### 4.1 主链总览

时间轴主链由六步组成：

1. 捕获成立入口
2. 规范化为 `StateCommitCandidate`
3. 执行时间轴准入判断
4. 生成时间轴节点与断点载荷
5. 持久化并裁剪到 50 条
6. 工作台时间轴列表加载展示

### 4.2 状态成立入口

当前真实成立入口包括：

1. `documentService.saveFile`
2. `workspace_commands.accept_file_diffs`
3. `file_commands.create_file`
4. `file_commands.create_folder`
5. `file_commands.rename_file`
6. `file_commands.delete_file`
7. `file_commands.duplicate_file`
8. `file_commands.move_file`
9. `tool_service.update_file(use_diff=false)`
10. `tool_service.create_file`
11. `tool_service.delete_file`
12. `tool_service.move_file`
13. `tool_service.rename_file`
14. `tool_service.create_folder`

### 4.3 时间轴准入判断

时间轴准入判断必须回答两件事：

1. 这是不是一个已成立的项目逻辑状态变化
2. 这次变化相对上一已成立状态有没有实际变化

准入判断不通过的典型情况：

1. `update_file(use_diff=true)` 只是 pending diff
2. `saveFile` 成功但内容未变
3. 外部修改同步
4. `file_cache` 更新
5. 失败操作

### 4.4 节点生成

准入通过后，系统生成一个时间轴节点。

节点生成包含两部分：

1. 节点元信息
2. 还原所需断点载荷

当前阶段主张：

1. 一次成立动作默认生成一个节点
2. 一个节点对应一个状态断点
3. 一个成立动作如果影响多个对象，仍记录为一个节点，但 `impact_scope` 中列出全部影响对象

### 4.5 节点持久化

节点持久化必须满足：

1. 与 `workspace.db` 共域
2. 与节点载荷同事务写入
3. 插入后立即执行 50 条正式节点裁剪
4. 裁剪时同时删除相关断点载荷

### 4.6 UI 展示

工作台继续使用现有 “时间轴” 标签。

当前阶段的 UI 主链是：

1. `HistorySection` 作为时间轴标签承载壳
2. 数据源从 `binder-history` localStorage 迁移到 `workspace.db`
3. 时间轴节点按时间倒序展示
4. 节点详情可触发“还原”

### 4.7 时间轴还原

时间轴还原主链是：

1. 用户选择时间轴节点
2. 确认覆盖当前状态和影响范围
3. 执行断点恢复
4. 刷新 `file_cache` / 文件树 / 打开标签
5. 如果恢复后状态确实变化，写入一个新的时间轴节点

### 4.8 失败路径

时间轴主链中的失败处理必须区分：

1. 准入失败
   - 不写节点
   - 不算错误
   - 只表示“不属于时间轴”

2. 持久化失败
   - 成立动作本身已完成
   - 时间轴写入失败需要暴露错误
   - 不能回滚已成立业务状态

3. 还原失败
   - 不写新节点
   - 给用户明确错误提示
   - 保持当前状态不变

---

## 5. 当前实现承接分析

### 5.1 当前可直接承接的部分

当前代码可直接承接的部分：

1. 成立入口已存在且边界清晰
2. `workspace.db` 已经是工作区级持久化宿主
3. 工作台时间轴标签和面板壳已存在
4. `accept_file_diffs` 与 `saveFile` 的写盘语义清晰

### 5.2 当前必须新增的部分

必须新增：

1. 正式时间轴事实层
2. `StateCommitCandidate -> TimelineCommit Adapter`
3. 时间轴节点持久化表
4. 时间轴还原命令
5. UI 从正式事实层加载节点

### 5.3 当前需要改造的部分

需要改造：

1. `HistorySection` 从 localStorage 切换到正式数据源
2. `ResourceToolbar` 不再直接把占位节点写入 localStorage
3. `documentService.saveFile` 成功后需进入时间轴适配层
4. `workspace_commands.accept_file_diffs` 成功后需进入时间轴适配层
5. `tool_service` 直接成立入口需进入同一适配层

### 5.4 当前最大技术风险

当前最大技术风险有三个：

1. 没有统一提交层，容易在多个成立入口重复实现时间轴逻辑
2. 没有正式断点载荷结构，容易把时间轴实现成“只会显示不会还原”
3. 打开文件链、未打开文件链、资源链的口径如果不统一，后续节点语义会分裂

---

## 6. 开发落地顺序建议

### 6.1 Phase 1：时间轴事实层与只读展示

目标：

1. 建立 `workspace.db` 时间轴表
2. 建立节点写入仓储
3. 让 `HistorySection` 从正式数据源读取

输出：

1. 正式时间轴节点持久化
2. 时间轴列表可用
3. localStorage 占位退出主链

### 6.2 Phase 2：成立入口收口与自动写入

目标：

1. 建立 `TimelineCommit Adapter`
2. 把 `saveFile`、`accept_file_diffs`、资源结构入口接入适配层
3. 完成“实际状态变化过滤”

输出：

1. 时间轴节点自动生成
2. 50 条裁剪生效
3. 非时间轴对象被稳定排除

### 6.3 Phase 3：时间轴还原

目标：

1. 建立时间轴还原命令
2. 建立确认流程
3. 建立还原成功后的再入链

输出：

1. 可执行时间轴还原
2. 还原成功写入新节点
3. 打开标签 / 文件树 / cache 刷新闭环

### 6.4 Phase 4：一致性与测试补齐

目标：

1. 覆盖多入口一致性测试
2. 覆盖 50 条裁剪测试
3. 覆盖还原失败和 dirty 编辑器阻断策略

---

## 7. 规则清单与规则 ID 映射

### 7.1 规则 ID 总表

| 规则 ID | 规则内容 | 来源 | 展开文档 | 影响模块 | 测试重点 |
|---|---|---|---|---|---|
| `TL-MAIN-R-01` | 时间轴系统只服务项目逻辑状态的已成立变更 | `WS-M-D-02` 2.1 | 本文 | Workspace / UI / DB | 准入排除 |
| `TL-MAIN-R-02` | 当前阶段只覆盖工作区文件内容状态与资源结构状态 | `WS-M-D-02` 2.3 | 本文 | Workspace / File Commands | 范围边界 |
| `TL-MAIN-R-03` | 时间轴必须通过统一提交适配层收口，不得在各入口散写 | 本文 3.4 | 本文 | `documentService` / `workspace_commands` / `tool_service` | 多入口一致性 |
| `TL-MAIN-R-04` | 时间轴节点生成采用“成立点收口 + 实际状态变化过滤” | `WS-M-D-02` 7.2 | `WS-M-T-07` | 全部成立入口 | 空操作过滤 |
| `TL-MAIN-R-05` | 时间轴节点必须绑定可还原的状态断点载荷 | `WS-M-D-02` 2.5 / 6.3 | `WS-M-T-08` | DB / Restore | 还原有效性 |
| `TL-MAIN-R-06` | 时间轴还原恢复状态断点，不做逆操作回滚或 diff 重放 | `WS-M-D-02` 6.3 | `WS-M-T-09` | Restore / UI | 语义正确性 |
| `TL-MAIN-R-07` | 时间轴成功还原且状态确实变化时，必须写入新节点 | `WS-M-D-02` 6.6 | `WS-M-T-09` | Restore / Persistence | 还原后收口 |
| `TL-MAIN-R-08` | pending diff / AI / task / 外部同步 / cache 不进入时间轴 | `WS-M-D-02` 3.2 | 本文 + 专项文档 | Diff / AI / File Cache | 排除规则 |
| `TL-MAIN-R-09` | 50 条上限只适用于正式时间轴节点 | `WS-M-D-02` 7.4 | `WS-M-T-08` | DB / UI | 裁剪 |
| `TL-MAIN-R-10` | 工作台继续使用“时间轴”标签，现有 `HistorySection` 仅作为迁移壳 | `WS-M-D-02` 4.1 / 5.4 | 本文 | UI | 迁移一致性 |

### 7.2 专项规则映射

| 专项文档 | 规则前缀 | 主要承接 |
|---|---|---|
| `WS-M-T-07` | `TL-GEN-R-*` | 准入判断、节点生成、实际状态变化过滤 |
| `WS-M-T-08` | `TL-STORE-R-*` | 节点模型、断点载荷、持久化、50 条裁剪 |
| `WS-M-T-09` | `TL-RESTORE-R-*` | 还原执行链、确认流程、失败处理、还原后新节点 |

---

## 8. 结论

当前阶段 Binder 时间轴系统的技术主张是：

1. 不新造第二套“历史模块”，而是在现有成立入口上加统一提交适配层
2. 不把时间轴做成日志系统，而是做成可还原的状态断点系统
3. 不把还原做成逆操作回滚，而是做成状态断点恢复
4. 先建立正式事实层，再建立还原链，再逐步演进为更完整的 StateCommit 层

本文是时间轴技术文档体系的总入口；后续生成规则、存储模型和还原执行细节，统一由对应专项文档展开。
