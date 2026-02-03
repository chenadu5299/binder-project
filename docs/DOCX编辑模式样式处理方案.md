# DOCX 编辑模式样式处理方案

## 一、方案概述

基于《AI样式子集技术分析报告.md》的结论，采用**三层样式处理策略**，确保编辑模式既能准确复现原文档样式，又能提供灵活的编辑能力。

### 1.1 核心原则

1. **提取样式层**：只提取 Pandoc 最成熟的部分，确保 100% 复现
2. **结构保留层**：只保留换行和段落结构，不强制应用字体和字号（避免样式冲突）
3. **工具样式层**：工具栏展示全部 TipTap 支持的样式，用户可自由编辑

### 1.2 技术基础

- **转换工具**：Pandoc（DOCX → HTML）
- **编辑器**：TipTap（基于 ProseMirror）
- **样式处理**：HTML + CSS 内联样式

---

## 二、提取样式层（100% 复现）

### 2.1 提取范围

**只提取 Pandoc 最成熟、最稳定的样式**，确保 100% 复现：

| 样式类型 | Pandoc 支持度 | 复现率 | 提取方式 |
|---------|-------------|--------|---------|
| **标题层级（H1-H6）** | ✅ 100% | **100%** | 直接使用 Pandoc 输出的 `<h1>`-`<h6>` 标签 |
| **粗体、斜体、下划线** | ✅ 100% | **100%** | 直接使用 Pandoc 输出的 `<strong>`, `<em>`, `<u>` 标签 |
| **列表结构（有序、无序）** | ✅ 100% | **100%** | 直接使用 Pandoc 输出的 `<ul>`, `<ol>`, `<li>` 标签 |
| **图片（嵌入图片）** | ✅ 100% | **100%** | 直接使用 Pandoc 输出的 `<img>` 标签，保留路径 |
| **表格结构（基础表格）** | ✅ 95% | **95%** | 直接使用 Pandoc 输出的 `<table>`, `<tr>`, `<td>` 标签 |
| **段落对齐** | ⚠️ 85% | **85%** | 通过 CSS 类转换，提取 `text-align` 属性 |

### 2.2 实现方式

#### 2.2.1 Pandoc 转换配置

```rust
// src-tauri/src/services/pandoc_service.rs

pub fn convert_document_to_html(doc_path: &Path) -> Result<String, String> {
    use std::process::Command;
    
    // 1. 使用 Pandoc 转换 DOCX 到 HTML
    // 参数说明：
    // --from=docx+styles：启用样式扩展以保留 DOCX 样式信息
    // --to=html+raw_html+native_divs+native_spans：保留原始 HTML 标签和内联样式
    // --standalone：生成完整 HTML（包含 <head> 和 <body>）
    // --wrap=none：不自动换行
    // --extract-media=.：提取媒体文件
    // --preserve-tabs：保留制表符
    // 注意：不使用 --variable 强制设置字体和字号，避免与文档原有样式冲突
    let output = Command::new("pandoc")
        .arg(doc_path.as_os_str())
        .arg("--from")
        .arg("docx+styles")
        .arg("--to")
        .arg("html+raw_html+native_divs+native_spans")
        .arg("--standalone")
        .arg("--wrap=none")
        .output()
        .map_err(|e| format!("Pandoc 转换失败: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Pandoc 转换失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    let html = String::from_utf8_lossy(&output.stdout).to_string();
    
    // 2. CSS 类转换为内联样式（处理段落对齐）
    let html = Self::convert_css_classes_to_inline_styles(&html);
    
    // 3. 不再应用预设样式表
    // 只保留换行和结构，不强制应用字体和字号
    
    Ok(html)
}
```

#### 2.2.2 CSS 类转换（段落对齐）

```rust
// 只转换段落对齐相关的 CSS 类
fn convert_css_classes_to_inline_styles(html: &str) -> String {
    let mut result = html.to_string();
    
    // 转换段落对齐类
    result = result.replace("class=\"center\"", "style=\"text-align: center\"");
    result = result.replace("class=\"right\"", "style=\"text-align: right\"");
    result = result.replace("class=\"left\"", "style=\"text-align: left\"");
    result = result.replace("class=\"justify\"", "style=\"text-align: justify\"");
    
    // 转换 Pandoc 生成的对齐类
    result = result.replace("class=\"text-center\"", "style=\"text-align: center\"");
    result = result.replace("class=\"text-right\"", "style=\"text-align: right\"");
    result = result.replace("class=\"text-left\"", "style=\"text-align: left\"");
    result = result.replace("class=\"text-justify\"", "style=\"text-align: justify\"");
    
    result
}
```

