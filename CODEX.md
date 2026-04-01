# CODEX.md

This file is a Codex-oriented project map for the Binder repository.
It is not a full design spec. It is a compact operational model of the codebase:

- what the product is trying to do
- which code paths implement which user-facing capability
- where the important state lives
- which logic chains are already usable
- which logic chains are still structurally fragile
- which documents are authoritative when implementation and docs diverge

Use this file as the first-stop context file before editing code.

---

## 1. Product Intent

Binder is a desktop document workspace with three AI interaction layers:

1. Layer 1: autocomplete while writing
2. Layer 2: inline assist on a local selection or cursor context
3. Layer 3: chat/agent-driven document and workspace operations

The product is not "AI chat with a document attached".
Its core value is:

- editable documents inside the app
- AI-generated edits represented as reviewable diffs
- precise positioning by block IDs and offsets
- user-controlled accept/reject instead of direct blind overwrite

The most important product loop is:

1. open document
2. ask AI to edit
3. receive diff cards
4. review and accept/reject
5. save document
6. reopen without losing block-ID continuity where supported

If this loop is unstable, the product core is unstable.

---

## 2. Current Project Reality

Current status is:

- the project builds
- the frontend can do simple interaction
- the editor, diff UI, workspace cache, and AI plumbing all exist
- the architecture is substantially beyond prototype level
- but core agent multi-turn interaction is still fragile
- complex document-edit flows are not yet fully reliable

This means the repo is in the "architecture and main paths exist, but protocol and state consistency are not fully closed" phase.

Do not evaluate the project as either:

- a toy prototype
- or a fully hardened production system

It is between those two.

---

## 3. Tech Stack

### Frontend

- React 18
- TypeScript
- Vite
- Zustand for app state
- TipTap 3 / ProseMirror for editing

### Backend

- Rust
- Tauri 2
- tokio async runtime
- reqwest for AI HTTP calls

### External tools

- Pandoc: DOCX <-> HTML conversion
- LibreOffice: optional preview conversion for some formats

---

## 4. Top-Level Architecture

The repo has four main systems:

1. Editor system
2. Chat/agent system
3. Diff/review system
4. Workspace/cache system

These systems are strongly coupled. Most hard bugs live at their boundaries.

### Editor system

Main responsibility:

- render editable document content
- preserve block IDs
- maintain in-memory editor state
- expose selection/cursor context for AI

Main frontend files:

- `src/components/Editor/TipTapEditor.tsx`
- `src/components/Editor/EditorPanel.tsx`
- `src/components/Editor/extensions/BlockIdExtension.ts`
- `src/components/Editor/extensions/DiffDecorationExtension.ts`

### Chat/agent system

Main responsibility:

- collect user messages and references
- inject current document context
- call backend streaming AI
- render streaming output, tool calls, and tool results

Main frontend files:

- `src/stores/chatStore.ts`
- `src/components/Chat/ChatPanel.tsx`
- `src/components/Chat/ChatMessages.tsx`
- `src/components/Chat/ToolCallCard.tsx`

Main backend files:

- `src-tauri/src/commands/ai_commands.rs`
- `src-tauri/src/services/context_manager.rs`
- `src-tauri/src/services/tool_call_handler.rs`
- `src-tauri/src/services/tool_service.rs`
- `src-tauri/src/services/ai_providers/deepseek.rs`
- `src-tauri/src/services/ai_providers/openai.rs`

### Diff/review system

Main responsibility:

- convert AI edits into reviewable diffs
- map diffs to current editor positions
- allow accept/reject
- expire stale diffs when the document moves

Main files:

- `src/stores/diffStore.ts`
- `src/components/Chat/DiffCard.tsx`
- `src/components/Chat/DiffAllActionsBar.tsx`
- `src/components/Editor/PendingDiffPanel.tsx`
- `src/components/Editor/extensions/DiffDecorationExtension.ts`
- `src/utils/editorOffsetUtils.ts`
- `src/utils/applyDiffReplaceInEditor.ts`

