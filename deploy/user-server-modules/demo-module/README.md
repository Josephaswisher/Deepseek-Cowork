# Demo Module - 演示模块

展示 deepseek-cowork 自定义模块的完整功能和开发模式，包括**核心服务集成**。

## 功能

- **静态页面服务**: 提供介绍自定义模块功能的 HTML 页面
- **API 接口示例**: 状态查询、Echo 接口、模块信息
- **标准生命周期**: 实现 init/setupRoutes/start/stop 接口
- **核心服务集成**: 演示如何使用 HappyService、MessageStore 等核心服务

## 核心服务集成

从 v2.0.0 开始，演示模块展示了如何通过 `runtimeContext.services` 使用核心服务：

### 可用的核心服务

| 服务 | 说明 |
|------|------|
| `HappyService` | AI 通信核心，用于发送消息、监听响应 |
| `MessageStore` | 消息持久化存储，用于读取/保存消息历史 |
| `MemoryManager` | 记忆管理器（类），用于保存和检索对话记忆 |
| `userSettings` | 用户设置 |
| `secureSettings` | 安全设置（API 密钥等） |

### 在模块中使用核心服务

```javascript
function setupMyModuleService(options = {}) {
    // 从 options 获取注入的核心服务
    const HappyService = options.HappyService;
    const MessageStore = options.MessageStore;
    
    class MyModuleService extends EventEmitter {
        constructor() {
            super();
            this.happyService = HappyService;
            this.messageStore = MessageStore;
        }
        
        async init() {
            // 监听 AI 消息事件
            if (this.happyService) {
                this.happyService.on('happy:message', (msg) => {
                    console.log('收到消息:', msg);
                });
            }
        }
        
        async sendToAI(text) {
            // 调用 HappyService 发送消息
            if (this.happyService) {
                return await this.happyService.sendMessage(text);
            }
        }
        
        getHistory(sessionId) {
            // 调用 MessageStore 获取消息历史
            if (this.messageStore) {
                return this.messageStore.getMessages(sessionId);
            }
            return [];
        }
    }
    
    return new MyModuleService();
}
```

### 在模块配置中注入服务

```javascript
// userServerModulesConfig.js
module.exports = {
    modules: [
        {
            name: 'my-module',
            module: './my-module',
            setupFunction: 'setupMyModuleService',
            enabled: true,
            features: { hasRoutes: true },
            // 通过 getOptions 注入核心服务
            getOptions: (config, runtimeContext) => ({
                HappyService: runtimeContext?.services?.HappyService,
                MessageStore: runtimeContext?.services?.MessageStore
            })
        }
    ]
};
```

## API 接口

### 基础接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/demo/` | GET | 介绍页面 |
| `/api/demo/status` | GET | 获取模块运行状态 |
| `/api/demo/echo` | POST | Echo 请求体 |
| `/api/demo/info` | GET | 获取模块详细信息 |

### 核心服务演示接口

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/demo/services` | GET | 核心服务可用性状态 |
| `/api/demo/messages` | GET | 获取消息历史（演示 MessageStore） |
| `/api/demo/recent` | GET | 最近收到的消息（演示事件监听） |
| `/api/demo/send` | POST | 发送消息到 AI（演示 HappyService） |

## 部署

```bash
# 部署演示模块到用户数据目录
node deploy/index.js module demo-module

# 重启服务后访问（支持热加载，无需重启）
# http://localhost:3333/demo/
```

## 文件结构

```
demo-module/
├── index.js           # 模块入口（包含核心服务集成代码）
├── static/
│   └── index.html     # 介绍页面
└── README.md          # 本文件
```

## 模块配置

部署后会自动在 `userServerModulesConfig.js` 中添加以下配置：

```javascript
{
    name: 'demo-module',
    module: './demo-module',
    setupFunction: 'setupDemoModuleService',
    enabled: true,
    features: {
        hasRoutes: true,
        hasStatic: true
    },
    // 注入核心服务
    getOptions: (config, runtimeContext) => ({
        HappyService: runtimeContext?.services?.HappyService,
        MessageStore: runtimeContext?.services?.MessageStore
    })
}
```

## 开发参考

此模块可作为开发自定义模块的参考模板。关键点：

1. **导出 setup 函数**: `module.exports = { setupDemoModuleService }`
2. **继承 EventEmitter**: 支持事件发射
3. **实现标准接口**: init, setupRoutes, start, stop
4. **路由注册**: 在 setupRoutes 中使用 Express app 注册路由
5. **核心服务使用**: 通过 `options` 参数接收注入的核心服务

详细开发指南请参考模块介绍页面或项目文档。