### 2.3 提取样式清单

#### ✅ 必须提取的样式（100% 复现）

1. **标题层级**
   - `<h1>` - 一级标题
   - `<h2>` - 二级标题
   - `<h3>` - 三级标题
   - `<h4>` - 四级标题
   - `<h5>` - 五级标题
   - `<h6>` - 六级标题

2. **文本格式**
   - `<strong>` 或 `<b>` - 粗体
   - `<em>` 或 `<i>` - 斜体
   - `<u>` - 下划线

3. **列表结构**
   - `<ul>` - 无序列表
   - `<ol>` - 有序列表
   - `<li>` - 列表项

4. **图片**
   - `<img src="..." alt="...">` - 嵌入图片，保留路径

5. **表格结构**
   - `<table>` - 表格
   - `<tr>` - 表格行
   - `<td>` - 表格单元格
   - `<th>` - 表格表头

6. **段落对齐**
   - `style="text-align: left"` - 左对齐
   - `style="text-align: center"` - 居中
   - `style="text-align: right"` - 右对齐
   - `style="text-align: justify"` - 两端对齐

#### ❌ 不提取的样式（技术限制）

1. **运行级别样式**（颜色、字体、字号）
   - 原因：Pandoc 可能不保留运行级别的格式信息
   - 处理：保留 Pandoc 输出的内联样式，用户可通过工具栏自行设置

2. **复杂表格格式**（合并单元格、边框样式）
   - 原因：Pandoc 只支持基础表格结构
   - 处理：用户可在编辑器中手动调整

3. **页眉页脚**
   - 原因：不在编辑范围内
   - 处理：明确告知用户不支持

---

## 三、结构保留层（只保留换行和结构）

### 3.1 设计思路

**问题**：预设样式会与文档原有样式冲突，导致显示混乱

**解决方案**：移除预设样式层，只保留换行和段落结构，不强制应用字体和字号

**核心原则**：
- ✅ 保留 Pandoc 输出的原始内联样式（如果存在）
- ✅ 保留段落结构（`<p>`, `<h1>`-`<h6>` 等标签）
- ✅ 保留基础格式（粗体、斜体、下划线等）
- ❌ 不强制应用字体和字号（避免样式冲突）
- ✅ 用户可通过工具栏自行设置样式

### 3.2 实现方式

**转换流程**：
```rust
pub fn convert_document_to_html(doc_path: &Path) -> Result<String, String> {
    // 1. Pandoc 转换（提取基础样式和结构）
    let html = pandoc_convert(doc_path)?;
    
    // 2. CSS 类转换为内联样式（段落对齐）
    let html = convert_css_classes_to_inline_styles(&html);
    
    // 3. 不再应用预设样式表
    // 只保留换行和结构，不强制应用字体和字号
    
    Ok(html)
}
```

**保留的内容**：
- ✅ 段落结构：`<p>`, `<h1>`-`<h6>` 等标签
- ✅ 基础格式：粗体、斜体、下划线（Pandoc 已提取）
- ✅ 列表结构：`<ul>`, `<ol>`, `<li>`
- ✅ 表格结构：`<table>`, `<tr>`, `<td>`
- ✅ 图片：`<img>` 标签
- ✅ 内联样式：Pandoc 输出的 `style` 属性（如颜色、字号等）

**不强制应用的内容**：
- ❌ 字体：不强制设置 `font-family`
- ❌ 字号：不强制设置 `font-size`
- ❌ 预设样式表：不再添加 CSS 样式表

### 3.3 优势

**避免样式冲突**：
- ✅ 不会强制覆盖文档原有样式
- ✅ 保留 Pandoc 输出的原始内联样式
- ✅ 文档显示更接近原样

**简化逻辑**：
- ✅ 减少代码复杂度
- ✅ 减少样式处理步骤
- ✅ 降低出错概率

**用户可控**：
- ✅ 用户可通过工具栏自行设置样式
- ✅ 用户可以根据需要调整字体和字号
- ✅ 编辑体验更灵活