### Workspace/cache system

Main responsibility:

- persist edited-file snapshots
- persist pending diffs
- preserve block-ID continuity where possible
- keep editor reopen behavior stable

Main files:

- `src-tauri/src/workspace/`
- `src-tauri/src/commands/workspace_commands.rs` if present in current branch
- `src-tauri/src/workspace/workspace_db.rs`

The workspace system is not an optional add-on. It is part of the diff consistency model.

---

## 5. Functional Branches

The product has several functional branches. These should be understood as separate tracks with different maturity.

### Branch A: Basic file open/edit/save

Scope:

- open local files
- edit in TipTap
- save back to disk

Status:

- mostly usable
- still subject to some Tauri save-callback race conditions

### Branch B: DOCX editing

Scope:

- DOCX opened via Pandoc -> HTML
- edited in page layout mode
- saved back via HTML -> DOCX

Status:

- core path exists
- more fragile than plain-text/markdown editing
- AI edits must use `edit_current_editor_document` for open DOCX

### Branch C: Layer 1 autocomplete

Scope:

- quick completion suggestions while writing

Status:

- comparatively narrow and simpler
- not the main risk center

### Branch D: Layer 2 inline assist

Scope:

- local text rewrite / reply / analysis on selection

Status:

- implemented at basic level
- some planned cursor-only and multi-turn features are not complete

### Branch E: Layer 3 chat/agent

Scope:

- streaming chat
- tool calling
- document edit requests
- file operations
- multi-turn continuation

Status:

- exists end to end
- this is the main structural risk center
- provider compatibility, tool protocol, and completion logic are not fully stabilized

### Branch F: Diff-driven document editing

Scope:

- AI edits do not directly overwrite the visible document
- they produce diff entries with block IDs and offsets
- user reviews and accepts/rejects

Status:

- core product differentiator
- much of the architecture is correct
- still has consistency issues across paths

### Branch G: Workspace diff persistence and reopen continuity

Scope:

- preserve file snapshots and pending diffs across editor actions
- keep block IDs stable when reopening files where possible

Status:

- important progress has been made
- still needs careful handling for document type differences and app lifecycle edges

---

## 6. Main User-Facing Logic Chains

This section describes the most important logic chains and where they run.

### 6.1 Open normal text/markdown file

Typical path:

1. frontend opens file via document/file service
2. backend reads file
3. frontend loads content into editor
4. `BlockIdExtension` ensures block IDs exist in the editor model
5. editor state is stored in `editorStore`

Key state owners:

- visible content: TipTap editor
- tab metadata: `editorStore`
- pending diffs: `diffStore`

### 6.2 Open DOCX for edit

Typical path:

1. frontend requests DOCX edit mode
2. backend uses Pandoc to convert DOCX -> HTML
3. frontend loads HTML into TipTap with `layoutMode='page'`
4. save path converts HTML -> DOCX through Pandoc

Important constraint:

- AI edits on an open DOCX must use `edit_current_editor_document`
- using `update_file` for an open DOCX can desync the editor and disk state

### 6.3 Send Layer 3 message with document context

Typical path:

1. user sends message in chat
2. `chatStore.sendMessage` determines the injection tab
3. request context is built from the editor snapshot
4. baseline/L is updated for the current round
5. references and selection/cursor anchors are attached
6. backend `ai_chat_stream` starts
7. provider streams text and possibly tool calls

Key file:

- `src/stores/chatStore.ts`

This file is the frontend entry point for document-aware AI context injection.

### 6.4 AI edits current document

Typical path:

1. model calls `edit_current_editor_document`
2. backend tool layer resolves target path:
   - Anchor path
   - Resolver path
   - Legacy path
3. backend returns canonical diff payload
4. frontend converts tool result into `DiffEntry`
5. diff is stored by file path
6. `DiffDecorationExtension` renders pending deletion-style decoration
7. chat shows `DiffCard`
8. user accepts/rejects

