# ChatTab 持久化 UUID 专项修复规范

## 文档头

- 结构编码：`ENG-X-F-01`
- 文档属性：`专项修复规范`
- 主责模块：`ENG`（前端工程）
- 文档职责：`Chat Tab 持久化 UUID 修复 / 为 chatStore 引入稳定 UUID 和 persist 中间件`
- 上游约束：（无直接上游，是工程基础修复）
- 直接承接：`A-AST-M-S-01`（scope_id 依赖稳定 tab UUID）、`A-AST-M-S-03`（记忆升格依赖 tab 生命周期）
- 修复优先级：P0 前置（必须在记忆库 P0 实施前完成）

---

## 一、问题定义

### 1.1 当前 tab ID 格式与不稳定性分析

`src/stores/chatStore.ts` 中 `createTab` 函数的 ID 生成逻辑：

```typescript
const tabId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

存在以下问题：

| 问题维度 | 现状 | 要求 |
|---------|------|------|
| ID 格式 | `chat-{timestamp}-{random9chars}`（自定义格式） | RFC 4122 UUID（`xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`） |
| 跨重启稳定性 | 重启后全部重建（chatStore 无 persist 中间件） | 重启后 UUID 不变 |
| 存储机制 | 无持久化，存在于内存 | Zustand persist + localStorage |
| 可校验性 | 无法用 UUID 格式校验 | 可用标准 UUID regex 校验 |

`chatStore` 当前未使用任何 Zustand 持久化中间件（对比 `layoutStore`、`themeStore` 均已使用 `persist` 中间件）。应用每次重启时，`tabs` 数组从空状态重建，所有旧 tab ID 失效。

### 1.2 为什么影响记忆库（scope_id 绑定孤立）

记忆库（`A-AST-M-S-01`）以 `scope_id = tab_id` 作为 tab 层记忆的作用域键：

```sql
-- memory_items 表中，tab 层记忆绑定：
scope_type = 'tab'
scope_id   = <chatStore tab ID>
```

若 tab ID 不稳定：
- 应用重启后，旧 tab ID 不再存在于 `chatStore`
- 对应的 `memory_items` 记录中的 `scope_id` 变成孤立键
- `search_memories` 检索时以当前 tab ID 过滤，旧记忆永远无法被检索到
- 记忆库在每次重启后实质上被清零（记录仍在数据库，但与任何活跃 tab 脱绑）

### 1.3 影响范围

此修复**仅涉及 `chatStore`**，不涉及其他 store：

| Store | 影响 | 原因 |
|-------|------|------|
| `chatStore` | **必须修复** | tab ID 是记忆库 scope_id 来源 |
| `editorStore` | 不涉及 | editor tab ID 不作为记忆库作用域键 |
| `diffStore` | 不涉及 | 已改为以 filePath 为键（无 tab ID 依赖） |
| `agentStore` | 间接受益 | 接受 tabId 作为参数，UUID 化后更稳定；无需单独修改 |

---

## 二、修复方案（方案 B）

### 2.1 方案选择

选择**方案 B：引入持久化 UUID + Zustand persist 中间件**。

| 方案 | 描述 | 结论 |
|------|------|------|
| 方案 A | 随机 UUID，不 persist（重启后仍重建） | 不满足：重启稳定性要求 |
| **方案 B** | **UUID + persist（仅 tab 元数据）** | **采用** |
| 方案 C | 服务端生成 UUID（后端 Tauri 分配） | 过度设计，引入不必要的 IPC 调用 |

### 2.2 持久化设计

**tab ID**：改用 `crypto.randomUUID()`（Tauri WebView 支持 Web Crypto API，无需额外依赖）。

**持久化范围**：只持久化 tab 元数据，**不持久化 messages**。

| 字段 | 是否持久化 | 说明 |
|------|---------|------|
| `id` | ✅ | UUID，永久不变 |
| `title` | ✅ | tab 标题 |
| `mode` | ✅ | ChatMode（agent/chat） |
| `workspacePath` | ✅ | 绑定的工作区路径 |
| `isTemporary` | ✅ | 是否为临时聊天 |
| `createdAt` | ✅ | 创建时间戳 |
| `updatedAt` | ✅ | 最后更新时间戳 |
| `model` | ✅ | 使用的模型名 |
| `messages` | ❌ | 会话态，不持久化（消息量大，localStorage 有容量限制） |
| `isLoading` | ❌ | 运行时态 |
| `streamingMessage` | ❌ | 运行时态 |

**存储键名**：`binder-chat-tabs-storage`

**实现方式**：Zustand `persist` 中间件 + localStorage（与 `layoutStore` 保持一致）

---

## 三、实现规范

### 3.1 TypeScript 类型拆分

```typescript
// chatStore.ts 修改骨架