### 3.4 潜在影响

**如果 Pandoc 没有输出内联样式**：
- 文档可能没有字体/字号设置
- 但结构完整（段落、标题、列表等）
- 用户可通过工具栏自行设置样式

**解决方案**：
- 用户可以通过工具栏设置字体和字号
- TipTap 编辑器支持完整的样式编辑功能

---

## 四、工具样式层（完整编辑能力）

### 4.1 设计理念

工具栏展示**全部 TipTap 支持的样式**，用户可以根据需要，任意编辑文本的所有样式。这提供了最大的编辑灵活性。

### 4.2 TipTap 支持的样式清单

#### 4.2.1 文本格式样式

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 快捷键 | 说明 |
|---------|------------|-----------|--------|------|
| **粗体** | StarterKit | ✅ | Cmd+B | `<strong>` 标签 |
| **斜体** | StarterKit | ✅ | Cmd+I | `<em>` 标签 |
| **下划线** | Underline | ✅ | Cmd+U | `<u>` 标签 |
| **删除线** | StarterKit | ✅ | - | `<s>` 标签 |
| **上标** | Superscript | ✅ | - | `<sup>` 标签 |
| **下标** | Subscript | ✅ | - | `<sub>` 标签 |

#### 4.2.2 标题样式

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 说明 |
|---------|------------|-----------|------|
| **标题 1** | StarterKit | ✅ H1 | `<h1>` 标签 |
| **标题 2** | StarterKit | ✅ H2 | `<h2>` 标签 |
| **标题 3** | StarterKit | ✅ H3 | `<h3>` 标签 |
| **标题 4** | StarterKit | ⚠️ 需添加 | `<h4>` 标签 |
| **标题 5** | StarterKit | ⚠️ 需添加 | `<h5>` 标签 |
| **标题 6** | StarterKit | ⚠️ 需添加 | `<h6>` 标签 |

#### 4.2.3 段落样式

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 说明 |
|---------|------------|-----------|------|
| **段落** | StarterKit | ✅ | `<p>` 标签 |
| **左对齐** | TextAlign | ✅ | `style="text-align: left"` |
| **居中** | TextAlign | ✅ | `style="text-align: center"` |
| **右对齐** | TextAlign | ✅ | `style="text-align: right"` |
| **两端对齐** | TextAlign | ⚠️ 需添加 | `style="text-align: justify"` |

#### 4.2.4 列表样式

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 说明 |
|---------|------------|-----------|------|
| **无序列表** | StarterKit | ✅ | `<ul>`, `<li>` 标签 |
| **有序列表** | StarterKit | ⚠️ 需添加 | `<ol>`, `<li>` 标签 |
| **任务列表** | TaskList | ⚠️ 需添加 | 复选框列表 |

#### 4.2.5 文本颜色和背景

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 说明 |
|---------|------------|-----------|------|
| **文本颜色** | Color | ✅ | `style="color: #xxxxxx"` |
| **背景颜色** | Highlight | ⚠️ 需添加 | `style="background-color: #xxxxxx"` |

#### 4.2.6 字体样式

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 说明 |
|---------|------------|-----------|------|
| **字体族** | FontFamily | ✅ | `style="font-family: ..."` |
| **字号** | FontSize (自定义) | ✅ | `style="font-size: ...px"` |

#### 4.2.7 链接和媒体

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 说明 |
|---------|------------|-----------|------|
| **链接** | Link | ✅ | `<a href="...">` 标签 |
| **图片** | Image | ✅ | `<img src="...">` 标签 |

#### 4.2.8 表格样式

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 说明 |
|---------|------------|-----------|------|
| **插入表格** | Table | ⚠️ 需添加 | `<table>`, `<tr>`, `<td>` 标签 |
| **表格行** | TableRow | - | 表格行操作 |
| **表格单元格** | TableCell | - | 单元格操作 |
| **表格表头** | TableHeader | - | 表头操作 |

#### 4.2.9 其他样式（可选扩展）

