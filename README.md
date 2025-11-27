# Binder（合页）

AI 智能办公套件 - 面向创作者的文档编辑器

## 开发环境要求

- Node.js >= 18
- Rust >= 1.70
- npm 或 yarn

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run tauri:dev
```

### 构建应用

```bash
npm run tauri:build
```

## 项目结构

```
binder-project/
├── src/                    # 前端源代码
│   ├── components/         # React 组件
│   ├── stores/            # Zustand 状态管理
│   ├── services/          # 前端服务层
│   └── types/             # TypeScript 类型定义
├── src-tauri/             # Rust 后端源代码
│   ├── src/
│   │   ├── services/      # 后端服务
│   │   ├── commands/      # Tauri 命令
│   │   └── main.rs        # 入口文件
│   └── resources/         # 资源文件（Pandoc 二进制等）
└── 第一阶段开发计划.md    # 开发计划文档
```

## 开发计划

当前处于第一阶段：基础架构搭建（Week 1-4）

详细开发计划请参考：`第一阶段开发计划.md`

## 注意事项

1. **Pandoc 二进制文件**：需要将 Pandoc 二进制文件放置在 `src-tauri/resources/bin/` 目录
2. **开发环境**：确保已安装 Rust 和 Node.js
3. **首次运行**：首次运行需要编译 Rust 代码，可能需要几分钟