// 1. 新增 import
import { persist, createJSONStorage } from 'zustand/middleware';

// 2. 分离持久化类型与运行时类型
interface PersistedChatTab {
  id: string;            // crypto.randomUUID() 生成，永久不变
  title: string;
  mode: ChatMode;
  workspacePath: string | null;
  isTemporary: boolean;
  createdAt: number;
  updatedAt: number;
  model: string;
}

// ChatTab 继承元数据，补充运行时字段
export interface ChatTab extends PersistedChatTab {
  messages: ChatMessage[];       // 运行时，不持久化
  // 如有其他运行时字段（isLoading、streamingMessage 等），在此扩展
}
```

### 3.2 ID 生成修改

```typescript
// createTab 中 ID 生成改为：
const tabId = crypto.randomUUID();
// 替换原来的：
// const tabId = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

### 3.3 persist 中间件包裹

```typescript
// 将原来的 create<ChatState>((set, get) => { ... })
// 改为带 persist 包裹的形式：

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // ... 原有 store 实现保持不变 ...
    }),
    {
      name: 'binder-chat-tabs-storage',
      storage: createJSONStorage(() => localStorage),

      // partialize：只持久化 tab 元数据，不持久化 messages
      partialize: (state) => ({
        tabs: state.tabs.map((tab): PersistedChatTab => ({
          id: tab.id,
          title: tab.title,
          mode: tab.mode,
          workspacePath: tab.workspacePath,
          isTemporary: tab.isTemporary,
          createdAt: tab.createdAt,
          updatedAt: tab.updatedAt,
          model: tab.model,
        })),
        activeTabId: state.activeTabId,
      }),

      // onRehydrateStorage：从持久化元数据恢复时，补充运行时字段
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 从 localStorage 恢复后，messages 字段为 undefined，需要补充
          state.tabs = state.tabs.map((tab: any) => ({
            ...tab,
            messages: [],  // 运行时字段，恢复后初始化为空
          }));
        }
      },
    }
  )
);
```

### 3.4 消息 ID 生成（不涉及 tab ID 但建议同步修复）

`addMessage` 中的消息 ID 生成方式同样存在格式不稳定问题。建议同步改为 UUID（可选，不影响记忆库）：