| 样式名称 | TipTap 扩展 | 工具栏按钮 | 说明 |
|---------|------------|-----------|------|
| **代码块** | CodeBlock | ⚠️ 需添加 | `<pre><code>` 标签 |
| **行内代码** | Code | ⚠️ 需添加 | `<code>` 标签 |
| **引用块** | Blockquote | ⚠️ 需添加 | `<blockquote>` 标签 |
| **水平线** | HorizontalRule | ⚠️ 需添加 | `<hr>` 标签 |
| **硬换行** | HardBreak | - | `<br>` 标签 |

### 4.3 工具栏实现

#### 4.3.1 当前工具栏（已实现）

```tsx
// src/components/Editor/EditorToolbar.tsx

// 已实现的样式按钮：
- 粗体 (BoldIcon)
- 斜体 (ItalicIcon)
- 下划线 (Underline)
- 删除线 (Strike)
- 标题 1/2/3 (Heading)
- 无序列表 (BulletList)
- 文本对齐 (Left/Center/Right)
- 文本颜色 (Color Picker)
- 字号选择 (FontSize)
- 字体族选择 (FontFamily)
- 上标/下标 (Superscript/Subscript)
- 链接 (Link)
- 图片 (Image)
```

#### 4.3.2 需要添加的工具栏按钮

```tsx
// 需要添加的样式按钮：

1. **标题 4/5/6**
   - 按钮：H4, H5, H6
   - 功能：`editor.chain().focus().toggleHeading({ level: 4/5/6 }).run()`

2. **有序列表**
   - 按钮：OrderedListIcon
   - 功能：`editor.chain().focus().toggleOrderedList().run()`

3. **两端对齐**
   - 按钮：JustifyIcon
   - 功能：`editor.chain().focus().setTextAlign('justify').run()`

4. **背景颜色（高亮）**
   - 按钮：HighlightColorPicker
   - 功能：需要安装 `@tiptap/extension-highlight`
   - 功能：`editor.chain().focus().setHighlight({ color: '...' }).run()`

5. **插入表格**
   - 按钮：TableIcon
   - 功能：`editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()`

6. **代码块**
   - 按钮：CodeBlockIcon
   - 功能：需要安装 `@tiptap/extension-code-block`
   - 功能：`editor.chain().focus().toggleCodeBlock().run()`

7. **行内代码**
   - 按钮：CodeIcon
   - 功能：`editor.chain().focus().toggleCode().run()`

8. **引用块**
   - 按钮：BlockquoteIcon
   - 功能：`editor.chain().focus().toggleBlockquote().run()`

9. **水平线**
   - 按钮：HorizontalRuleIcon
   - 功能：`editor.chain().focus().setHorizontalRule().run()`
```

### 4.4 工具栏布局建议

```
[基础格式] [标题] [列表] [对齐] [颜色] [字体] [其他] [媒体] [表格]

基础格式：粗体、斜体、下划线、删除线、上标、下标
标题：H1, H2, H3, H4, H5, H6
列表：无序列表、有序列表、任务列表
对齐：左对齐、居中、右对齐、两端对齐
颜色：文本颜色、背景颜色（高亮）
字体：字体族、字号
其他：代码块、行内代码、引用块、水平线
媒体：链接、图片
表格：插入表格、表格操作
```

---

## 五、实现计划

### 5.1 阶段一：提取样式层（必须实现）

**目标**：确保基础样式 100% 复现

**任务清单**：
1. ✅ 使用 Pandoc 转换 DOCX 到 HTML
2. ✅ 实现 CSS 类转换为内联样式（段落对齐）
3. ✅ 确保标题、粗体、斜体、下划线、列表、图片、表格正确提取
4. ⚠️ 测试并验证 100% 复现率

**预计时间**：1-2 天

### 5.2 阶段二：结构保留层（已完成）

**目标**：只保留换行和结构，不强制应用字体和字号

**任务清单**：
1. ✅ 移除预设样式表应用逻辑
2. ✅ 保留 Pandoc 输出的原始内联样式
3. ✅ 确保段落结构完整保留
4. ✅ 验证样式不冲突

**预计时间**：已完成

### 5.3 阶段三：工具样式层（增强实现）

**目标**：完善工具栏，提供完整编辑能力

**任务清单**：
1. ⚠️ 添加缺失的 TipTap 扩展（Highlight, CodeBlock, TaskList 等）
2. ⚠️ 添加缺失的工具栏按钮（H4/H5/H6, 有序列表, 两端对齐, 背景颜色, 表格, 代码块等）
3. ⚠️ 优化工具栏布局和交互
4. ⚠️ 测试所有样式功能

