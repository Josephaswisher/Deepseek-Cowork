/**
 * 本地配置示例
 * 
 * 使用方法：
 * 1. 复制此文件为 local.js
 * 2. 根据需要修改配置值
 * 3. local.js 不会被提交到版本控制
 */

module.exports = {
  // 服务器配置
  server: {
    host: 'localhost',
    port: 3333,
    wsPort: 8080
  },
  
  // 数据库配置
  database: {
    path: './data/browser_data.db',
    directory: './data'
  },
  
  // Happy AI 配置
  happy: {
    // 是否启用 AI 功能
    enabled: true,
    
    // happy-service 状态文件目录（绝对路径）
    // 例如: '/path/to/your/project/work_dir' 或 'C:/projects/my-project/work_dir'
    stateDir: null,
    
    // 状态文件名
    stateFileName: '.happy-sessions.json',
    
    // 默认 session 名称
    sessionName: 'main'
    
    // 注意：HAPPY_SECRET 建议通过环境变量设置，不要写在配置文件中
  }
};
