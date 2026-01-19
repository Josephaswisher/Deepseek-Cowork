---
title: Browser Control 文档维护规约
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control 文档维护规约

本文档定义了 Browser Control Manager 文档的创建和更新规范，供后续维护者（AI 和人类）遵循。

## 1. 元信息规范

### YAML 头部格式

每个文档必须以 YAML 格式的元信息块开头：

```yaml
---
title: 文档标题
version: 1.0.0
created: YYYY-MM-DD
updated: YYYY-MM-DD
author: 作者名
status: draft | stable | deprecated
---
```

### 字段说明

| 字段 | 必需 | 说明 | 示例 |
|------|------|------|------|
| `title` | 是 | 文档标题 | Browser Control API 参考 |
| `version` | 是 | 语义化版本号 | 1.0.0 |
| `created` | 是 | 创建日期 | 2026-01-10 |
| `updated` | 是 | 最后更新日期 | 2026-01-10 |
| `author` | 是 | 作者/维护者 | agent-kaichi |
| `status` | 是 | 文档状态 | stable |

### status 取值

- `draft` - 草稿，内容不完整或未经验证
- `stable` - 稳定版本，内容完整可用
- `deprecated` - 已废弃，保留供参考但不应继续使用

## 2. 版本控制规则

### 语义化版本号

遵循 [Semantic Versioning](https://semver.org/) 规范：

```
MAJOR.MINOR.PATCH
```

- **MAJOR（主版本号）**：文档结构重大变更，或对应 API 有破坏性变更
- **MINOR（次版本号）**：新增内容，如新增 API 说明、新增章节
- **PATCH（修订号）**：修复错误、格式优化、措辞改进

### 版本变更场景

| 变更类型 | 版本变更 | 示例 |
|----------|----------|------|
| 修复文档错误 | PATCH | 1.0.0 → 1.0.1 |
| 更新 curl 示例 | PATCH | 1.0.1 → 1.0.2 |
| 新增 API 说明 | MINOR | 1.0.2 → 1.1.0 |
| 新增章节 | MINOR | 1.1.0 → 1.2.0 |
| API 有破坏性变更 | MAJOR | 1.2.0 → 2.0.0 |
| 文档结构重组 | MAJOR | 2.0.0 → 3.0.0 |

### 更新日志格式

每个文档末尾必须包含更新日志：

```markdown
---

## 更新日志

### v1.1.0 (2026-01-15)
- 新增 `execute_script` API 说明
- 补充异步操作的回调机制

### v1.0.1 (2026-01-12)
- 修复 curl 示例中的端口错误
- 补充返回值示例

### v1.0.0 (2026-01-10)
- 初始版本
```

## 3. 文档更新流程

### 修改前

1. 检查文档当前版本号
2. 确认修改类型（PATCH/MINOR/MAJOR）

### 修改时

1. **必须**更新 `updated` 日期为当天
2. 进行文档内容修改

### 修改后

1. 根据修改类型递增版本号
2. 在更新日志中添加新版本记录
3. 简要描述修改内容

### 示例

修改前：
```yaml
version: 1.0.0
updated: 2026-01-10
```

修改后（假设是 PATCH 修复）：
```yaml
version: 1.0.1
updated: 2026-01-12
```

并在更新日志添加：
```markdown
### v1.0.1 (2026-01-12)
- 修复 get_html API 的 curl 示例
```

## 4. 编写原则

### curl 示例必须可直接执行

```bash
# 正确 - 完整的可执行命令
curl http://localhost:3333/api/browser/tabs

# 正确 - POST 请求包含完整参数
curl -X POST http://localhost:3333/api/browser/open_url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# 错误 - 省略了必要信息
curl /api/browser/tabs
```

### 返回值必须有 JSON 示例

每个 API 必须包含返回值示例：

```markdown
**返回示例**:

```json
{
  "status": "success",
  "tabs": [
    {
      "id": 123,
      "url": "https://example.com",
      "title": "Example"
    }
  ]
}
```
```

### 任务导向而非 API 导向

```markdown
# 正确 - 任务导向
## 获取网页内容
如果需要获取某个页面的 HTML 内容：
1. 先获取标签页列表，找到目标 tabId
2. 调用 get_html API 获取内容

# 错误 - 纯 API 罗列
## get_html API
参数：tabId
返回：HTML 内容
```

### 错误处理指引

每个 API 说明应包含常见错误和处理方式：

```markdown
**常见错误**:

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| WebSocket服务器不可用 | 扩展未连接 | 检查浏览器扩展是否安装并运行 |
| 缺少'tabId' | 参数不完整 | 确保请求包含 tabId 参数 |
```

## 5. 文档模板

创建新文档时，使用以下模板：

```markdown
---
title: [文档标题]
version: 1.0.0
created: [YYYY-MM-DD]
updated: [YYYY-MM-DD]
author: agent-kaichi
status: draft
---

# [文档标题]

[文档简介，一两句话说明文档的作用]

## 1. [第一章节]

[章节内容]

## 2. [第二章节]

[章节内容]

---

## 更新日志

### v1.0.0 ([YYYY-MM-DD])
- 初始版本
```

## 6. API 文档同步规则

### 代码变更时同步更新文档

当 `browserRoutes.js` 或其他 API 代码发生变更时：

1. 检查 `API.md` 是否需要更新
2. 如果 API 参数变更，更新参数表格
3. 如果返回值变更，更新返回示例
4. 如果是新增 API，添加完整的 API 说明
5. 更新文档版本号和更新日志

### 废弃 API 的标记方式

不要直接删除废弃的 API 文档，使用以下方式标记：

```markdown
## ~~get_old_data~~ (已废弃)

> **警告**: 此 API 已废弃，将在 v2.0.0 移除。请使用 `get_new_data` 替代。

[保留原有文档内容供参考]
```

同时在文档元信息中，如果整个文档废弃：

```yaml
status: deprecated
```

## 7. 文档目录索引

本目录包含以下文档：

| 文档 | 说明 |
|------|------|
| [README.md](README.md) | 服务总览，快速了解能力和检查方法 |
| [API.md](API.md) | API 完整参考，详细的接口说明 |
| [QUICKSTART.md](QUICKSTART.md) | 快速开始，常用操作的即用模板 |
| [SCENARIOS.md](SCENARIOS.md) | 使用场景，按任务组织的操作指南 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 故障排查，常见问题诊断 |

---

## 更新日志

### v1.0.0 (2026-01-10)
- 初始版本
- 定义元信息规范
- 定义版本控制规则
- 定义文档更新流程
- 定义编写原则
- 提供文档模板
- 定义 API 文档同步规则