**预计时间**：3-5 天

---

## 六、技术实现细节

### 6.1 提取样式层实现

#### 6.1.1 Pandoc 转换配置

```rust
// src-tauri/src/services/pandoc_service.rs

pub fn convert_document_to_html(doc_path: &Path) -> Result<String, String> {
    use std::process::Command;
    
    // 1. Pandoc 转换
    let output = Command::new("pandoc")
        .arg(doc_path.as_os_str())
        .arg("--from")
        .arg("docx+styles")
        .arg("--to")
        .arg("html+raw_html+native_divs+native_spans")
        .arg("--standalone")
        .arg("--wrap=none")
        .output()
        .map_err(|e| format!("Pandoc 转换失败: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Pandoc 转换失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    let html = String::from_utf8_lossy(&output.stdout).to_string();
    
    // 2. CSS 类转换为内联样式（段落对齐）
    let html = Self::convert_css_classes_to_inline_styles(&html);
    
    // 3. 不再应用预设样式表
    // 只保留换行和结构，不强制应用字体和字号
    // 保留 Pandoc 输出的原始内联样式，让用户通过工具栏自行设置样式
    
    Ok(html)
}
```

#### 6.1.2 CSS 类转换实现

```rust
fn convert_css_classes_to_inline_styles(html: &str) -> String {
    let mut result = html.to_string();
    
    // 段落对齐转换
    let alignments = vec![
        ("center", "text-align: center"),
        ("right", "text-align: right"),
        ("left", "text-align: left"),
        ("justify", "text-align: justify"),
        ("text-center", "text-align: center"),
        ("text-right", "text-align: right"),
        ("text-left", "text-align: left"),
        ("text-justify", "text-align: justify"),
    ];
    
    for (class_name, style) in alignments {
        let pattern = format!("class=\"{}\"", class_name);
        let replacement = format!("style=\"{}\"", style);
        result = result.replace(&pattern, &replacement);
    }
    
    result
}
```

### 6.2 结构保留层实现（不强制应用样式）

#### 6.2.1 转换流程（不强制应用样式）

**核心原则**：只保留换行和结构，不强制应用字体和字号

```rust
pub fn convert_document_to_html(doc_path: &Path) -> Result<String, String> {
    // 1. Pandoc 转换（提取基础样式和结构）
    let html = pandoc_convert(doc_path)?;
    
    // 2. CSS 类转换为内联样式（段落对齐）
    let html = convert_css_classes_to_inline_styles(&html);
    
    // 3. 不再应用预设样式表
    // 只保留换行和结构，不强制应用字体和字号
    // 保留 Pandoc 输出的原始内联样式，让用户通过工具栏自行设置样式
    
    Ok(html)
}
```

#### 6.2.2 保留的内容

**结构保留**：
- ✅ 段落结构：`<p>`, `<h1>`-`<h6>` 等标签
- ✅ 列表结构：`<ul>`, `<ol>`, `<li>`
- ✅ 表格结构：`<table>`, `<tr>`, `<td>`
- ✅ 图片：`<img>` 标签

**样式保留**：
- ✅ 基础格式：粗体、斜体、下划线（Pandoc 已提取）
- ✅ 内联样式：Pandoc 输出的 `style` 属性（如颜色、字号等）
- ✅ 段落对齐：通过 CSS 类转换保留

**不强制应用**：
- ❌ 字体：不强制设置 `font-family`
- ❌ 字号：不强制设置 `font-size`
- ❌ 预设样式表：不再添加 CSS 样式表

#### 6.2.3 转换流程说明

