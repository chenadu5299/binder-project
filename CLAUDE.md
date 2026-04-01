# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Install dependencies (must run once after clone)
npm install

# Development (starts Tauri + Vite dev server)
npm run tauri:dev

# Build frontend only (also builds tiptap-pagination-plus local dep first)
npm run build

# Build the local pagination library alone
npm run build:pagination

# Package desktop app
npm run tauri:build
```

**Prerequisites**: Node.js ≥ 18, Rust ≥ 1.70, Pandoc (required for DOCX editing/saving), LibreOffice (optional, for DOCX/Excel/presentation preview).

There are no test commands currently configured.

---

## Architecture Overview

### Technology Stack

- **Frontend**: React 18 + TypeScript + Vite, state via Zustand, rich text via TipTap 3 + ProseMirror
- **Backend**: Rust + Tauri 2, async via tokio, HTTP via reqwest
- **IPC**: All frontend↔backend calls go through `invoke()` from `@tauri-apps/api/core`
- **External tools**: Pandoc (DOCX↔HTML conversion), LibreOffice (→PDF preview)

### Repository Layout

```
src/                        # React frontend
  components/
    Chat/                   # Right-side AI chat panel, streaming messages, diff cards
    Editor/                 # TipTap editor, toolbar, inline assist, diff decorations
    FileTree/               # Workspace file tree, memory/search sections
    Layout/                 # MainLayout, PanelResizer, TitleBar
    Memory/                 # Memory tab UI
  stores/                   # Zustand stores (see below)
  hooks/                    # useAutoComplete, useInlineAssist, usePaginationFromEditor
  utils/                    # Pure helpers: diff, editor offsets, reference parsing, etc.
  types/                    # TypeScript types (tool.ts, reference.ts, tiptap.d.ts)
  services/                 # documentService, memoryService

src-tauri/src/              # Rust backend
  commands/                 # Tauri command handlers (thin layer, delegates to services)
  services/                 # Business logic: AI, file I/O, Pandoc, search, memory, diff
    ai_providers/           # AIProvider trait + DeepSeek & OpenAI implementations
    context_manager.rs      # Builds 4-layer prompts for ai_chat_stream
    tool_service.rs         # Executes AI tool calls (read_file, create_file, update_file, …)
    tool_definitions.rs     # JSON schema definitions for all AI tools
    pandoc_service.rs       # DOCX↔HTML via Pandoc subprocess
    diff_service.rs         # Text diff (similar crate)
  workspace/                # workspace.db, file_cache, pending_diffs, diff_engine
  models/                   # Shared Rust data models
  utils/                    # Rust utility helpers

tiptap-pagination-plus/     # Local fork/extension for A4 page layout (file: dependency)
  src/PaginationPlus.ts     # Core pagination TipTap extension