This is the single most important logic chain in the codebase.

### 6.5 Accept diff

Typical path:

1. user clicks accept on a diff card
2. frontend validates revision/content snapshot/block-order snapshot
3. frontend resolves the block range into a ProseMirror range
4. frontend validates `originalText` against the live editor text
5. replacement is applied to the editor
6. diff status becomes accepted
7. editor content and revision advance

Important point:

- AI diff acceptance is not just a UI toggle
- it mutates the live editor state and invalidates stale pending diffs

### 6.6 Reject diff

Typical path:

1. user rejects card
2. diff status becomes rejected or is cleared depending on path
3. visible document remains unchanged

### 6.7 Save and reopen with continuity

Typical path:

1. user saves file
2. backend persists the file
3. workspace cache updates snapshot
4. reopening tries to restore content with stable block IDs where supported

Important distinction:

- md/txt: block IDs can survive reopen more reliably
- DOCX: block IDs regenerate on reopen

---

## 7. State Model: What Is the Truth?

Many hard bugs in this repo come from multiple competing "truths".

The practical state model is:

### Truth A: live editor document

Owned by:

- TipTap / ProseMirror editor instance

Used for:

- what the user sees
- live accept/reject validation
- cursor and selection state

### Truth B: injected logical document snapshot `L`

Owned by:

- request context building
- `positioningCtx.L`
- per-round baseline in `diffStore`

Used for:

- AI request context
- resolver input
- snapshot validation

Constraint:

- all positioning-sensitive logic should derive from the same serialized HTML snapshot for a given round

### Truth C: diff state

Owned by:

- `diffStore`

Used for:

- pending/accepted/rejected/expired AI edits
- chat diff cards
- editor decorations

### Truth D: workspace cache

Owned by:

- workspace DB

Used for:

- reopen continuity
- diff persistence
- pending review state across editor lifecycle

The project is stable only when these four truths remain aligned.

---

## 8. Important Stores and Responsibilities

### `editorStore`

Responsible for:

- tabs
- active tab
- dirty/saving flags
- editor refs
- `documentRevision`

This is the main frontend owner of open-document lifecycle state.

### `chatStore`

Responsible for:

- chat tabs
- messages
- content blocks
- mode selection
- sending AI requests
- attaching current document context

This is the main frontend owner of AI conversation state.

### `diffStore`

Responsible for:

- per-file diff entries
- workspace file-path pending diffs
- baseline/L for a round
- accept/reject/expire behavior
- batch actions

This is the most critical state store for product correctness.

### `fileStore`

Responsible for:

- current workspace path
- file tree state

### `referenceStore`

Responsible for:

- `@mention` and inline reference state in chat

---

## 9. Backend Ownership Map

### `ai_commands.rs`

Role:

- main orchestration layer for Layer 3 streaming chat/agent
- provider invocation
- stream event forwarding
- multi-turn continuation
- tool-result reinjection into conversation history

This file is large and is one of the main technical-debt centers.

### `context_manager.rs`

Role:

- builds multi-layer prompt/context
- decides how much current document content to inject
- shapes model-facing system behavior

### `tool_service.rs`

Role:

- executes tool calls
- implements document edit tools
- constructs tool return payloads
- performs diff generation and canonical conversion

If a document-edit result looks wrong, this is one of the first places to inspect.

### `deepseek.rs`

Role:

- currently more complete provider path for tool-calling stream handling

### `openai.rs`

Role:

- intended OpenAI provider path

Current reality:

- plain chat path exists
- tool-calling stream support is not fully closed

---

## 10. Authoritative vs Non-Authoritative Documents

Do not treat all docs in `docs/` as equally valid.

Current authoritative references include:

- `docs/AI功能优化开发计划.md`
- `docs/AI功能优化开发计划（下）.md`
- `docs/Workspace改造可落地实施方案.md`
- `docs/对话编辑-主控设计文档.md`
- `docs/文档逻辑状态传递规范.md`
- `docs/对话编辑-代码实现对照.md`
- `docs/引用功能完整设计文档.md`
- `docs/Binder层次三AI工作机制系统设计.md`
- `docs/代码现状问题清单-经代码核验.md`