```rust
pub fn convert_document_to_html(doc_path: &Path) -> Result<String, String> {
    // 1. Pandoc 转换（提取基础样式和结构）
    let mut cmd = Command::new("pandoc");
    cmd.arg(doc_path.as_os_str())
        .arg("--from")
        .arg("docx+styles")               // 启用样式扩展以保留 DOCX 样式信息
        .arg("--to")
        .arg("html+raw_html+native_divs+native_spans")  // 保留原始 HTML 标签和内联样式
        .arg("--standalone")              // 生成完整 HTML（包含样式）
        .arg("--wrap=none")               // 不换行
        .arg("--extract-media=.")         // 提取媒体文件
        .arg("--preserve-tabs");          // 保留制表符
        // 注意：不再使用 --variable 强制设置字体和字号，避免与文档原有样式冲突
    
    // 尝试使用 Lua 过滤器来保留格式（如果存在）
    if let Some(lua_filter) = Self::get_lua_filter_path() {
        cmd.arg("--lua-filter").arg(lua_filter);
    }
    
    let output = cmd.output()
        .map_err(|e| format!("Pandoc 转换失败: {}", e))?;
    
    if !output.status.success() {
        return Err(format!("Pandoc 转换失败: {}", String::from_utf8_lossy(&output.stderr)));
    }
    
    let html = String::from_utf8_lossy(&output.stdout).to_string();
    
    // 2. CSS 类转换为内联样式（段落对齐）
    let html = Self::convert_css_classes_to_inline_styles(&html);
    
    // 3. 不再应用预设样式表
    // 只保留换行和结构，不强制应用字体和字号
    // 保留 Pandoc 输出的原始内联样式，让用户通过工具栏自行设置样式
    
    Ok(html)
}
```

### 6.3 工具样式层实现

#### 6.3.1 添加缺失的 TipTap 扩展

```typescript
// src/components/Editor/TipTapEditor.tsx

import { Highlight } from '@tiptap/extension-highlight';
import { CodeBlock } from '@tiptap/extension-code-block';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';

extensions: [
  // ... 现有扩展
  Highlight.configure({
    multicolor: true,
  }),
  CodeBlock,
  TaskList,
  TaskItem,
  // ... 其他扩展
]
```

#### 6.3.2 添加缺失的工具栏按钮

```tsx
// src/components/Editor/EditorToolbar.tsx

// 添加标题 4/5/6
<button onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
  H4
</button>

// 添加有序列表
<button onClick={() => editor.chain().focus().toggleOrderedList().run()}>
  <OrderedListIcon className="w-5 h-5" />
</button>

// 添加两端对齐
<button onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
  <JustifyIcon className="w-5 h-5" />
</button>

// 添加背景颜色
<input
  type="color"
  onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
/>

// 添加表格
<button onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run()}>
  <TableIcon className="w-5 h-5" />
</button>
```

---

## 七、用户告知策略

### 7.1 编辑模式样式支持说明

在编辑模式界面明确告知用户：

```
编辑模式样式支持说明：

✅ 完全支持（100% 复现）：
- 标题层级（H1-H6）
- 粗体、斜体、下划线
- 列表结构（有序、无序）
- 图片（嵌入图片）
- 表格结构（基础表格）
- 段落对齐（左、中、右、两端对齐）

⚠️ 预设样式（自动套用）：
- 字体、字号：使用统一的默认预设样式（Arial，3 级字号体系），自动套用实现层次化展示
- 用户可在编辑器中手动调整，用户修改的样式优先级更高

✅ 完整编辑能力（工具栏）：
- 所有 TipTap 支持的样式都可以通过工具栏编辑
- 包括：文本格式、标题、列表、对齐、颜色、字体、链接、图片、表格等
```

### 7.2 预设样式说明

```
提示：文档已应用默认预设样式（Arial，3 级字号体系）
如需调整字体或字号，可在编辑器中手动修改
```

---

## 八、总结

### 8.1 核心优势

1. **提取样式层**：只提取 Pandoc 最成熟的部分，确保 100% 复现，内容完整
2. **结构保留层**：只保留换行和结构，不强制应用字体和字号，避免样式冲突
3. **工具样式层**：工具栏展示全部 TipTap 支持的样式，提供完整编辑能力

### 8.2 技术特点

1. **处理速度快**：只做必要的 CSS 类转换，不进行复杂的格式提取
2. **内容完整性**：不破坏 HTML 结构，确保内容不丢失
3. **编辑灵活性**：用户可以通过工具栏自由编辑所有样式
4. **样式稳定性**：使用 CSS 样式表（不修改 HTML），CSS 优先级自动处理，用户编辑不受影响

### 8.3 实施优先级

1. **优先级 1**：提取样式层（必须实现）
2. **优先级 2**：结构保留层（已完成）
3. **优先级 3**：工具样式层（增强实现）

---

**文档版本**：v1.0  
**创建日期**：2024-12-19  
**最后更新**：2024-12-19

