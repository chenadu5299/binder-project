# 时间轴节点生成与准入规则

## 文档头

- 结构编码：`WS-M-T-07`
- 文档属性：`主结构`
- 主责模块：`WS`
- 文档职责：`时间轴节点生成与准入规则 / 成立入口收口、实际状态变化过滤与节点粒度主控`
- 上游约束：`WS-M-D-02`, `WS-M-T-06`, `WS-M-T-03`, `WS-M-T-04`, `A-VAL-X-R-04`
- 直接承接：无
- 接口耦合：`DE-M-D-01`, `SYS-I-P-01`
- 汇聚影响：`WS-M-T-06`, `WS-M-T-08`, `WS-M-T-09`, `src/services/documentService.ts`, `src-tauri/src/workspace/workspace_commands.rs`, `src-tauri/src/services/tool_service.rs`
- 扩散检查：`diffStore.ts`, `HistorySection.tsx`, `workspace_db.rs`
- 使用边界：`只定义时间轴节点的来源、准入、排除、粒度与生成判断，不承担存储定稿与还原执行细节`
- 变更要求：`修改本文后，必须复核主控文档规则映射、成立入口实现与测试用例`
- 规则映射要求：`本文规则统一使用 TL-GEN-R-*，并映射到 TL-MAIN-R-04 / TL-MAIN-R-08`

---

## 1. 文档目标

本文解决以下问题：

1. 哪些成立入口可以成为时间轴节点候选来源
2. 哪些来源明确不得进入时间轴
3. 如何判断“实际状态变化”
4. 多类型成立动作如何映射为节点粒度
5. 自动保存、资源结构变化、多资源变化如何计入节点

---

## 2. 成立入口清单

### 2.1 文件内容成立入口

当前真实文件内容成立入口：

1. `documentService.saveFile`
2. `workspace_commands.accept_file_diffs`
3. `tool_service.update_file(use_diff=false)`
4. `tool_service.create_file`

### 2.2 资源结构成立入口

当前真实资源结构成立入口：

1. `file_commands.create_file`
2. `file_commands.create_folder`
3. `file_commands.rename_file`
4. `file_commands.delete_file`
5. `file_commands.duplicate_file`
6. `file_commands.move_file`
7. `tool_service.delete_file`
8. `tool_service.move_file`
9. `tool_service.rename_file`
10. `tool_service.create_folder`

### 2.3 明确排除的来源

明确排除：

1. `tool_service.update_file(use_diff=true)`
2. `diffStore.acceptDiff`（打开文件链候选接受）
3. 外部修改检测
4. `sync_workspace_file_cache_after_save`
5. `file_cache` 更新
6. localStorage `binder-history`

---

## 3. 生成策略

### 3.1 正式策略

当前阶段时间轴节点生成采用以下冻结策略：

**基于成立点收口、并以实际状态变化过滤为准。**

### 3.2 策略含义

这条策略在技术上拆为三层：

1. 只有成立入口可以提供节点候选
2. 成立入口成功只代表“允许进入准入判断”
3. 只有实际状态变化成立时才真正生成节点

### 3.3 规则解释

该策略解决三个问题：

1. 避免把所有成立入口调用都机械写入时间轴
2. 避免只盯 `saveFile`，漏掉资源结构变化与未打开文件成立链
3. 保持 50 条节点上限下的列表质量

---

## 4. 实际状态变化判断

### 4.1 文件内容变化

文件内容类候选的判断规则：

1. 有 `beforeContent` 和 `afterContent` 时，按规范化后的内容比较
2. `beforeContent === afterContent` 时，不生成节点
3. 同一保存动作只要文件最终内容未变，不生成节点

### 4.2 资源结构变化

资源结构类候选的判断规则：

1. `create_*` 只有对象真实进入工作区时才生成节点
2. `delete_*` 只有对象真实从工作区移除时才生成节点
3. `rename_file` / `move_file` / `duplicate_file` 只有路径关系真实变化时才生成节点

### 4.3 失败动作

失败动作一律不生成节点。

失败动作包括：

1. 命令返回 `success = false`
2. 写盘失败
3. 路径校验失败
4. 文件不存在、目标已存在等前置失败

### 4.4 外部同步与缓存刷新

以下情况不属于实际状态变化判断范围：

