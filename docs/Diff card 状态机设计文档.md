# Binder Diff 卡片状态机设计文档

> 本文档供 Claude Code / Cursor 实现参考。描述 diff 卡片的生命周期状态机和"接受全部"编排器的完整设计。

## 1. 设计目标

**解决的核心问题**：当前"接受全部"流程中，单卡接受后 `updateTabContent()` 递增 `documentRevision`，`expirePendingForStaleRevision()` 把同文件其他 pending diff 标记为过期，导致后续卡片无法接受。

**设计思路**：废弃全局 `documentRevision` 作为 diff 有效性判断依据。改为每张 diff 卡片自治——各自监听自己目标内容的变化，内容变了则自动失效。不需要全局闸门，不需要批量特殊处理。

## 2. 架构概览

两层状态机：

- **卡片级 Actor**：每张 diff 卡片是一个独立的状态机 Actor，自治管理自己的生命周期
- **编排级 Actor**："接受全部"是一个父级编排器，负责倒序调度多张卡片的执行

使用 XState v5 实现。每张卡片是子 Actor，编排器是父 Actor。

## 3. 卡片级状态机（DiffCardMachine）

### 3.1 状态定义

| 状态 | 含义 | 是否终态 |
|------|------|----------|
| `pending` | 卡片已生成，等待用户操作。持续监听目标内容变化 | 否 |
| `validating` | 用户点击接受后，校验 `originalText` 是否仍与文档匹配（兜底校验） | 否 |
| `applying` | 校验通过，正在执行文档替换操作 | 否 |
| `applied` | 替换完成，卡片生命周期结束 | 是 |
| `rejected` | 用户主动拒绝此修改 | 是 |
| `expired` | 目标内容已发生变化，此修改失去意义 | 是 |

### 3.2 事件定义

| 事件 | 触发源 | 说明 |
|------|--------|------|
| `ACCEPT` | 用户点击"接受" / 编排器发送 | 触发从 pending → validating |
| `REJECT` | 用户点击"拒绝" | 触发从 validating → rejected |
| `CONTENT_CHANGED` | 内容监听器 | pending 状态下目标内容变化，触发 → expired |
| `VALID` | validating 内部校验结果 | originalText 匹配，→ applying |
| `INVALID` | validating 内部校验结果 | originalText 不匹配（兜底），→ expired |
| `DONE` | applying 完成回调 | 替换执行完毕，→ applied |

### 3.3 状态转换

```
pending ──ACCEPT──→ validating
pending ──CONTENT_CHANGED──→ expired

validating ──VALID──→ applying
validating ──INVALID──→ expired（兜底，正常不应触发）
validating ──REJECT──→ rejected

applying ──DONE──→ applied
```

### 3.4 Context（卡片携带的数据）

```typescript
interface DiffCardContext {
  cardId: string;            // 卡片唯一标识
  filePath: string;          // 目标文件路径
  originalText: string;      // 期望的原始文本（用于校验）
  newText: string;            // 要替换成的新文本
  blockNumber: number;       // 块编号（由 Resolver 映射到 blockId+offset）
  createdAt: number;         // 卡片生成时间戳（用于倒序排列）
}
```

### 3.5 内容监听机制

在 `pending` 状态下，卡片需要持续监听目标区域的内容变化。实现方式建议：

- **不要轮询**。利用 TipTap/ProseMirror 的 `onTransaction` 回调，在每次文档事务提交后，检查该卡片对应的 blockId 区域内容是否与 `originalText` 一致
- 如果不一致，向该卡片 Actor 发送 `CONTENT_CHANGED` 事件
- 监听应在卡片进入 `pending` 状态时启动（entry action），离开 `pending` 状态时停止（exit action）

触发 `CONTENT_CHANGED` 的场景包括但不限于：
1. 用户手动编辑了目标区域
2. 另一张 diff 卡片被接受，修改了相关内容
3. 外部同步（如文件在磁盘上被修改后重新加载）

### 3.6 关键设计原则

- **`originalText` 校验遵循主控设计文档**：比对时使用 Resolver2 路径，通过 block number 映射到 blockId+offset，获取当前文档内容进行比对
- **validating 阶段的 INVALID 是兜底**：如果 pending 阶段的内容监听足够实时，validating 阶段不应该出现 INVALID。如果出现了，说明监听存在遗漏，应当记录日志排查
- **rejected ≠ expired**：rejected 是用户主动决策（可用于记录用户偏好），expired 是内容变化导致的被动失效（可提示用户"AI 可以重新生成"）

## 4. 编排级状态机（AcceptAllOrchestrator）

### 4.1 状态定义

| 状态 | 含义 |
|------|------|
| `idle` | 无批量操作进行中 |
| `preparing` | 收集当前文件所有 pending 状态的 diff 卡片，按 createdAt 倒序排列 |
| `processing` | 逐张处理队列中的卡片 |
| `done` | 队列处理完毕 |

