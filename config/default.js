/**
 * 默认配置
 * 
 * 此文件定义了 deepseek-cowork 的所有默认配置项
 * 可通过环境变量或 config/local.js 覆盖
 */

const path = require('path');

module.exports = {
  // 服务器配置
  server: {
    host: 'localhost',
    port: 3333,
    wsPort: 8080
  },
  
  // 数据库配置
  database: {
    // 数据库文件路径（相对于项目根目录）
    path: './data/browser_data.db',
    // 数据目录
    directory: './data'
  },
  
  // Happy AI 配置
  happy: {
    // 是否启用 Happy Service（daemon + session 管理）
    enabled: true,
    
    // happy-service 状态文件目录
    // 可以是绝对路径或相对路径
    // 如果为 null，将使用 database.directory/happy-state（默认 ./data/happy-state）
    stateDir: null,
    
    // 状态文件名
    stateFileName: '.happy-sessions.json',
    
    // 默认 session 名称
    sessionName: 'main',
    
    // 工作目录配置
    // 每个 workDir 会创建一个独立的 session
    // 格式: [{ name: 'session_name', path: '/path/to/workdir' }]
    workDirs: [{ name: 'main', path: '.' }],
    
    // Session 监控间隔（毫秒）
    monitorInterval: 30000,
    
    // 是否自动启动监控
    autoMonitor: true,
    
    // 日志级别: 'DEBUG', 'INFO', 'WARN', 'ERROR'
    logLevel: 'INFO',
    
    // Happy API Secret（建议使用环境变量 HAPPY_SECRET）
    secret: null
  },
  
  // 浏览器扩展 WebSocket 配置
  extensionWebSocket: {
    enabled: true,
    maxClients: 1
  },
  
  // 日志配置
  logging: {
    level: 'info',
    // 是否在控制台输出彩色日志
    colorize: true
  },
  
  // Explorer 文件浏览器配置
  explorer: {
    // 是否启用 Explorer 服务
    enabled: true,
    
    // 监控目录列表
    watchDirs: [
      {
        path: 'workspace',
        name: '工作目录',
        description: 'AI 工作空间'
      }
    ],
    
    // 排除模式（不监控的文件/目录）
    excludePatterns: [
      '**/node_modules/**',
      '**/.git/**',
      '**/.*',
      '**/*.tmp',
      '**/*.log'
    ],
    
    // 运行模式: 'internal-only' | 'webhook-only'
    mode: 'internal-only',
    
    // 日志级别
    logging: {
      level: 'INFO'
    }
  }
};
