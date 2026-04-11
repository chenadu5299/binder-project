# 工具集扩展规范

## 文档头

- 结构编码：`ENG-X-R-02`
- 文档属性：`参考`
- 主责模块：`ENG`
- 文档职责：`工具集扩展规范 / 参考、研究或索引文档`
- 上游约束：`SYS-C-T-01`, `SYS-I-P-01`, `SYS-I-P-02`
- 直接承接：无
- 接口耦合：`SYS-I-P-01`, `SYS-I-P-02`, `AG-M-P-01`
- 汇聚影响：`CORE-C-R-01`
- 扩散检查：`ENG-X-T-01`, `ENG-X-T-02`, `ENG-X-T-03`, `ENG-X-T-04`
- 使用边界：`仅作参考，不直接替代主结构文档、协议文档和执行文档`
- 变更要求：`修改本文后，必须复核：上游约束、直接承接、接口耦合、汇聚影响、扩散检查文档`

---
## 文档信息

- **版本**：v1.0
- **创建日期**：2026年3月
- **来源**：Binder AI 方案落地拆解文档 〇-3
- **用途**：工具扩展与 Diff 改造参考

---

## 一、新增工具的步骤

### 1.1 定义工具

| 步骤 | 位置 | 操作 |
|------|------|------|
| 1 | `src-tauri/src/services/tool_definitions.rs` | 在 `get_tool_definitions()` 的 vec 中追加新 `ToolDefinition` |
| 2 | 同上 | 填写 `name`、`description`、`parameters`（JSON Schema） |

### 1.2 实现逻辑

| 步骤 | 位置 | 操作 |
|------|------|------|
| 3 | `src-tauri/src/services/tool_service.rs` | 在 `execute_tool` 中增加分支，匹配新工具 name |
| 4 | 同上 | 实现工具逻辑，返回约定格式 |

### 1.3 格式约定

- **ToolDefinition**：`{ name, description, parameters }`
- **parameters**：JSON Schema，供 AI 理解入参结构
- **返回值**：按工具约定，通常为 `{ success, content?, error? }` 或扩展结构

---

## 二、edit_current_editor_document 的 diffs 返回格式

### 2.1 返回结构

```json
{
  "content": "...",
  "diffs": [
    {
      "diffId": "uuid-v4",
      "startBlockId": "block-abc",
      "startOffset": 3,
      "endBlockId": "block-abc",
      "endOffset": 6,
      "originalText": "二狗",
      "newText": "石头",
      "type": "replace"
    }
  ]
}
```

### 2.2 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| content | string | 可选，保持与现有兼容；前端优先消费 diffs |
| diffs | array | 新增；每条符合《对话编辑-主控设计文档》第九节 canonical diff |

### 2.3 兼容策略

- **保持 content**：现有调用方若依赖 content，可继续使用
- **前端优先**：ToolCallCard、diffStore 等优先解析 diffs，有 diffs 时按 Diff 卡片流程处理
- **无 diffs 时**：可回退到原有全文替换逻辑（若仍存在）

---

## 三、与方案 ATP 的差距

| 方案 ATP 工具 | 当前有无 | 落地建议 |
|---------------|----------|----------|
| list_documents | 无 | 可基于 list_files 或工作区索引扩展，非现阶段必需 |
| get_project_summary | 无 | 可后续增加，用于 CCE 项目摘要 |
| read_block、read_section、read_document_summary | 无 | 需 blockId 支持，可后续扩展 |
| propose_edit_operations | 无 | 当前 edit_current_editor_document 已承担编辑职责，可视为简化版 |
| generate_outline、create_document | 无 | 结构编辑能力，可后续扩展 |

---

## 四、当前工具列表

| 工具名 | 用途 | 实现位置 |
|--------|------|----------|
| read_file | 读取文件内容 | tool_service.rs |
| create_file | 创建文件 | tool_service.rs |
| update_file | 更新文件（非当前打开） | tool_service.rs |
| delete_file | 删除文件/文件夹 | tool_service.rs |
| list_files | 列出目录 | tool_service.rs |
| search_files | 按文件名/路径搜索 | tool_service.rs |
| move_file | 移动文件 | tool_service.rs |
| rename_file | 重命名 | tool_service.rs |
| create_folder | 创建文件夹 | tool_service.rs |
| edit_current_editor_document | 编辑当前打开的文档 | tool_service.rs |

---

**文档结束。**