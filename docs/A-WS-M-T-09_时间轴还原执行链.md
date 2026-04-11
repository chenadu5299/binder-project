# 时间轴还原执行链

## 文档头

- 结构编码：`WS-M-T-09`
- 文档属性：`主结构`
- 主责模块：`WS`
- 文档职责：`时间轴还原执行链 / 还原入口、确认流程、恢复执行、失败处理与再入链主控`
- 上游约束：`WS-M-D-02`, `WS-M-T-06`, `WS-M-T-07`, `WS-M-T-08`
- 直接承接：无
- 接口耦合：`DE-M-D-01`, `WS-M-T-03`, `SYS-I-P-01`
- 汇聚影响：`HistorySection.tsx`, `documentService.ts`, `workspace_commands.rs`, `file_commands.rs`
- 扩散检查：`editorStore.ts`, `fileStore.ts`, `workspace_db.rs`
- 使用边界：`只定义时间轴还原的执行主链、阻断条件、成功写回和失败处理，不承担数据库定稿`
- 变更要求：`修改本文后，必须复核主控文档、节点存储文档与 UI 调用链`
- 规则映射要求：`本文规则统一使用 TL-RESTORE-R-*，并映射到 TL-MAIN-R-06 / TL-MAIN-R-07`

---

## 1. 文档目标

本文回答：

1. 用户如何从时间轴节点进入还原
2. 还原前要检查什么
3. 还原时如何恢复文件内容和资源结构
4. 还原成功后如何重新回到时间轴主链
5. 还原失败如何处理

---

## 2. 还原语义承接

### 2.1 正式语义

时间轴还原承接描述文档冻结语义：

1. 还原面向状态断点
2. 不是单次操作逆转
3. 不是 diff 重放
4. 不是聊天 / AI / task 现场恢复

### 2.2 当前阶段恢复对象

当前阶段还原只恢复：

1. 文件内容
2. 资源结构

不恢复：

1. 聊天上下文
2. pending diff
3. task / artifact
4. 外部同步状态

---

## 3. 用户操作主链

### 3.1 正式操作路径

当前阶段时间轴还原采用以下稳定路径：

1. 用户在时间轴列表选择一个节点
2. 用户点击“还原”
3. 系统弹出确认弹窗，说明覆盖当前状态和影响范围
4. 用户确认后执行还原
5. 还原成功则刷新当前工作区状态
6. 若状态确实变化，则写入新的时间轴节点

### 3.2 UI 调用链示例

```ts
async function onClickRestore(nodeId: string) {
  const preview = await timelineApi.getRestorePreview(nodeId);
  const confirmed = await openRestoreConfirmDialog(preview);
  if (!confirmed) return;

  await timelineApi.restoreNode(nodeId);
  await reloadTimelineList();
  await refreshWorkspaceViews();
}
```

---

## 4. 还原前置检查

### 4.1 必须检查的项目

还原前至少检查：

1. 节点是否存在
2. 节点是否可还原
3. 断点载荷是否存在
4. 工作区是否仍处于当前节点所属 workspace
5. 受影响对象是否仍可访问

### 4.2 Dirty 编辑器阻断

当前阶段建议的稳定策略：

**如果受影响文件当前在编辑器中存在未保存修改，阻断还原，并要求用户先处理未保存状态。**

原因：

1. 时间轴还原会覆盖项目当前成立状态
2. 直接覆盖 dirty 编辑器会破坏当前编辑会话语义
3. 当前 Binder 尚未具备统一的“未保存编辑态合并恢复”能力

### 4.3 外部修改冲突

当前阶段建议：

1. 如果受影响文件处于外部修改待处理态，阻断还原
2. 先要求用户处理外部修改冲突，再允许进入时间轴还原

---

## 5. 还原执行链

### 5.1 文件内容还原

文件内容还原流程：

1. 从时间轴节点载荷读取目标文件内容
2. 校验文件路径仍在 workspace 边界内
3. 对文本文件直接写盘
4. 对 DOCX 使用与现有保存链一致的转换写盘
5. 写盘成功后刷新 `file_cache`

### 5.2 资源结构还原

资源结构还原流程：

1. 从节点载荷读取资源操作恢复信息
2. 按恢复顺序执行创建 / 删除 / 重命名 / 移动等操作
3. 刷新文件树
4. 刷新受影响标签

### 5.3 执行顺序

当前阶段建议：

1. 先恢复资源结构
2. 再恢复文件内容
3. 最后刷新 UI 与缓存

这样做的原因：

1. 文件内容恢复依赖目标路径已经存在
2. 资源结构变化往往决定内容写回位置

