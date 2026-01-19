---
title: Browser Control 服务文档
version: 1.0.0
created: 2026-01-10
updated: 2026-01-10
author: agent-kaichi
status: stable
---

# Browser Control 服务文档

Browser Control Manager 提供 HTTP API，允许通过接口控制浏览器：管理标签页、获取页面内容、执行脚本、操作 Cookie。

## 服务地址

| 服务 | 地址 |
|------|------|
| HTTP API | `http://localhost:3333` |
| WebSocket（扩展连接） | `ws://localhost:8080` |

## 能力清单

| 能力 | 说明 |
|------|------|
| 标签页管理 | 获取列表、打开 URL、关闭标签页 |
| 页面内容 | 获取页面 HTML |
| 脚本执行 | 在页面中执行 JavaScript、注入 CSS |
| Cookie 操作 | 获取、保存、查询 Cookie |
| 文件上传 | 向页面 input 元素上传文件 |
| 事件监听 | SSE 实时事件推送 |

## 快速检查

### 检查服务是否运行

```bash
curl http://localhost:3333/api/browser/status
```

成功返回：

```json
{
  "status": "success",
  "data": {
    "isRunning": true,
    "state": "running"
  }
}
```

### 检查浏览器扩展是否连接

```bash
curl http://localhost:3333/api/browser/status
```

查看返回中的 `connections.extensionWebSocket.activeConnections`：

```json
{
  "status": "success",
  "data": {
    "connections": {
      "extensionWebSocket": {
        "enabled": true,
        "activeConnections": 1
      }
    }
  }
}
```

- `activeConnections: 0` 表示没有浏览器扩展连接
- `activeConnections: 1` 或更多表示扩展已连接

### 获取标签页列表

```bash
curl http://localhost:3333/api/browser/tabs
```

成功返回：

```json
{
  "status": "success",
  "tabs": [
    {
      "id": 123456789,
      "url": "https://example.com",
      "title": "Example Domain",
      "is_active": true
    }
  ]
}
```

## 前置条件

使用 Browser Control API 前，确保：

1. **Browser Control Manager 应用正在运行**
2. **浏览器扩展已安装并连接**（检查 `activeConnections > 0`）

## 文档导航

| 文档 | 说明 | 适用场景 |
|------|------|----------|
| [QUICKSTART.md](QUICKSTART.md) | 快速开始 | 快速了解常用操作 |
| [API.md](API.md) | API 完整参考 | 查找特定 API 的详细说明 |
| [SCENARIOS.md](SCENARIOS.md) | 使用场景指南 | 按任务查找操作方法 |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | 故障排查 | 遇到问题时诊断 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 文档维护规约 | 创建或更新文档时参考 |

## API 概览

### 状态查询

- `GET /api/browser/status` - 获取服务状态
- `GET /api/browser/config` - 获取服务配置

### 标签页操作

- `GET /api/browser/tabs` - 获取标签页列表
- `POST /api/browser/open_url` - 打开 URL
- `POST /api/browser/close_tab` - 关闭标签页
- `POST /api/browser/get_html` - 获取页面 HTML

### 脚本执行

- `POST /api/browser/execute_script` - 执行 JavaScript
- `POST /api/browser/inject_css` - 注入 CSS

### Cookie 操作

- `POST /api/browser/get_cookies` - 从浏览器获取 Cookie
- `POST /api/browser/save_cookies` - 保存 Cookie 到数据库
- `GET /api/browser/cookies` - 查询数据库中的 Cookie
- `GET /api/browser/cookies/:tabId` - 获取指定标签页的 Cookie
- `GET /api/browser/cookies/stats` - Cookie 统计信息

### 其他

- `POST /api/browser/upload_file_to_tab` - 上传文件到页面
- `GET /api/browser/events` - SSE 事件流
- `POST /api/browser/emit_event` - 发送自定义事件
- `GET /api/browser/callback_response/:requestId` - 获取异步操作结果

---

## 更新日志

### v1.0.0 (2026-01-10)
- 初始版本
- 服务介绍和能力清单
- 快速检查命令
- 文档导航索引
- API 概览
