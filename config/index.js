/**
 * 配置加载器
 * 
 * 配置优先级（从高到低）：
 * 1. 环境变量
 * 2. config/local.js（用户自定义配置，不纳入版本控制）
 * 3. config/default.js（默认配置）
 */

const path = require('path');
const fs = require('fs');

// 加载默认配置
const defaultConfig = require('./default');

/**
 * 深度合并对象
 * @param {Object} target 目标对象
 * @param {Object} source 源对象
 * @returns {Object} 合并后的对象
 */
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  
  return result;
}

/**
 * 从环境变量加载配置
 * @returns {Object} 环境变量配置
 */
function loadEnvConfig() {
  const envConfig = {};
  
  // 服务器配置
  if (process.env.BCM_HOST) {
    envConfig.server = envConfig.server || {};
    envConfig.server.host = process.env.BCM_HOST;
  }
  if (process.env.BCM_PORT) {
    envConfig.server = envConfig.server || {};
    envConfig.server.port = parseInt(process.env.BCM_PORT, 10);
  }
  if (process.env.BCM_WS_PORT) {
    envConfig.server = envConfig.server || {};
    envConfig.server.wsPort = parseInt(process.env.BCM_WS_PORT, 10);
  }
  
  // 数据库配置
  if (process.env.BCM_DATABASE_PATH) {
    envConfig.database = envConfig.database || {};
    envConfig.database.path = process.env.BCM_DATABASE_PATH;
  }
  
  // Happy AI 配置
  if (process.env.HAPPY_STATE_DIR) {
    envConfig.happy = envConfig.happy || {};
    envConfig.happy.stateDir = process.env.HAPPY_STATE_DIR;
  }
  if (process.env.HAPPY_SESSION_NAME) {
    envConfig.happy = envConfig.happy || {};
    envConfig.happy.sessionName = process.env.HAPPY_SESSION_NAME;
  }
  if (process.env.HAPPY_SECRET) {
    envConfig.happy = envConfig.happy || {};
    envConfig.happy.secret = process.env.HAPPY_SECRET;
  }
  if (process.env.HAPPY_ENABLED !== undefined) {
    envConfig.happy = envConfig.happy || {};
    envConfig.happy.enabled = process.env.HAPPY_ENABLED === 'true';
  }
  
  // 日志配置
  if (process.env.BCM_LOG_LEVEL) {
    envConfig.logging = envConfig.logging || {};
    envConfig.logging.level = process.env.BCM_LOG_LEVEL;
  }
  
  return envConfig;
}

/**
 * 加载本地配置文件
 * @returns {Object} 本地配置
 */
function loadLocalConfig() {
  const localConfigPath = path.join(__dirname, 'local.js');
  
  if (fs.existsSync(localConfigPath)) {
    try {
      return require(localConfigPath);
    } catch (err) {
      console.warn(`Warning: Failed to load local config: ${err.message}`);
      return {};
    }
  }
  
  return {};
}

/**
 * 解析配置中的路径
 * @param {Object} config 配置对象
 * @returns {Object} 解析后的配置
 */
function resolvePaths(config) {
  const projectRoot = path.resolve(__dirname, '..');
  
  // 解析数据库路径
  if (config.database?.path && !path.isAbsolute(config.database.path)) {
    config.database.path = path.resolve(projectRoot, config.database.path);
  }
  if (config.database?.directory && !path.isAbsolute(config.database.directory)) {
    config.database.directory = path.resolve(projectRoot, config.database.directory);
  }
  
  return config;
}

// 合并配置
let config = deepMerge(defaultConfig, loadLocalConfig());
config = deepMerge(config, loadEnvConfig());
config = resolvePaths(config);

// 导出配置
module.exports = config;

// 导出工具函数
module.exports.deepMerge = deepMerge;
module.exports.loadEnvConfig = loadEnvConfig;
module.exports.loadLocalConfig = loadLocalConfig;

// 获取项目根目录
module.exports.getProjectRoot = () => path.resolve(__dirname, '..');