1. 外部修改同步
2. reload / refresh
3. `file_cache` 同步
4. `revision`、`snapshot`、`mtime`、`content_hash` 更新

这些只能作为校验信号，不能触发时间轴生成。

代码示例：

```ts
function shouldCreateTimelineNode(candidate: StateCommitCandidate): boolean {
  if (!candidate.established) return false;
  if (candidate.source === 'external_sync') return false;
  if (candidate.source === 'cache_sync') return false;

  if (candidate.kind === 'file_content') {
    return normalizeContent(candidate.beforeContent) !== normalizeContent(candidate.afterContent);
  }

  if (candidate.kind === 'resource_structure') {
    return JSON.stringify(candidate.beforeState) !== JSON.stringify(candidate.afterState);
  }

  return false;
}
```

---

## 5. 节点粒度规则

### 5.1 基础粒度

基础粒度冻结为：

**一次成立动作 = 一个时间轴节点。**

### 5.2 多资源变化

当前阶段的处理口径：

1. 单个成立动作如果影响多个资源，仍记为一个节点
2. 节点中通过 `impact_scope` 展示受影响资源列表
3. 不在当前阶段把单个成立动作拆成多个节点

例如：

1. 删除文件夹导致多个子项消失，记一个节点
2. 还原时会恢复该节点对应的整个影响范围

### 5.3 自动保存

自动保存纳入时间轴，但必须满足与手动保存完全一致的过滤条件：

1. 走成立入口
2. 发生实际状态变化
3. 变化属于时间轴范围

因此：

1. 自动保存不是天然排除项
2. 自动保存也不是天然必写项

---

## 6. 准入与排除规则清单

| 规则 ID | 规则内容 | 承接自 | 影响范围 |
|---|---|---|---|
| `TL-GEN-R-01` | 只有成立入口可以产生时间轴节点候选 | `TL-MAIN-R-04` | 全部入口 |
| `TL-GEN-R-02` | 成立入口成功不等于生成节点，必须经过实际状态变化过滤 | `WS-M-D-02` 7.2 | `saveFile` / `accept_file_diffs` / 资源操作 |
| `TL-GEN-R-03` | `update_file(use_diff=true)` 不进入时间轴 | `TL-MAIN-R-08` | `tool_service` |
| `TL-GEN-R-04` | 外部同步、cache 刷新、revision/snapshot 变化不得生成节点 | `TL-MAIN-R-08` | File System / Cache |
| `TL-GEN-R-05` | 文件内容节点按规范化前后内容差异判断 | `TL-MAIN-R-04` | 文件内容链 |
| `TL-GEN-R-06` | 资源结构节点按前后结构状态差异判断 | `TL-MAIN-R-04` | 资源操作链 |
| `TL-GEN-R-07` | 失败动作不得生成节点 | `TL-MAIN-R-08` | 全链路 |
| `TL-GEN-R-08` | 自动保存按相同过滤规则处理，不单独开口径 | `TL-MAIN-R-04` | 编辑器保存链 |
| `TL-GEN-R-09` | 单次成立动作默认生成单个节点，多资源变化通过 `impact_scope` 收口 | `WS-M-D-02` 2.5 | 节点模型 / 还原 |

---

## 7. 当前实现对齐分析

### 7.1 已打开文件链

`acceptDiff` 不算成立点；`saveFile` 才是成立点。

因此已打开文件链的正确接入点是：

1. `documentService.saveFile` 成功写盘之后
2. `sync_workspace_file_cache_after_save` 之前或之后都可，但必须避免把 cache sync 当时间轴写入依据

### 7.2 未打开文件链

`accept_file_diffs` 直接写盘，因此它本身就是成立点。

### 7.3 工具直接写盘链

`tool_service.update_file(use_diff=false)` 与 `tool_service.create_file` 当前直接写盘，是时间轴候选入口。

### 7.4 占位实现

当前 `HistorySection.addTimelineNode` 只是 UI 占位，不是准入判断层。

---

## 8. 结论

时间轴节点生成问题的核心，不是“从哪里记”，而是“什么时候算项目真的进入了一个新的可恢复状态”。

当前阶段的唯一稳定口径就是：

1. 先按成立入口收口
2. 再按实际状态变化过滤
3. 最后按单次成立动作生成单个时间轴节点
