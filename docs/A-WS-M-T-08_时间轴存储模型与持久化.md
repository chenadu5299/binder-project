# 时间轴存储模型与持久化

## 文档头

- 结构编码：`WS-M-T-08`
- 文档属性：`主结构`
- 主责模块：`WS`
- 文档职责：`时间轴存储模型与持久化 / 节点模型、断点载荷、workspace.db 落库与裁剪规则主控`
- 上游约束：`WS-M-D-02`, `WS-M-T-06`, `WS-M-T-07`, `WS-M-T-04`
- 直接承接：无
- 接口耦合：`SYS-I-P-01`
- 汇聚影响：`workspace_db.rs`, `HistorySection.tsx`, `WS-M-T-09`
- 扩散检查：`workspace_commands.rs`, `documentService.ts`, `tool_service.rs`
- 使用边界：`定义时间轴节点模型、断点载荷表达、落库事务与 50 条裁剪规则，不直接承担还原执行细节`
- 变更要求：`修改本文后，必须复核主控规则、还原专项与数据库 migration 策略`
- 规则映射要求：`本文规则统一使用 TL-STORE-R-*，并映射到 TL-MAIN-R-05 / TL-MAIN-R-09`

---

## 1. 文档目标

本文回答：

1. 时间轴节点至少要存什么
2. 时间轴节点如何表达“可还原状态断点”
3. 正式事实层应该放在什么位置
4. 50 条上限如何落到正式节点
5. 当前 localStorage 占位如何退出主链

---

## 2. 存储设计原则

### 2.1 宿主选择

正式时间轴事实层必须放在 `workspace.db`，原因：

1. 时间轴是工作区级状态系统
2. `workspace.db` 已经是工作区状态宿主
3. 时间轴不应存放在浏览器 `localStorage`

### 2.2 模型原则

当前阶段存储模型必须满足：

1. 节点可展示
2. 节点可还原
3. 节点可裁剪
4. 节点与断点载荷可同事务处理

### 2.3 当前阶段技术取向

当前阶段不建议把时间轴做成“纯操作日志 + 运行时推导恢复”。

当前阶段建议采用：

**节点元信息 + 还原载荷分层存储。**

原因：

1. 当前产品已经冻结“还原 = 状态断点恢复”
2. 只存操作日志会让还原执行过度依赖逆操作推导
3. 还原链需要稳定，而不是聪明

---

## 3. 时间轴节点模型

### 3.1 节点最小必要字段

当前阶段，时间轴节点的最小必要字段建议为：

1. `node_id`
2. `workspace_path`
3. `node_type`
4. `operation_type`
5. `summary`
6. `impact_scope`
7. `created_at`
8. `actor`
9. `restore_payload_id`
10. `restorable`

### 3.2 建议模型

```ts
type TimelineNodeRecord = {
  nodeId: string;
  workspacePath: string;
  nodeType: 'file_content' | 'resource_structure' | 'restore_commit';
  operationType: string;
  summary: string;
  impactScope: string[];
  actor: 'user' | 'ai' | 'system_restore';
  restorable: 0 | 1;
  createdAt: number;
  restorePayloadId: string;
};
```

### 3.3 断点载荷模型

断点载荷用于真正执行时间轴还原。

当前阶段建议：

1. 文件内容节点存受影响文件的目标内容快照
2. 资源结构节点存资源结构恢复所需的对象状态
3. 断点载荷与节点分表存放

```ts
type TimelineRestorePayload =
  | {
      kind: 'file_content';
      files: Array<{
        filePath: string;
        content: string;
        fileType: string;
      }>;
    }
  | {
      kind: 'resource_structure';
      operations: Array<{
        operation: 'create' | 'delete' | 'rename' | 'move' | 'duplicate';
        targetPath: string;
        restoreState: unknown;
      }>;
    };
```

### 3.4 为什么不用 file_cache 直接充当断点

`file_cache` 当前只有“每文件当前态”，不满足：

