# 项目实体模型（Project Object）

> 状态：`REFERENCE ONLY`
>
> 本文档属于旧版 Build Mode / Discussion Build / Multi-Actor Build 设计参考，不是当前生效主线。
> 当前唯一生效主线见 [`docs/README.md`](./README.md) 与 [`A-CBT-C-D-01_Chat Build产品定义与边界.md`](./A-CBT-C-D-01_Chat%20Build产品定义与边界.md)。
> 若本文与当前代码现状或 Active 文档冲突，以 Active 文档和代码现状为准。

## 文档头

- 结构编码：`BLD-M-T-03`
- 文档属性：`旧体系参考`
- 主责模块：`BLD`
- 文档职责：`Project Object 数据结构定义、组织方式、写入 Workspace 时机与规则`
- 上游约束：`BLD-M-D-01`, `BLD-M-D-02`, `BLD-M-D-03`
- 直接承接：`R-BLD-I-P-01`
- 接口耦合：`A-WS-C-T-01`, `A-WS-M-T-03`
- 汇聚影响：`R-BLD-M-D-01`
- 扩散检查：`R-BLD-I-P-01`
- 使用边界：`定义 Project Object 模型与写入规则，不承担 Workspace 文件系统实现细节`
- 变更要求：`修改本文后，必须复核：R-BLD-I-P-01、R-BLD-M-T-04`

---

## 一、文档定位

本文定义构建模式的产出单元：**Project Object（项目实体）**。

本文覆盖：Project Object 的结构定义、内部组成、写入 Workspace 的规则、与 Workspace 文件系统的关系。

---

## 二、Project Object 定义

### 2.1 定义

Project Object 是构建模式执行完成后的产出单元，代表一个完整的生成项目。

Project Object 不是单个文件，而是一组文件与结构的集合，以目录形式存在于 Workspace 中。

### 2.2 与 Workspace 的关系

Project Object 是 Workspace 文件系统中的一个子目录。

用户在构建完成后，可以在文件树中直接访问和编辑项目内的任意文件。

Project Object 写入后，其内部文件与普通 Workspace 文件无本质区别，遵循 Workspace 的所有文件管理规则。

---

## 三、Project Object 结构

### 3.1 顶层结构

```
<project-name>/
├── _build_meta.json          # 构建元数据（只读，不可编辑）
├── <主文档>                  # 主文档（如 README.md / 项目总纲等）
├── <子文档目录>/             # 子文档（按项目结构组织）
│   ├── <子文档 1>
│   ├── <子文档 2>
│   └── ...
├── <数据文件目录>/           # 数据文件（如 CSV / JSON 等）
│   └── ...
└── <资源文件目录>/           # 资源文件（图片/附件等）
    └── ...
```

### 3.2 `_build_meta.json` 结构

```json
{
  "project_id": "<uuid>",
  "project_name": "<构建时用户定义的项目名>",
  "build_mode": "direct | discussion",
  "build_started_at": "<ISO 8601 timestamp>",
  "build_completed_at": "<ISO 8601 timestamp>",
  "build_outline_snapshot": { ... },
  "discussion_room_id": "<uuid | null>",
  "template_refs": ["<template_id>", ...],
  "status": "completed | partial | failed"
}
```

> 待定：`build_outline_snapshot` 的完整字段定义（见 `R-BLD-M-T-04` 执行引擎）

### 3.3 主文档

- 每个 Project Object 必须有且只有一个主文档。
- 主文档是项目的入口文档，通常是总纲、README 或项目说明。
- 主文档格式：由主控 AI 在规划阶段确定（md / docx / txt）。
- 主文档在 Workspace 文件树中优先展示。

### 3.4 子文档

- 子文档是项目内容的具体承载，数量不限。
- 子文档支持的格式：md / docx / txt（其他格式待定）。
- 子文档的组织结构（目录层级）由 Build Outline 决定。
- 子文档之间可以有引用关系，但在第一版实现中不强制维护。

> 待定：子文档间引用关系的维护机制。

### 3.5 数据文件

- 构建过程中生成的结构化数据（如列表、表格、配置等）。
- 格式：JSON / CSV / YAML 等。
- 数据文件不在编辑器中直接展示（取决于 Workspace 的文件支持能力）。