代码示例：

```rust
pub async fn restore_timeline_node(
    workspace_path: String,
    node_id: String,
) -> Result<(), String> {
    let db = WorkspaceDb::new(Path::new(&workspace_path))?;
    let node = db.get_timeline_node(&node_id)?;
    let payload = db.get_timeline_payload(&node.restore_payload_id)?;

    preflight_check_restore(&workspace_path, &node, &payload)?;

    match payload.kind.as_str() {
        "resource_structure" => apply_resource_restore(&workspace_path, &payload)?,
        _ => {}
    }

    match payload.kind.as_str() {
        "file_content" => apply_file_restore(&workspace_path, &payload)?,
        _ => {}
    }

    refresh_workspace_views(&workspace_path)?;
    write_restore_commit_if_changed(&workspace_path, &node, &payload)?;
    Ok(())
}
```

---

## 6. 还原成功后的再入链

### 6.1 是否生成新节点

正式规则：

1. 还原成功且状态确实变化时，生成新节点
2. 还原成功但状态未变化时，不生成新节点

### 6.2 为什么必须生成新节点

原因：

1. 还原本身也是一次新的已成立状态变化
2. 不生成新节点会让时间轴丢失当前状态收口
3. 时间轴主链需要记录“恢复动作之后的当前状态”

### 6.3 再入链方式

当前阶段建议：

1. 还原成功后，不单独旁路写节点
2. 把还原结果重新包装为一次 `StateCommitCandidate`
3. 走和普通时间轴生成一致的提交适配层

---

## 7. 失败处理

### 7.1 失败分类

还原失败分为三类：

1. 前置检查失败
2. 执行中失败
3. 还原后写入时间轴失败

### 7.2 处理规则

处理规则：

1. 前置检查失败
   - 不执行任何恢复
   - 不写新节点
   - 提示用户原因

2. 执行中失败
   - 尽量保持未开始还原的对象不被触碰
   - 不写新节点
   - 提示明确错误

3. 还原后写入时间轴失败
   - 项目状态已经恢复成功
   - 需要提示“恢复已完成，但时间轴记录失败”
   - 不自动回滚已恢复状态

### 7.3 当前阶段是否需要还原事务回滚

当前阶段不建议承诺“跨文件跨资源全量事务回滚”。

更现实的技术口径是：

1. 前置检查尽量把失败前置
2. 资源和文件按顺序恢复
3. 失败后保证不写新节点
4. 给出明确错误提示和当前状态说明

---

## 8. 与当前实现的衔接

### 8.1 可直接承接的链路

可直接承接：

1. 文件写盘能力
2. DOCX 转换写盘能力
3. 文件树刷新能力
4. `sync_workspace_file_cache_after_save` 的 cache 对齐能力

### 8.2 需要新增的能力

需要新增：

1. `restore_timeline_node` 命令
2. restore preview 数据接口
3. dirty 编辑器阻断检查
4. 还原成功后的统一再入链

---

## 9. 规则清单

| 规则 ID | 规则内容 | 承接自 | 影响范围 |
|---|---|---|---|
| `TL-RESTORE-R-01` | 时间轴还原只恢复状态断点，不做逆操作回滚 | `TL-MAIN-R-06` | Restore |
| `TL-RESTORE-R-02` | 时间轴还原前必须确认覆盖当前状态与影响范围 | `WS-M-D-02` 6.5 | UI / Restore |
| `TL-RESTORE-R-03` | 受影响文件存在未保存编辑态时，阻断还原 | `TL-MAIN-R-06` | Editor / Restore |
| `TL-RESTORE-R-04` | 外部修改待处理状态下，阻断还原 | `TL-MAIN-R-08` | File Sync / Restore |
| `TL-RESTORE-R-05` | 还原成功且状态实际变化时，必须生成新节点 | `TL-MAIN-R-07` | Restore / Timeline Commit |
| `TL-RESTORE-R-06` | 还原失败时，不得写入新节点 | `TL-MAIN-R-07` | Restore |
| `TL-RESTORE-R-07` | 还原后写入节点失败，不自动回滚已恢复状态 | `TL-MAIN-R-07` | Restore / Persistence |

---

## 10. 结论

时间轴还原执行链的关键，不是“能不能把文件写回去”，而是：

1. 能不能在进入前阻断不安全状态
2. 能不能在成功后重新收口到时间轴主链
3. 能不能在失败时保持语义清晰

因此当前阶段最稳妥的实现方式是：

**以前置检查 + 顺序恢复 + 成功后再入时间轴主链为核心。**
