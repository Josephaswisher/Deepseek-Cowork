#!/usr/bin/env node

/**
 * paths.js - 路径解析工具模块
 * 
 * 提供统一的路径解析功能，将数据目录从技能目录分离到 .claude/data/ 下
 * 
 * 目录结构：
 *   workdir/
 *   ├── .claude/
 *   │   ├── skills/conversation-memory/  # 技能代码
 *   │   │   └── scripts/                 # 脚本目录（本模块所在位置）
 *   │   └── data/conversation-memory/    # 数据目录
 *   │       └── memories/                # 记忆存储
 *   │           ├── index.md
 *   │           ├── active/
 *   │           └── archive/
 */

const fs = require('fs');
const path = require('path');

// 技能名称
const SKILL_NAME = 'conversation-memory';

/**
 * 向上查找 .claude 目录
 * @param {string} startDir - 起始目录，默认为当前脚本目录
 * @returns {string|null} .claude 目录的路径，未找到返回 null
 */
function findClaudeRoot(startDir = __dirname) {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;
  
  while (currentDir !== root) {
    const claudeDir = path.join(currentDir, '.claude');
    if (fs.existsSync(claudeDir) && fs.statSync(claudeDir).isDirectory()) {
      return claudeDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  return null;
}

/**
 * 获取工作目录根路径
 * @returns {string} 工作目录路径
 * @throws {Error} 如果找不到 .claude 目录
 */
function getWorkDir() {
  const claudeRoot = findClaudeRoot();
  if (!claudeRoot) {
    throw new Error('无法找到 .claude 目录，请确保在正确的工作目录中运行');
  }
  return path.dirname(claudeRoot);
}

/**
 * 获取技能目录路径
 * @returns {string} 技能目录路径
 */
function getSkillDir() {
  const claudeRoot = findClaudeRoot();
  if (!claudeRoot) {
    throw new Error('无法找到 .claude 目录');
  }
  return path.join(claudeRoot, 'skills', SKILL_NAME);
}

/**
 * 获取数据目录路径
 * @returns {string} 数据目录路径 (.claude/data/conversation-memory/)
 */
function getDataDir() {
  const claudeRoot = findClaudeRoot();
  if (!claudeRoot) {
    throw new Error('无法找到 .claude 目录');
  }
  return path.join(claudeRoot, 'data', SKILL_NAME);
}

/**
 * 获取记忆目录路径
 * @returns {string} 记忆目录路径 (.claude/data/conversation-memory/memories/)
 */
function getMemoriesDir() {
  return path.join(getDataDir(), 'memories');
}

/**
 * 获取活跃记忆目录路径
 * @returns {string} 活跃记忆目录路径
 */
function getActiveDir() {
  return path.join(getMemoriesDir(), 'active');
}

/**
 * 获取归档记忆目录路径
 * @returns {string} 归档记忆目录路径
 */
function getArchiveDir() {
  return path.join(getMemoriesDir(), 'archive');
}

/**
 * 获取索引文件路径
 * @returns {string} 索引文件路径
 */
function getIndexFile() {
  return path.join(getMemoriesDir(), 'index.md');
}

/**
 * 获取 SKILL.md 文件路径
 * @returns {string} SKILL.md 文件路径
 */
function getSkillFile() {
  return path.join(getSkillDir(), 'SKILL.md');
}

/**
 * 确保数据目录存在
 * 创建完整的目录结构：memories/active/, memories/archive/
 */
function ensureDataDir() {
  const dirs = [
    getMemoriesDir(),
    getActiveDir(),
    getArchiveDir()
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  
  // 确保 index.md 存在
  const indexFile = getIndexFile();
  if (!fs.existsSync(indexFile)) {
    const initialContent = `# 活跃记忆索引

> 此文件由脚本自动更新，记录所有活跃记忆的摘要信息。

## 索引表

<!-- INDEX_START -->
| 记忆ID | 主题 | 关键词 | 时间 |
|--------|------|--------|------|
| （暂无活跃记忆） | - | - | - |
<!-- INDEX_END -->

## 关键词汇总

<!-- KEYWORDS_START -->
（暂无有效关键词）
<!-- KEYWORDS_END -->

## 使用说明

1. 根据索引表找到相关记忆
2. 读取对应记忆的 \`active/{记忆ID}/summary.md\` 了解详情
3. 如需原始对话，读取 \`active/{记忆ID}/conversation.md\`
`;
    fs.writeFileSync(indexFile, initialContent, 'utf8');
  }
}

/**
 * 获取配置对象（兼容现有脚本的 CONFIG 结构）
 * @returns {Object} 配置对象
 */
function getConfig() {
  return {
    skillDir: getSkillDir(),
    memoriesDir: getMemoriesDir(),
    skillFile: getSkillFile(),
    indexFile: getIndexFile(),
    activeDir: 'active',
    archiveDir: 'archive',
    messagesFile: 'messages.json',
    maxActiveMemories: 20,
    archiveAfterDays: 14
  };
}

// ============ API 配置 ============

/**
 * Memory API 基础配置
 */
const API_CONFIG = {
  host: 'localhost',
  port: 3333,
  basePath: '/api/memory'
};

/**
 * 获取 API 基础 URL
 * @returns {string} API 基础 URL，如 http://localhost:3333
 */
function getApiBaseUrl() {
  return `http://${API_CONFIG.host}:${API_CONFIG.port}`;
}

/**
 * 获取 Memory API 完整 URL
 * @param {string} endpoint API 端点，如 '/save'
 * @returns {string} 完整 URL
 */
function getApiUrl(endpoint = '') {
  return `${getApiBaseUrl()}${API_CONFIG.basePath}${endpoint}`;
}

// ============ Session 文件配置 ============

/**
 * 获取 userData 目录路径
 * 在 Windows 上通常是 %APPDATA%/deepseek-cowork
 * @returns {string|null} userData 目录路径
 */
function getUserDataDir() {
  // 尝试从环境变量获取
  const appData = process.env.APPDATA || process.env.HOME;
  if (!appData) {
    return null;
  }
  
  // deepseek-cowork 的 userData 目录
  const userDataDir = path.join(appData, 'deepseek-cowork');
  
  if (fs.existsSync(userDataDir)) {
    return userDataDir;
  }
  
  return null;
}

/**
 * 获取当前 session 文件路径
 * @returns {string|null} current-session.json 文件路径
 */
function getCurrentSessionFile() {
  const userDataDir = getUserDataDir();
  if (!userDataDir) {
    return null;
  }
  return path.join(userDataDir, 'current-session.json');
}

/**
 * 读取当前 session 信息
 * @returns {Object|null} { sessionId, conversationId, updatedAt } 或 null
 * 
 * conversationId 用于标识一轮对话（从开始或 /clear 到下一个 /clear）
 * 同一轮对话中保存的多个记忆片段会共享相同的 conversationId
 */
function readCurrentSession() {
  const sessionFile = getCurrentSessionFile();
  if (!sessionFile) {
    return null;
  }
  
  try {
    if (fs.existsSync(sessionFile)) {
      const content = fs.readFileSync(sessionFile, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`读取 session 文件失败: ${error.message}`);
  }
  
  return null;
}

module.exports = {
  SKILL_NAME,
  findClaudeRoot,
  getWorkDir,
  getSkillDir,
  getDataDir,
  getMemoriesDir,
  getActiveDir,
  getArchiveDir,
  getIndexFile,
  getSkillFile,
  ensureDataDir,
  getConfig,
  // API 相关
  API_CONFIG,
  getApiBaseUrl,
  getApiUrl,
  // Session 相关
  getUserDataDir,
  getCurrentSessionFile,
  readCurrentSession
};
