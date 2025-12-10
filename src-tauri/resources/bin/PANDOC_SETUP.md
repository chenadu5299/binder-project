# Pandoc 内置配置指南

## 概述

Binder 支持内置 Pandoc 二进制文件，优先使用系统安装的 Pandoc，如果没有则自动使用内置版本。

## 目录结构

```
src-tauri/resources/bin/
├── pandoc          # macOS/Linux 二进制文件
├── pandoc.exe      # Windows 二进制文件
└── PANDOC_SETUP.md # 本文件
```

## 获取 Pandoc 二进制文件

### 方法 1：从 Pandoc 官网下载（推荐）

1. 访问 [Pandoc 下载页面](https://github.com/jgm/pandoc/releases)
2. 下载对应平台的安装包或二进制文件
3. 提取二进制文件到 `src-tauri/resources/bin/` 目录

### 方法 2：从系统安装中复制

如果系统已安装 Pandoc，可以从安装位置复制：

**macOS:**
```bash
# 查找 Pandoc 位置
which pandoc

# 复制到资源目录（假设 Pandoc 在 /usr/local/bin/pandoc）
cp /usr/local/bin/pandoc src-tauri/resources/bin/pandoc
```

**Windows:**
```powershell
# 查找 Pandoc 位置
where pandoc

# 复制到资源目录（假设 Pandoc 在 C:\Program Files\Pandoc\pandoc.exe）
copy "C:\Program Files\Pandoc\pandoc.exe" src-tauri\resources\bin\pandoc.exe
```

**Linux:**
```bash
# 查找 Pandoc 位置
which pandoc

# 复制到资源目录
cp $(which pandoc) src-tauri/resources/bin/pandoc
```

## 平台特定说明

### macOS

- 二进制文件名：`pandoc`
- 打包后路径：`Binder.app/Contents/Resources/bin/pandoc`
- 需要确保二进制文件有执行权限：
  ```bash
  chmod +x src-tauri/resources/bin/pandoc
  ```

### Windows

- 二进制文件名：`pandoc.exe`
- 打包后路径：`bin/pandoc.exe`（相对于可执行文件）
- 确保文件是 Windows 版本

### Linux

- 二进制文件名：`pandoc`
- 打包后路径：`bin/pandoc`（相对于可执行文件）
- 需要确保二进制文件有执行权限：
  ```bash
  chmod +x src-tauri/resources/bin/pandoc
  ```

## 验证

### 开发模式验证

1. 将 Pandoc 二进制文件放置到 `src-tauri/resources/bin/` 目录
2. 运行应用：`npm run tauri:dev`
3. 查看控制台输出，应该看到：
   - 如果系统有 Pandoc：`✅ 使用系统 Pandoc: ...`
   - 如果系统没有：`✅ 使用内置 Pandoc: ...`

### 打包后验证

1. 构建应用：`npm run tauri:build`
2. 运行打包后的应用
3. 尝试打开 DOCX 文件，应该能正常转换

## 注意事项

1. **文件大小**：Pandoc 二进制文件较大（约 50-100MB），会增加应用体积
2. **平台兼容性**：需要为每个目标平台准备对应的二进制文件
3. **版本兼容性**：建议使用 Pandoc 2.x 或更高版本
4. **依赖库**：某些平台可能需要额外的动态库，确保一并打包

## 多平台构建

如果需要在多个平台构建，需要准备多个平台的 Pandoc 二进制文件：

```
src-tauri/resources/bin/
├── pandoc-macos      # macOS 版本
├── pandoc-windows.exe # Windows 版本
└── pandoc-linux      # Linux 版本
```

然后在构建脚本中根据平台选择对应的文件。

## 故障排查

### 问题：找不到内置 Pandoc

**可能原因：**
1. 二进制文件未放置在正确位置
2. 文件名不正确（应该是 `pandoc` 或 `pandoc.exe`）
3. 文件权限问题（Linux/macOS 需要执行权限）

**解决方法：**
1. 检查文件路径和文件名
2. 确保文件有执行权限（Linux/macOS）
3. 查看控制台日志，确认查找路径

### 问题：内置 Pandoc 无法执行

**可能原因：**
1. 缺少依赖库（Linux）
2. 架构不匹配（如 ARM vs x86_64）

**解决方法：**
1. 使用静态链接的 Pandoc 版本
2. 确保二进制文件与目标平台架构匹配

---

**最后更新**：2025-01-XX