When docs and code disagree:

1. prefer the current authoritative document set
2. then verify against the current implementation
3. do not use outdated deleted/replaced phase docs as implementation authority

---

## 11. What Is Already Good

These are genuine strengths of the project:

- the product intent is coherent
- the editor-centered architecture is much stronger than a generic AI wrapper app
- block-ID-based positioning is the right direction
- diff acceptance instead of silent overwrite is the right product model
- workspace cache as part of block-ID continuity is a strong systems decision
- Layer 1 / Layer 2 / Layer 3 separation is conceptually clear
- the app builds and major plumbing exists end to end

This project has real architecture.
The current problem is not lack of design, but incomplete convergence.

---

## 12. Main Structural Weaknesses

These are the recurrent weak points to expect while editing this repo:

### 12.1 Agent multi-turn orchestration

Risk factors:

- provider parity is incomplete
- completion semantics are brittle
- loop detection is weak
- tool-result reinjection is complex

### 12.2 Multiple document-edit paths

Current edit flow can go through:

- Anchor path
- Resolver path
- Legacy path

When behavior diverges, bugs often appear as:

- different `new_content` semantics
- empty or misleading diff cards
- stale state after accept/reject

### 12.3 State duplication

The same document is represented across:

- live editor
- injected snapshot `L`
- diff store baseline
- workspace cache

Bugs usually happen when one path updates only some of these.

### 12.4 Heavy orchestration files

The following files are high-complexity change-risk areas:

- `src-tauri/src/commands/ai_commands.rs`
- `src-tauri/src/services/tool_service.rs`
- `src/stores/chatStore.ts`
- `src/stores/diffStore.ts`

### 12.5 Technical debt style

The debt is mostly:

- consistency debt
- protocol debt
- lifecycle debt
- convergence debt

It is less about "bad basic coding style" and more about a rapidly evolving system not yet fully normalized.

---

## 13. Practical Priorities for Future Work

If forced to choose, prioritize in this order:

### Priority 1: stabilize single-document AI edit loop

Target:

1. open document
2. ask AI to edit
3. generate correct diff
4. accept/reject correctly
5. save
6. send another edit request without drift

If this is stable, Binder has a stable product core.

### Priority 2: unify agent tool-call protocol

Target:

- consistent provider behavior
- proper tool-message semantics
- sane multi-turn continuation
- hard cap on runaway tool loops

### Priority 3: normalize edit-result semantics

Target:

- same meaning for `new_content`
- same meaning for diff payload fields
- same behavior across Anchor / Resolver / Legacy paths

### Priority 4: improve verification discipline

Target:

- at minimum, manual regression checklists for the core flows
- eventually targeted automated tests around diff mapping and tool orchestration

---

## 14. How Codex Should Work In This Repo

When modifying this project:

1. start from the product loop, not isolated code aesthetics
2. inspect which state owner is authoritative for the issue
3. check whether the bug is in:
   - provider protocol
   - tool payload semantics
   - diff mapping
   - editor/store/workspace synchronization
4. prefer fixing root consistency over adding one-off fallback logic
5. avoid using outdated docs as justification

When uncertain, trace the issue through this order:

1. user action
2. frontend store update
3. IPC payload
4. backend orchestration
5. tool execution result
6. diff store write
7. editor mutation
8. persistence/cache update

That is the real system chain.

---

## 15. Current Bottom-Line Assessment

Binder currently is:

- architecturally promising
- already technically substantial
- buildable
- partially interactive
- but not yet fully converged on its hardest workflows

The hardest workflows are:

- agent multi-turn tool use
- complex document editing
- cross-layer state consistency

The right near-term strategy is not "add everything".
It is "stabilize the product core and reduce protocol/state ambiguity".

