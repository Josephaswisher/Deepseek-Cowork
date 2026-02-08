# CLI 构建与链接工作流

本文档描述了 DeepSeek Cowork CLI 工具的构建和本地链接流程，**不涉及版本号更新**。  
适用于代码变更后需要重新构建 CLI 并在本地生效的场景。

> 如需同时更新版本号，请参考 [version-update-workflow.md](./version-update-workflow.md)。

## 适用场景

- 修改了 `packages/cli/` 下的源码，需要重新构建
- 修改了 CLI 依赖的其他目录（如 `server/`、`config/`、`lib/`、`deploy/`），需要重新打包
- 本地 `deepseek-cowork` / `dsc` 命令行为不符合预期，需要重新链接

## 一键执行

```bash
cd packages/cli && rm -rf dist && npm run build && npm link
```

## 分步说明

### 步骤 1: 清理旧的构建产物

```bash
cd packages/cli
rm -rf dist
```

> 每次构建前务必清理，避免旧文件残留导致意外问题。

### 步骤 2: 构建

```bash
npm run build
```

构建脚本 (`build.mjs`) 会执行以下操作：
1. 使用 esbuild 打包 CLI 入口 → `dist/cli.mjs`
2. 复制 `lib/` 目录（CommonJS 模式）
3. 复制 `server/` 目录（CommonJS 模式）
4. 复制 `config/` 目录（CommonJS 模式）
5. 复制 `deploy/` 目录
6. 生成 `dist/package.json`
7. 复制 `README.md`

构建成功输出示例：
```
✅ Build completed successfully!
```

### 步骤 3: 链接到全局

```bash
npm link
```

链接后，以下命令会指向最新构建的版本：
- `deepseek-cowork`
- `dsc`

### 步骤 4: 验证

```bash
deepseek-cowork --version
# 或
dsc --version
```

## 常见问题

### Q: 构建失败怎么办？

1. 确认当前目录在 `packages/cli` 下
2. 确保依赖已安装：`npm install`
3. 检查 Node.js 版本 >= 18.0.0
4. 查看 `build.mjs` 的报错信息定位问题

### Q: npm link 后命令未生效？

1. 先卸载再重新链接：`npm unlink -g deepseek-cowork && npm link`
2. 检查终端是否需要重新打开以刷新 PATH
3. Linux/macOS 可能需要 `sudo npm link`

### Q: 只改了 server/ 目录的代码，需要重新构建吗？

需要。`server/` 会在构建时被复制到 `dist/` 中，CLI 运行时使用的是 `dist/` 下的副本，因此任何依赖目录的变更都需要重新构建。