> 待定：数据文件类型清单与约束。

### 3.6 资源文件

- 构建过程中引用的外部资源（图片、附件等）。
- 来源：用户在输入阶段引用的 Workspace 内文件（复制到 Project Object 目录）。
- 外部资源引入规则：

> 待定：外部资源（非 Workspace 文件）的引入规则。

---

## 四、Build Outline 结构

Build Outline 是 Master AI 在执行前生成的规划，是 Project Object 最终结构的蓝图。

### 4.1 Build Outline 字段

```json
{
  "outline_id": "<uuid>",
  "project_name": "<项目名称>",
  "project_description": "<项目描述>",
  "structure": [
    {
      "file_path": "<相对路径>",
      "file_type": "main_doc | sub_doc | data | resource",
      "format": "md | docx | txt | json | csv",
      "title": "<文档标题>",
      "description": "<内容描述>",
      "depends_on": ["<file_path>"],
      "estimated_tokens": <number>
    }
  ],
  "execution_order": ["<file_path>", ...],
  "total_estimated_tokens": <number>
}
```

> 待定：`estimated_tokens` 是否需要？以及 `total_estimated_tokens` 的用途（用于超限检测？）

### 4.2 执行顺序约束

`execution_order` 定义 Master AI 的生成顺序：

1. 主文档通常最后生成（先生成子文档，再生成汇总主文档）。
2. 有依赖关系的文档（`depends_on` 非空）必须在依赖项完成后生成。
3. 无依赖关系的文档可并行生成。

> 待定：并行生成的支持程度（第一版是否强制串行？）

---

## 五、写入 Workspace 规则

### 5.1 写入时机

| 时机 | 写入内容 |
|---|---|
| 构建触发时 | 创建项目目录，写入 `_build_meta.json`（status=in_progress） |
| 每个文件生成完成时 | 实时写入对应文件（增量写入） |
| 全部文件生成完成时 | 更新 `_build_meta.json`（status=completed） |
| 构建失败时 | 更新 `_build_meta.json`（status=partial 或 failed），保留已生成文件 |

### 5.2 写入位置

Project Object 写入 Workspace 根目录下的指定子目录。

> 待定：写入位置规则（是否允许用户自定义？默认写在哪？）

### 5.3 命名规则

Project Object 目录名：

- 默认使用主控 AI 生成的 `project_name`。
- 如果目录名已存在，追加时间戳后缀（`<project_name>_<timestamp>`）。
- 目录名中的非法字符自动替换为 `_`。

### 5.4 写入原子性

- 每个文件的写入是独立的，文件写入后立即可见于 Workspace 文件树。
- 不提供"全部完成再一次性写入"的原子提交，保持增量写入以支持后台构建进度可见。

### 5.5 构建失败处理

构建执行过程中如果发生失败：

1. 已生成的文件**保留**，不删除。
2. `_build_meta.json` 更新 status 为 `partial` 或 `failed`，记录失败原因。
3. 用户可在 Workspace 中查看已生成的部分内容。
4. 不支持断点续建（第一版），如需重新构建需重新触发。

> 待定：是否需要支持"继续未完成的构建"功能？

---

## 六、Project Object 与编辑模式的关系

### 6.1 生成后可编辑

构建完成后，Project Object 中的文档文件可以直接在编辑模式中打开和编辑，与普通 Workspace 文件没有区别。

### 6.2 不产生 Diff

构建模式写入文件**不经过 Diff 机制**，直接写入最终内容，不需要用户决策。

### 6.3 `_build_meta.json` 只读

`_build_meta.json` 是构建元数据，不应在编辑器中展示为可编辑文档。

> 待定：`_build_meta.json` 在文件树中的展示策略（隐藏？标注只读？）

---

## 七、关联文档

1. `R-BLD-M-D-02_直接构建功能设计.md`（产出规范描述）
2. `R-BLD-M-D-03_讨论构建功能设计.md`（结果沉淀描述）
3. `R-BLD-M-T-04_构建执行引擎.md`（Build Outline 生成与执行机制）
4. `R-BLD-I-P-01_构建模式与Workspace接口.md`（写入接口契约）
5. `A-WS-C-T-01_workspace模型定义.md`（Workspace 基础模型）