```typescript
// 建议同步修改（可选）：
const messageId = crypto.randomUUID();
// 替换原来的：
// const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

---

## 四、孤立记忆清理规范

### 4.1 背景

即使引入 persist 后，以下场景仍会产生孤立 tab 记忆：
- 用户手动在 localStorage 中清除 `binder-chat-tabs-storage`
- 用户在另一台设备上使用（localStorage 不同步）
- 历史上（修复前）已产生的旧格式 tab ID 对应记忆

**孤立记忆定义**：`memory_items` 表中 `scope_type='tab'` 且 `scope_id` 不在当前 persist tabs 的 UUID 列表中的记录。

### 4.2 触发时机

应用启动后，workspace 加载完成时（懒执行，非阻塞）。

**选择懒执行的原因**：
- 清理任务无紧迫性（孤立记忆不影响当前 tab 的功能）
- 启动时做，避免常驻后台定时器的开销
- 失败不影响用户体验（只记录日志）

### 4.3 处理规则

| 情况 | 处理方式 | 原因 |
|------|---------|------|
| 孤立 tab 记忆（scope_id 不在活跃 tabs） | 改为 `freshness_status='stale'`，**不立即删除** | 降级而非删除，保留历史语义价值 |
| stale tab 记忆 | 仍可被检索命中，作为弱参考 | 不完全丢弃，但注入时加降低可信度标注 |
| stale tab 记忆超过 30 天 | 由 P4 启动检查任务物理删除 | 见 §八中 P4 策略 |

**不立即删除的理由**：用户可能只是关闭了一个 tab，但其中记忆的语义价值（如"用户喜欢正式语气"）仍然有效，降级为 stale 后可作为工作区级弱参考继续使用。

### 4.4 实现位置

**前端触发**：在 `src/stores/fileStore.ts` 的 `openWorkspace` 成功回调中，异步调用 Tauri 命令：

```typescript
// fileStore.ts 中 openWorkspace 成功回调（伪代码）
const openWorkspace = async (workspacePath: string) => {
  // ... 现有工作区打开逻辑 ...

  // 懒执行：标记孤立 tab 记忆为 stale（非阻塞）
  const activeTabIds = useChatStore.getState().tabs.map(t => t.id);
  invoke('mark_orphan_tab_memories_stale', { activeTabIds }).catch((e) => {
    console.warn('孤立记忆清理失败（不影响主流程）:', e);
  });
};
```

---

## 五、Rust 后端对接

### 5.1 新增接口签名

在 `src-tauri/src/services/memory_service.rs` 中新增：

```rust
/// P0 需要：标记孤立 tab 记忆为 stale
/// 在应用启动 + workspace 加载完成后调用，将不在 active_tab_ids 中的 tab 记忆降级
///
/// 返回：被标记为 stale 的记忆条数
pub async fn mark_orphan_tab_memories_stale(
    &self,
    active_tab_ids: &[String],
) -> Result<u64, MemoryError>
```

**实现要点**（实现细节不在本文定义，由 `A-AST-M-S-01` 承接）：
- 查询所有 `scope_type='tab'` 且 `freshness_status='fresh'` 的记忆
- 过滤出 `scope_id` **不在** `active_tab_ids` 中的记录
- 将这些记录的 `freshness_status` 改为 `'stale'`，更新 `updated_at`
- 返回被标记的条数

### 5.2 暴露 Tauri 命令

在 `src-tauri/src/commands/memory_commands.rs` 中新增命令：

```rust
#[tauri::command]
pub async fn mark_orphan_tab_memories_stale(
    active_tab_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<u64, String> {
    state
        .memory_service
        .mark_orphan_tab_memories_stale(&active_tab_ids)
        .await
        .map_err(|e| e.to_string())
}
```

在 `main.rs` 的 `tauri::generate_handler![...]` 中注册此命令。

---

## 六、迁移策略

### 6.1 历史数据兼容性分析

| 维度 | 现状 | 结论 |
|------|------|------|
| localStorage 中的旧 tab ID | `chatStore` 无 persist，旧 tab 不在 localStorage | 无需迁移 |
| 数据库中的旧 tab 记忆 | 记忆库 P0 尚未实施，`memory_items` 表不存在 | 无需迁移 |
| 代码中旧格式 tab ID 的引用 | 其他 store 通过参数接收 `tabId`，格式无关 | 无需修改 |

**结论：直接替换，无历史数据兼容问题。**

### 6.2 部署后的冷启动场景

首次安装修复后版本时：
1. localStorage 中无 `binder-chat-tabs-storage` 键（首次 persist）
2. Zustand persist 检测到无历史数据，以空 tabs 初始化
3. 用户创建第一个 tab 时，使用 `crypto.randomUUID()` 生成 UUID
4. tab 元数据写入 localStorage，此后重启 UUID 稳定

---

## 七、影响范围清单

| 文件 | 修改点摘要 |
|------|---------|
| `src/stores/chatStore.ts` | 1. 新增 `import { persist, createJSONStorage }` <br>2. 新增 `PersistedChatTab` 接口（拆分持久化字段） <br>3. `createTab` 中 ID 生成改为 `crypto.randomUUID()` <br>4. `create` 改为 `create()(persist(...))` <br>5. 添加 `partialize` 和 `onRehydrateStorage` 配置 |
| `src-tauri/src/services/memory_service.rs` | 新增 `mark_orphan_tab_memories_stale` 方法 |
| `src-tauri/src/commands/memory_commands.rs` | 新增 `mark_orphan_tab_memories_stale` Tauri 命令并注册 |
| `src-tauri/src/main.rs` | 在 `tauri::generate_handler![...]` 中注册新命令 |
| `src/stores/fileStore.ts` | 在 `openWorkspace` 成功回调中添加孤立清理触发调用 |

**不需要修改的文件**：
- `src/stores/editorStore.ts`：editor tab 体系独立，不受影响
- `src/stores/diffStore.ts`：已改为 filePath 键，无 tab ID 依赖
- `src/stores/agentStore.ts`：接受 tabId 参数，UUID 化后自然适配，无需修改
- `src/components/Chat/`：tab ID 的使用均通过 props/store 透传，格式无关

---

## 八、验证标准

以下条件全部满足时，视为修复完成：

| 验证项 | 验证方法 |
|--------|---------|
| 1. 应用重启后，已有 tabs 的 UUID 保持不变 | 创建 tab → 记录 UUID → 重启应用 → 检查 UUID 是否一致 |
| 2. localStorage 中存在 `binder-chat-tabs-storage` 键 | 打开浏览器开发者工具 → Application → Local Storage → 检查键名 |
| 3. tab UUID 格式符合 RFC 4122 | 创建 tab 后，在 devtools 中检查 `useChatStore.getState().tabs[0].id`，匹配 `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i` |
| 4. messages 不存入 localStorage | 发送消息后，检查 localStorage 中 `binder-chat-tabs-storage` 的 JSON 内容，`tabs[0]` 对象不含 `messages` 字段 |
| 5. `mark_orphan_tab_memories_stale` 接口可被调用，不报错 | 在 workspace 加载后，检查开发者工具 console，无相关错误 |
| 6. `activeTabId` 跨重启保持 | 切换到指定 tab → 重启 → 确认同一 tab 仍为 active |

---

## 九、注意事项

### 9.1 localStorage 容量限制

localStorage 单域名上限约为 5MB。`partialize` 的设计（仅持久化元数据，排除 messages）正是为了避免这一限制：

- 单个 tab 元数据约 200 字节
- 100 个 tabs × 200 字节 = 20KB（远低于上限）
- messages 不持久化，杜绝超限风险

### 9.2 onRehydrateStorage 执行时机

Zustand persist 的 `onRehydrateStorage` 在从 localStorage 恢复数据后同步执行。恢复后 `messages` 字段为 `undefined`（因为 `partialize` 排除了它），`onRehydrateStorage` 的作用是将其初始化为 `[]`，避免 runtime 空指针错误。

### 9.3 agentStore 联动

`createTab` 中会调用 `useAgentStore.getState().ensureRuntimeForTab(tabId, mode)`。这一调用在 `onRehydrateStorage` 后不会自动执行（因为 rehydrate 时不走 `createTab` 路径）。

**处理方式**：在 `onRehydrateStorage` 回调中，遍历恢复的 tabs，对每个 tab 补充调用 `agentStore.ensureRuntimeForTab(tab.id, tab.mode)`。

```typescript
onRehydrateStorage: () => (state) => {
  if (state) {
    state.tabs = state.tabs.map((tab: any) => ({
      ...tab,
      messages: [],
    }));
    // agentStore runtime 补充初始化
    state.tabs.forEach((tab) => {
      useAgentStore.getState().ensureRuntimeForTab(tab.id, tab.mode);
    });
  }
},
```

---

## 十、来源映射

1. `src/stores/chatStore.ts`：当前 tab ID 生成逻辑（`chat-${Date.now()}-${random}`）
2. `src/stores/layoutStore.ts`：Zustand persist 参考实现（`binder-layout-storage`）
3. `A-AST-M-S-01_记忆服务数据库落地规范.md`：scope_id 与 tab_id 的绑定关系（§2.3）
4. `A-AST-X-L-01_记忆库功能开发前澄清与收口文档.md`：D-05 决策来源
5. `A-AST-M-S-03_记忆写入与冲突处理规范.md`：on_tab_deleted 与升格规则