### 4.2 事件定义

| 事件 | 说明 |
|------|------|
| `ACCEPT_ALL` | 用户点击"接受全部"，触发 idle → preparing |
| `QUEUE_READY` | 倒序队列构建完成，触发 preparing → processing |
| `CARD_DONE` | 当前卡片处理完毕（applied 或 expired 或已被跳过），触发处理下一张或进入 done |

### 4.3 状态转换

```
idle ──ACCEPT_ALL──→ preparing
preparing ──QUEUE_READY──→ processing
processing ──CARD_DONE（还有下一张）──→ processing（自循环）
processing ──CARD_DONE（队列已空）──→ done
done ──（自动）──→ idle
```

### 4.4 Processing 内部逻辑（每次自循环执行）

```
1. 从队列取出下一张卡片
2. 检查该卡片当前状态：
   - 如果已经是 expired → 跳过，直接发 CARD_DONE
   - 如果仍是 pending → 向该卡片 Actor 发送 ACCEPT 事件
3. 等待该卡片到达终态（applied / expired / rejected）
4. 发 CARD_DONE，继续下一张或结束
```

### 4.5 关键设计原则

- **编排器不做内容判断**：它只管调度顺序。每张卡片的有效性由卡片自己的状态机负责
- **倒序执行的原因**：后生成的 diff 通常位于文档靠后位置。先应用靠后的修改，不会影响靠前修改的 offset 定位。如果先应用靠前的修改，靠后的修改的定位可能因为内容长度变化而偏移
- **无需暂停 revision 递增**：因为有效性判断已经不依赖全局 revision，而是每张卡片自监听 originalText

## 5. 需要移除 / 修改的现有逻辑

1. **移除 `expirePendingForStaleRevision()`**：这是当前 bug 的直接来源。用卡片级的内容监听取代
2. **`updateTabContent()` 中的 `documentRevision++`**：可以保留用于其他用途（如编辑器版本追踪），但不再用于 diff 有效性判断
3. **diffStore 中的 revision 字段**：不再作为有效性依据。卡片的有效性由其状态机状态决定

## 6. 与主控设计文档的对齐

本设计遵循 `docs/对话编辑-主控设计文档.md` 的以下原则：

- **Resolver2 新路径**：block number → blockId+offset 的映射通过后端 Resolver 完成，卡片只持有 block number，不直接操作 blockId
- **`originalText` 验证优先**：在执行替换前必须验证原文匹配
- **倒序执行**：接受全部时从后往前执行，避免 offset 偏移

## 7. XState v5 实现提示

```typescript
// 卡片级状态机骨架（供 Claude Code 参考）
import { setup, createActor, assign, sendParent } from 'xstate';

const diffCardMachine = setup({
  types: {
    context: {} as DiffCardContext,
    events: {} as
      | { type: 'ACCEPT' }
      | { type: 'REJECT' }
      | { type: 'CONTENT_CHANGED' }
      | { type: 'VALID' }
      | { type: 'INVALID' }
      | { type: 'DONE' }
  },
  guards: {
    isOriginalTextMatch: ({ context }) => {
      // 通过 Resolver2 获取当前文档对应区域的内容
      // 与 context.originalText 比对
      // 返回 boolean
      return true; // 占位
    },
  },
}).createMachine({
  id: 'diffCard',
  initial: 'pending',
  context: ({ input }) => input, // 从外部传入 DiffCardContext
  states: {
    pending: {
      // entry: 启动内容监听（invoke 或 spawn 一个监听 actor）
      // exit: 停止内容监听
      on: {
        ACCEPT: 'validating',
        CONTENT_CHANGED: 'expired',
      },
    },
    validating: {
      // entry: 执行 originalText 校验
      // 校验通过 → 发 VALID
      // 校验不通过 → 发 INVALID
      on: {
        VALID: 'applying',
        INVALID: 'expired',
        REJECT: 'rejected',
      },
    },
    applying: {
      // entry: invoke 执行文档替换的异步操作
      // 完成后 → 发 DONE
      on: {
        DONE: 'applied',
      },
    },
    applied: {
      type: 'final',
      // entry: sendParent({ type: 'CARD_DONE', cardId: ... })
    },
    rejected: {
      type: 'final',
      // entry: sendParent({ type: 'CARD_DONE', cardId: ... })
    },
    expired: {
      type: 'final',
      // entry: sendParent({ type: 'CARD_DONE', cardId: ... })
    },
  },
});
```

以上为骨架代码，实际实现时需要：
1. 将内容监听接入 TipTap onTransaction
2. 将 originalText 校验接入 Resolver2
3. 将文档替换操作接入现有的 diff 应用逻辑
4. 编排器使用 `spawn` 管理多个卡片 Actor