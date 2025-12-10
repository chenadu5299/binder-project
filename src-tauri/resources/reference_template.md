# 参考文档模板

这是一个用于 Pandoc 转换的参考 DOCX 模板的源文件。

## 模板说明

此模板定义了标准样式，用于在 HTML → DOCX 转换时保留格式。

### 样式定义

1. **标题样式**
   - 标题 1：18pt，粗体，Arial
   - 标题 2：16pt，粗体，Arial
   - 标题 3：14pt，粗体，Arial

2. **正文样式**
   - 正文：12pt，Arial
   - 强调：12pt，斜体，Arial

3. **列表样式**
   - 无序列表：12pt，Arial
   - 有序列表：12pt，Arial

### 使用说明

使用以下命令将此 Markdown 转换为参考 DOCX：

```bash
pandoc reference_template.md -o reference.docx --reference-doc=reference.docx
```

或者直接创建：

```bash
pandoc reference_template.md -o reference.docx
```

然后将生成的 `reference.docx` 用 Microsoft Word 打开，定义标准样式后保存。

---

## 示例内容

### 标题 1 示例

这是标题 1 的示例文本。

### 标题 2 示例

这是标题 2 的示例文本。

#### 标题 3 示例

这是标题 3 的示例文本。

**正文示例**

这是正文的示例文本。包含普通文本、*斜体文本*、**粗体文本**和***粗斜体文本***。

- 无序列表项 1
- 无序列表项 2
- 无序列表项 3

1. 有序列表项 1
2. 有序列表项 2
3. 有序列表项 3

---

**注意**：此模板需要在 Word 中打开并定义样式，然后保存为 `reference.docx` 供 Pandoc 使用。