docs/                       # Design documents (Chinese)
```

### Zustand Stores

| Store | Responsibility |
|-------|---------------|
| `editorStore` | Editor tabs, active tab, TipTap `Editor` instance refs, dirty/saving state, `documentRevision` |
| `chatStore` | Chat tabs, messages, `ChatMode` (agent/chat/edit), streaming state, tool call blocks |
| `fileStore` | Current workspace path, file tree state |
| `diffStore` | Per-file `DiffEntry` list keyed by **filePath** (startBlockId, endBlockId, originalText, newText); also `byFilePath` for workspace-layer diffs |
| `referenceStore` | Inline `@mention` references for chat input |
| `layoutStore` | Panel sizes, sidebar visibility |
| `themeStore` | Theme selection |

### AI System — Three Layers

**Layer 1 — Autocomplete** (`Cmd+J`)
- Frontend: `useAutoComplete` hook → `AutoCompletePopover`
- Backend: `ai_autocomplete` command → `DeepSeekProvider::autocomplete_enhanced`
- Prompt built by `build_autocomplete_prompt` in `deepseek.rs`; outputs 3 suggestions separated by `---`

**Layer 2 — Inline Assist** (`Cmd+K`)
- Frontend: `useInlineAssist` hook → `InlineAssistPanel`
- Backend: `ai_inline_assist` command → `DeepSeekProvider::inline_assist`
- Returns JSON `{ kind: "edit"|"reply", text: "..." }`

**Layer 3 — Chat/Agent** (right panel)
- Frontend: `chatStore` → `ChatPanel` / `ChatMessages` / `ChatInput`
- Backend: `ai_chat_stream` command (streaming via Tauri events) → `context_manager.rs::build_multi_layer_prompt`
- **4-layer prompt**: (1) base system prompt, (2) current doc + editor context, (3) user references, (4) tool schemas (agent mode only)
- Tool calls dispatched by `tool_call_handler.rs` → `tool_service.rs`
- Multi-turn continuation: successful tool results are written back as per-tool `role: "tool"` messages; the orchestration layer then appends a separate `[NEXT_ACTION]` user control message to drive the next round
- `ChatMode`: `agent` (tools enabled), `chat` (no tools), `edit` (file-focused)

### DOCX Edit Flow

```
open_docx_for_edit  →  Pandoc DOCX→HTML  →  TipTap (layoutMode='page')
save_docx           ←  Pandoc HTML→DOCX  ←  TipTap HTML export
```

DOCX files in the editor are always represented as HTML internally. When the AI edits a DOCX file that is open in the editor, it must use `edit_current_editor_document` (not `update_file`) to keep the editor in sync.

### Diff System

AI edits via `edit_current_editor_document` produce `DiffEntry` records stored in `diffStore` (keyed by **filePath**, not tabId). Each entry holds `startBlockId`/`endBlockId` (from `BlockIdExtension`) + original/new text. `DiffDecorationExtension` renders inline red-strikethrough decorations using ProseMirror `Decoration.inline`. The user accepts/rejects from `DiffCard` or `DiffAllActionsBar`.

Diff expiry rules:
- **External file modification**: `EditorPanel` detects mtime change every 5 s. If the user selects "加载外部更改", all pending diffs for that file are silently expired (`markExpired` per diffId) — same behavior as manually editing a diff region. Handled by `ExternalModificationDialog` wired in `EditorPanel.tsx`.
- **App close**: `MainLayout.tsx` registers `onCloseRequested`; if any pending diffs exist, a confirm dialog blocks close and warns that diffs will be lost on restart.

### Precision Positioning

`BlockIdExtension` stamps every block node with a `data-block-id` attribute. `blockRangeToPMRange` (in `editorOffsetUtils.ts`) converts `(blockId, charOffset)` pairs to ProseMirror positions. The backend `positioning_resolver.rs` + `positioning_snapshot.rs` handle snapshot-based position resolution for AI edits.

### Workspace DB (`workspace/`)

`workspace.db` (SQLite) stores:
- `file_cache`: HTML snapshots of **all edited files** (used as diff base and for block ID continuity)
- `pending_diffs`: Unaccepted AI edits
- `file_dependencies`: Cross-file relationships

Commands: `open_file_with_cache`, `sync_workspace_file_cache_after_save`, `ai_edit_file_with_diff`, `accept_file_diffs`, `reject_file_diffs`.

**Block ID continuity across tab open/close**: `sync_workspace_file_cache_after_save` is called after every save for **all file types**. On reopen, `open_file_with_cache` checks mtime; cache hit → returns HTML with preserved block IDs. DOCX files regenerate IDs on each open (no canonical pipeline in cache for DOCX). md/txt files store the editor's TipTap HTML directly (non-canonical pipeline path), so their block IDs are preserved across sessions.

### Adding a New Tauri Command

1. Implement the handler function in the appropriate `src-tauri/src/commands/*.rs` file
2. Register it in `main.rs` inside `tauri::generate_handler![…]`
3. Call it from the frontend with `invoke('command_name', { ...args })`

### Adding a New AI Tool

1. Add the JSON schema to `tool_definitions.rs::get_tool_definitions()`
2. Add the execution branch in `tool_service.rs` (match on tool name)
3. Add the `ToolType` enum variant to `src/types/tool.ts` if needed frontend-side

---

## Known Bugs & Code/Design Discrepancies

The following issues are confirmed by current source-code review. Do not work around them silently — fix the root cause.

### Critical

~~**Baseline frozen after first set**~~ **已修复** (`src/stores/diffStore.ts`, `src/stores/chatStore.ts`)
- `setBaseline` 始终覆盖（无 null 守卫），并在每轮 `sendMessage` 时以 `positioningCtx.L = editor.getHTML()` 更新，`baselineSetAt` 同步刷新为 `Date.now()`。
- `getLogicalContent` 已实现（baseline + `acceptedAt >= baselineSetAt` 的 diffs 正序重放），但当前未被调用——`currentEditorContent` 直接使用 `positioningCtx.L`（等价，因为 accepted diffs 已应用到编辑器 DOM，pending diffs 仅为装饰层）。
- `getLogicalContent` 保留，供未来 diff 接受不走 DOM 路径时使用。
- ⚠️ CLAUDE.md spec 中"set once per session"描述已过时，实际采用"每轮更新"策略（更合理：每轮 baseline = 当轮快照，无需跨轮累积所有 diffs）。

**OpenAI provider tool-calling is completely broken** (`src-tauri/src/services/ai_providers/openai.rs`)
- The `_tools` parameter is ignored in `chat_stream`; SSE parsing has no `tool_calls` branch. Selecting the OpenAI provider disables the entire agent/tool workflow.

~~**`originalText` validation failure is silent**~~ **部分修复** (`src/components/Chat/ChatMessages.tsx`, `src/components/Chat/ToolCallCard.tsx`)
- `ChatMessages.tsx` 与 `ToolCallCard.tsx` 的主要接受路径在 `originalText` 校验失败时已弹 toast。
- `ToolCallCard.tsx` 仍有一条接受路径只标记 `expired` 而不提示，属于残余不一致。

### High

~~**`TaskProgressAnalyzer` ignores document-edit tasks**~~ **已修复（当前为“识别但不判完成”策略）** (`src-tauri/src/services/task_progress_analyzer.rs`)
- 当前已识别 `DocumentEdit` / `MultiDocumentEdit` 任务，并输出文档编辑进度提示。
- 设计上仍保持 `is_completed=false` 且 `is_incomplete=false`，由模型自然停止工具调用或继续编辑。

~~**`force_continue_message` semantics mismatch**~~ **已修复** (`src-tauri/src/commands/ai_commands.rs`)
- 当前在强制继续分支中，文档编辑任务会注入专用 continue message，不再错误要求 `list_files` / `move_file`。

**No global tool-call turn limit; `LoopDetector` bypassable** (`src-tauri/src/services/loop_detector.rs`)
- Any small argument variation resets the loop counter. `max_force_continue_retries` does not cap per-round tool calls. Can result in infinite tool chains.

### Medium

~~**System prompt describes wrong tool-call JSON format**~~ **已修复** (`src-tauri/src/services/context_manager.rs`)
- 当前系统提示词不再要求模型输出手写 JSON 工具调用，工具协议以 provider-side function calling 为准。

**`ToolResult.new_content` vs `diffs[].newText` inconsistency** (`src-tauri/src/services/tool_service.rs` L1587–1609)
- Anchor / Resolver / Legacy 路径对 `new_content` 的语义仍不一致：Legacy 路径返回完整新 HTML，但 Anchor / Resolver 路径返回的 `new_content` 仍等于当前文档 HTML，而实际替换文本在 `diffs[].newText` 中。

~~**Tool results injected as `role:user` instead of `role:tool`**~~ **部分修复** (`src-tauri/src/commands/ai_commands.rs`)
- 当前工具结果已按单条 `role: "tool"` 消息写入历史。
- 但编排层仍会额外注入一条 `role: "user"` 的 `[NEXT_ACTION]` 控制消息，用于驱动继续对话。

---

## Unimplemented Features (Design Exists, Code Missing)

Features with design documents but not yet implemented. Grouped by development phase from `docs/AI功能优化开发计划*.md` and `docs/Workspace改造可落地实施方案.md`.

### Phase 0 — Foundation (blocks Phase 1+ work)

| Feature | File/Location | Doc Reference |
|---------|--------------|---------------|
| "Command invalid" hint when editor unfocused (Cmd+J/K) | `editorStore.setInvalidCommandHint` exists but trigger path incomplete | Phase 0.1 |
| Cross-block Anchor: `{ startBlockId, endBlockId, startOffset, endOffset }` | `src/utils/anchorFromSelection.ts` | Phase 0.2 |
| Inline assist without selection (cursor-only mode) | `useInlineAssist` | Phase 0.3 |
| `ai_inline_assist` multi-turn `messages` parameter | `src-tauri/src/commands/ai_commands.rs` | Phase 0.4 |
| `extract_block_range` (backend, cross-block text join) | `src-tauri/src/services/` | Phase 0.5 |
| `blockRangeToPMRange` cross-block support | `src/utils/editorOffsetUtils.ts` | Phase 0.6 |
| `TruncationStrategy` enum used in `context_manager` | `src-tauri/src/services/context_manager.rs` (type exists, not wired) | Phase 0.5 |
| `ToolErrorKind` (Retryable/Skippable/Fatal) in `ToolResult` | `src-tauri/src/services/tool_service.rs` | Phase 0.5 |

### Phase 1 — UI Polish

| Feature | Doc Reference |
|---------|--------------|
| `AutoCompletePopover` replacing `GhostTextExtension` (3 suggestions, Tab/Enter/Esc) | Phase 1a; `docs/辅助续写悬浮卡实现规范.md` |
| `InlineAssistPanel` diff preview + conversation history | Phase 1b; `docs/局部修改弹窗实现说明.md` |

### Phase 2–3 — Diff Workflow

| Feature | Doc Reference |
|---------|--------------|
| `edit_current_editor_document` emitting blockId+offset diffs (not line-based) | Phase 2a; `docs/对话编辑-主控设计文档.md`（第九、十三节） |
| `DiffDecorationExtension` with ProseMirror Mapping tracking | Phase 2b; `docs/对话编辑-主控设计文档.md`（第七、十四节） |
| `getLogicalContent` = baseline + accepted diffs (correct implementation) | Phase 2b; `docs/文档逻辑状态传递规范.md` |
| Multi-card diff display + bulk accept/reject (`DiffAllActionsBar`) | Phase 3 |
| `expired` diff visual feedback to user | Phase 3 |

### Workspace Overhaul

| Feature | Doc Reference | Status |
|---------|--------------|--------|
| `workspace.db` full infrastructure (file_cache, pending_diffs, file_dependencies) | `docs/Workspace改造可落地实施方案.md` Phase 0 | ✅ file_cache 已覆盖全文件类型 |
| `diffStore` keyed by file path (multi-file diff) | Phase 2 | ✅ 已完成 |
| `PendingDiffPanel` UI | Phase 2–3 | ✅ 已实现 |
| `accept_file_diffs` applying diffs in reverse order then writing to disk | Phase 3 | ✅ 已实现 |
| `update_file` with `use_diff=true` not writing to disk immediately | Phase 1 | ⏳ 未实现 |

### Future Versions (No Active Phase)

- Excel and presentation editing (preview-only today)
- Knowledge base (`query_knowledge_base` protocol defined, not implemented)
- Template library / workflow execution engine
- Memory library integration into Layer 2 and Layer 3 prompts
- Memory relationship graph visualization

---

## Hard Design Constraints

These rules come from the design specification documents and must be respected in all implementation work.

### Positioning & BlockId

> ⚠️ 以下约束已被 `docs/对话编辑-主控设计文档.md` 取代，以主控文档为准。保留此处仅供历史参考。

- **Single source of truth `L`**: `current_editor_content`, `positioning_resolver`, block parsing, and diff validation must all use the same serialized HTML. Never derive positions from different snapshots.
- **Stable block IDs**: When a user edit does not touch a block, that block's `data-block-id` must not change. Do not regenerate all UUIDs on every transaction.
- **No silent first-match**: When `positioning_resolver` finds multiple matches, it must return `Ambiguous` — never silently pick the first hit.
- **Single normalize pipeline**: All paths that produce canonical HTML with block IDs must go through `normalizeHtml → injectBlockIds`. No ad-hoc alternatives.

### Diff Protocol

> ⚠️ 以下约束已被 `docs/对话编辑-主控设计文档.md` 取代，以主控文档为准。保留此处仅供历史参考。

The authoritative diff format (from `docs/对话编辑-主控设计文档.md` §9 / §2.2 canonical output):
```json
{
  "diffId": "<uuid-v4>",
  "startBlockId": "block-xxx",
  "startOffset": 0,
  "endBlockId": "block-xxx",
  "endOffset": 5,
  "originalText": "exact match required",
  "newText": "replacement",
  "type": "replace | delete | insert",
  "diff_type": "precise | block_level | document_level"
}
```
- **Forbidden**: line-based diff, `element_identifier` (old scheme), `target_content + replacen` as primary path.
- `originalText` must be validated against the live document before accepting. Mismatch → mark `expired`, show user feedback.

### Logical State (`getLogicalContent`)

- baseline is updated **every round** in `sendMessage` to `positioningCtx.L = editor.getHTML()`, with `baselineSetAt = Date.now()`.
- `getLogicalContent` = baseline + diffs where `acceptedAt >= baselineSetAt`, applied in order (via ProseMirror transaction, not string replace).
- `currentEditorContent` sent to backend uses `positioningCtx.L` directly (equivalent to `getLogicalContent` since accepted diffs are applied to the editor DOM).
- Do not use `getLogicalContent` and `positioningCtx.L` in the same injection round — they must not be mixed.

### Workspace Write Policy

- AI-generated diffs are **not** written to disk immediately. They sit in `pending_diffs`.
- Writes happen only when the user explicitly accepts via `accept_file_diffs`, applied in **reverse order**.
- DOCX files: block IDs are regenerated on each open (Pandoc re-parse); not persisted in cache for DOCX.
- md/txt files: editor HTML (with block IDs) is stored in `file_cache` after every save; mtime check on reopen preserves the same block IDs across sessions.

### Tool Call Protocol

- Tool execution results are currently written as per-tool `role: "tool"` messages.
- The orchestration layer additionally appends a synthetic `role: "user"` `[NEXT_ACTION]` control message for continuation; this is current implementation behavior, not the ideal provider-native protocol end state.
- `edit_current_editor_document` must be used (not `update_file`) when the target file is open in the editor.
- Tool prompts and protocol description must rely on provider-side function calling, not custom JSON emitted in assistant text.

---

## Outdated Code & Documents

### Code marked for removal
| Item | Reason | Status |
|------|--------|--------|
| `GhostTextExtension.ts` | Superseded by `AutoCompletePopover` (Phase 1a) | Remove after Phase 1a ships |
| `DiffHighlightExtension.ts` | Superseded by `DiffDecorationExtension` | Remove after table-diff logic migrated |
| `ExcelPreview.tsx` | Superseded by `ExcelTablePreview.tsx` | Already deprecated |

### Outdated design documents (do not use as implementation reference)
| Document | Reason |
|----------|--------|
| `docs/第一/二/三/四/五阶段开发计划.md` | Old phase structure; replaced by Phase 0–3 plans |
| `docs/AI功能文档清单.md` | Replaced by `AI功能优化开发计划-对齐检查报告.md` |
| `docs/Binder AI 方案落地拆解文档.md` (v1.0) | Superseded by v1.1 |
| `docs/基础环境与协议差距分析.md` (v1.0–1.2) | Current version is v1.3 |
| `docs/Binder 层次三 AI 工作机制系统设计.md` (v1.0–1.2) | Current version is v1.3 (English prompts) |
| `docs/精确定位系统方案.md` | 已删除；内容合并进 `docs/对话编辑-主控设计文档.md` |
| `docs/精准定位系统-统一优化开发步骤.md` | 已删除；内容合并进 `docs/对话编辑-主控设计文档.md` |
| `docs/对话编辑 Diff 数据格式规范.md` | 已删除；要点见主控文档第九、十三节 |
| `docs/对话编辑 Diff 前端实现规范.md` | 已删除；要点见主控文档第七、十四节 |

### Current authoritative documents (use these)
| Topic | Document |
|-------|----------|
| Phase 0–1 development plan | `docs/AI功能优化开发计划.md` (v1.1) |
| Phase 2–3 development plan | `docs/AI功能优化开发计划（下）.md` (v1.1) |
| Workspace overhaul | `docs/Workspace改造可落地实施方案.md` (v1.2) |
| 对话编辑（定位、Resolver、工具参数、canonical diff、块列表） | `docs/对话编辑-主控设计文档.md` |
| Logical state spec (`getLogicalContent`) | `docs/文档逻辑状态传递规范.md`（与主控分工见该文档文头） |
| Reference feature | `docs/引用功能完整设计文档.md` (v2.1) |
| Layer 3 AI mechanics | `docs/Binder层次三AI工作机制系统设计.md` (v1.3) |

## Critical Development Rules

### Rust — 字符串处理
- 禁止用字节索引切片 `&s[i..j]`，中文字符会 panic
- 必须用 `chars().enumerate()` 或 `regex` crate 的 `replace_all`
- 涉及 Pandoc HTML 处理时注意：`unwrap_div_data_custom_style` 提取 innerHTML 会带前后 `\n`，trim 后再传给 TipTap

### Tauri IPC
- 存在 Tauri callback 竞态条件风险：save 操作完成前不要触发第二次 invoke
- AI 编辑 DOCX 时必须用 `edit_current_editor_document`，不能用 `update_file`，否则 editor 状态会不同步

### Diff 系统
- DiffEntry 结构：startBlockId / endBlockId / originalText / newText
- accept-all 必须逆序执行，否则位置偏移会错
- originalText 用于冲突检测，overlapping edit 会被拒绝
- DiffDecorationExtension 用 ProseMirror Decoration.inline 渲染红色删除线，不要绕过它直接改 DOM

### 当前未解决问题（不要绕过，要正面修复）
- Tauri save 回调竞态：4 处主要竞态已修复（isSaving 守卫、删除过期快照回写、fs-save-progress 改为实时查 store、markTabSaved 接受 savedContent 参数）；残余问题：completed 事件早于 markTabSaved 执行，isSaving 短暂误清，影响极小
- ~~diffStore 以 tabId 为键，多文件场景 accept 顺序无法保证~~ **已修复**：diffStore 键改为 filePath（Phase 0 Task 1）
- ~~positioning_resolver 跨会话 block ID 失效问题未处理~~ **已修复（workspace 层缓存方案）**：
  - `sync_workspace_file_cache_after_save` 覆盖所有文件类型（含 md/txt），每次保存后写入缓存
  - md/txt 直接存 TipTap 编辑器 HTML（非 canonical 管道），block ID 跨 tab 关闭/重开保持一致
  - DOCX 每次 open 重新生成 block ID（Pandoc 重解析，无法缓存 ID）
  - 应用关闭时：`MainLayout.tsx` 注册 `onCloseRequested`，有 pending diffs 则弹确认框（重启后 block ID 会变导致 diff 失效）
  - 外部文件修改时：`EditorPanel.tsx` 弹 `ExternalModificationDialog`；用户选"加载外部更改"则静默 expire 该文件所有 pending diffs
  - ⚠️ Tab 关闭/重开不影响 block ID（只要应用未关闭），diff 卡保持有效
- workspace 和 editor 状态双写无互斥机制