1. 多节点并存
2. 按节点还原
3. 与 50 条节点同步裁剪

因此 `file_cache` 只能作为当前态辅助，不是时间轴断点存储。

---

## 4. workspace.db 持久化建议

### 4.1 表划分建议

当前阶段建议至少新增两张表：

1. `timeline_nodes`
2. `timeline_restore_payloads`

示例 SQL：

```sql
CREATE TABLE timeline_nodes (
  node_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  node_type TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  impact_scope_json TEXT NOT NULL,
  actor TEXT NOT NULL,
  restorable INTEGER NOT NULL DEFAULT 1,
  restore_payload_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE timeline_restore_payloads (
  payload_id TEXT PRIMARY KEY,
  workspace_path TEXT NOT NULL,
  payload_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

### 4.2 事务要求

时间轴节点写入必须满足：

1. 节点表和载荷表同事务
2. 节点写入成功后才能参与 UI 展示
3. 裁剪必须和节点写入放在同一事务尾部或紧邻事务中执行

代码示例：

```rust
pub fn insert_timeline_node(
    &self,
    node: &TimelineNodeRecord,
    payload: &TimelineRestorePayload,
) -> Result<(), String> {
    let conn = self.conn.lock().map_err(|e| format!("锁失败: {}", e))?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO timeline_restore_payloads (payload_id, workspace_path, payload_kind, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![payload_id, workspace_path, payload_kind, payload_json, created_at],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        "INSERT INTO timeline_nodes (node_id, workspace_path, node_type, operation_type, summary, impact_scope_json, actor, restorable, restore_payload_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9)",
        params![...],
    ).map_err(|e| e.to_string())?;

    trim_timeline_nodes_in_tx(&tx, workspace_path, 50)?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
```

### 4.3 50 条上限规则

50 条上限只针对正式节点。

实现要求：

1. 每次插入成功后按 `created_at DESC` 保留前 50 条
2. 被裁剪节点关联的 `timeline_restore_payloads` 也要删除
3. 不把 pending diff、失败操作、占位 localStorage 项计入 50 条

---

## 5. 与当前占位实现的迁移关系

### 5.1 当前状态

当前 `HistorySection.tsx` 的 `binder-history` 只是本地占位。

### 5.2 迁移原则

迁移原则：

1. 保留组件壳
2. 迁移数据源
3. 不导入旧占位数据到正式时间轴

### 5.3 不导入旧 localStorage 的原因

旧占位数据不应导入正式时间轴，原因：

1. 来源不完整
2. 当前只覆盖少量新建操作
3. 没有正式断点载荷
4. 曾混入失败操作

---

## 6. 规则清单

| 规则 ID | 规则内容 | 承接自 | 影响范围 |
|---|---|---|---|
| `TL-STORE-R-01` | 正式时间轴事实层必须落在 `workspace.db` | `TL-MAIN-R-05` | DB |
| `TL-STORE-R-02` | 时间轴节点与断点载荷必须分层存储 | `TL-MAIN-R-05` | DB / Restore |
| `TL-STORE-R-03` | 节点和载荷写入必须同事务 | `TL-MAIN-R-05` | Repository |
| `TL-STORE-R-04` | 50 条上限只作用于正式时间轴节点 | `TL-MAIN-R-09` | DB / UI |
| `TL-STORE-R-05` | 裁剪节点时必须同步清理载荷 | `TL-MAIN-R-09` | DB |
| `TL-STORE-R-06` | 不导入旧 `binder-history` 占位数据 | `TL-MAIN-R-10` | UI Migration |

---

## 7. 结论

时间轴系统能否落地，不取决于列表能不能显示，而取决于：

1. 节点是否可持久化
2. 节点是否携带真实可还原断点
3. 节点是否能在 50 条上限下稳定裁剪

因此当前阶段最稳妥的技术方向是：

**在 `workspace.db` 中建立节点表 + 断点载荷表，彻底替换 localStorage 占位。**
