#!/usr/bin/env node

/**
 * restore_memory.js - 恢复历史对话
 * 
 * 用法：
 *   node restore_memory.js --list                    # 列出可恢复的活跃记忆
 *   node restore_memory.js --list-all                # 列出所有可恢复的记忆（包含归档）
 *   node restore_memory.js <memory-id>               # 恢复指定记忆，输出 JSON
 *   node restore_memory.js --conversation <conv-id>  # 恢复完整对话（合并所有片段）
 *   node restore_memory.js --help                    # 显示帮助
 * 
 * 功能：
 *   1. 列出所有包含 messages.json 的记忆（可恢复）
 *   2. 读取指定记忆的 messages.json，输出供系统恢复
 *   3. 恢复完整对话：合并同一 conversationId 的所有记忆片段
 * 
 * 输出格式（JSON）：
 *   单个记忆：
 *   {
 *     "success": true,
 *     "memoryId": "mem-20260118-143000",
 *     "topic": "讨论主题...",
 *     "messages": [{ "role": "user", "text": "...", "timestamp": "..." }],
 *     "isArchived": false
 *   }
 *   
 *   完整对话：
 *   {
 *     "success": true,
 *     "conversationId": "conv-20260118-160000",
 *     "memories": [{ "memoryId": "...", "topic": "...", "messageCount": 5 }],
 *     "messages": [...],
 *     "totalCount": 8
 *   }
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { getConfig, ensureDataDir, getApiUrl } = require('./paths');

// 配置（从 paths.js 获取）
const CONFIG = getConfig();

/**
 * 从 summary.md 中提取主题
 */
function extractTopic(summaryPath) {
  if (!fs.existsSync(summaryPath)) {
    return '未知主题';
  }
  
  try {
    const content = fs.readFileSync(summaryPath, 'utf8');
    const titleMatch = content.match(/^# 对话记忆：(.+)$/m);
    return titleMatch ? titleMatch[1].trim() : '未知主题';
  } catch (e) {
    return '未知主题';
  }
}

/**
 * 从记忆 ID 提取时间戳
 */
function extractTimestamp(memoryId) {
  const match = memoryId.match(/mem-(\d{8})-(\d{6})/);
  if (match) {
    const dateStr = match[1];
    const timeStr = match[2];
    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
  }
  return '';
}

/**
 * 获取单个记忆的信息
 */
function getMemoryInfo(memoryDir, isArchived) {
  const id = path.basename(memoryDir);
  const messagesPath = path.join(memoryDir, CONFIG.messagesFile);
  const summaryPath = path.join(memoryDir, 'summary.md');
  
  // 检查是否有 messages.json（支持恢复）
  const canRestore = fs.existsSync(messagesPath);
  
  let messageCount = 0;
  let conversationId = null;
  
  if (canRestore) {
    try {
      const data = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
      
      // 支持两种格式：
      // 新格式: { meta: {...}, messages: [...] }
      // 旧格式: [...]（直接是消息数组）
      if (Array.isArray(data)) {
        messageCount = data.length;
      } else if (data.messages && Array.isArray(data.messages)) {
        messageCount = data.messages.length;
        conversationId = data.meta?.conversationId || null;
      }
    } catch (e) {
      // 忽略解析错误
    }
  }
  
  return {
    id,
    topic: extractTopic(summaryPath),
    timestamp: extractTimestamp(id),
    messageCount,
    conversationId,
    isArchived,
    canRestore
  };
}

/**
 * 获取指定目录下的所有记忆
 */
function getMemoriesFromDir(dir, isArchived) {
  const fullDir = path.join(CONFIG.memoriesDir, dir);
  
  if (!fs.existsSync(fullDir)) {
    return [];
  }
  
  return fs.readdirSync(fullDir)
    .filter(name => name.startsWith('mem-'))
    .map(name => getMemoryInfo(path.join(fullDir, name), isArchived))
    .sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * 列出可恢复的记忆
 */
function listMemories(includeArchived = false) {
  ensureDataDir();
  
  const activeMemories = getMemoriesFromDir(CONFIG.activeDir, false);
  const archiveMemories = includeArchived ? getMemoriesFromDir(CONFIG.archiveDir, true) : [];
  
  const allMemories = [...activeMemories, ...archiveMemories];
  const restorableMemories = allMemories.filter(m => m.canRestore);
  
  if (restorableMemories.length === 0) {
    console.log('没有可恢复的记忆（需要包含 messages.json 文件）');
    console.log('');
    console.log('提示：只有新保存的记忆才包含 messages.json，旧记忆不支持恢复。');
    return;
  }
  
  console.log(`可恢复的记忆列表 (共 ${restorableMemories.length} 个)：\n`);
  
  // 按 conversationId 分组统计
  const convGroups = {};
  restorableMemories.forEach(mem => {
    if (mem.conversationId) {
      if (!convGroups[mem.conversationId]) {
        convGroups[mem.conversationId] = [];
      }
      convGroups[mem.conversationId].push(mem.id);
    }
  });
  
  restorableMemories.forEach((mem, index) => {
    const locationLabel = mem.isArchived ? '[归档]' : '[活跃]';
    console.log(`${index + 1}. ${locationLabel} ${mem.id}`);
    console.log(`   主题：${mem.topic}`);
    console.log(`   消息数：${mem.messageCount} 条`);
    if (mem.conversationId) {
      const groupCount = convGroups[mem.conversationId]?.length || 1;
      const groupLabel = groupCount > 1 ? ` (共 ${groupCount} 个片段)` : '';
      console.log(`   对话ID：${mem.conversationId}${groupLabel}`);
    }
    console.log('');
  });
  
  // 显示不可恢复的记忆数量
  const notRestorableCount = allMemories.length - restorableMemories.length;
  if (notRestorableCount > 0) {
    console.log(`另有 ${notRestorableCount} 个记忆不支持恢复（缺少 messages.json）`);
  }
}

/**
 * 恢复指定记忆
 */
function restoreMemory(memoryId) {
  ensureDataDir();
  
  if (!memoryId) {
    outputError('Memory ID is required');
    return;
  }
  
  // 先在活跃记忆中查找
  let memoryDir = path.join(CONFIG.memoriesDir, CONFIG.activeDir, memoryId);
  let isArchived = false;
  
  if (!fs.existsSync(memoryDir)) {
    // 在归档记忆中查找
    memoryDir = path.join(CONFIG.memoriesDir, CONFIG.archiveDir, memoryId);
    isArchived = true;
    
    if (!fs.existsSync(memoryDir)) {
      outputError(`Memory not found: ${memoryId}`);
      return;
    }
  }
  
  const messagesPath = path.join(memoryDir, CONFIG.messagesFile);
  
  // 检查是否有 messages.json
  if (!fs.existsSync(messagesPath)) {
    outputError('This memory does not have messages.json (saved before this feature was added)');
    return;
  }
  
  try {
    const content = fs.readFileSync(messagesPath, 'utf8');
    const data = JSON.parse(content);
    
    // 支持两种格式
    let messages;
    let conversationId = null;
    
    if (Array.isArray(data)) {
      messages = data;
    } else if (data.messages && Array.isArray(data.messages)) {
      messages = data.messages;
      conversationId = data.meta?.conversationId || null;
    } else {
      outputError('Invalid messages format');
      return;
    }
    
    // 获取主题
    const summaryPath = path.join(memoryDir, 'summary.md');
    const topic = extractTopic(summaryPath);
    
    // 输出 JSON 结果
    const result = {
      success: true,
      memoryId,
      topic,
      messages,
      conversationId,
      isArchived
    };
    
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    outputError(error.message);
  }
}

/**
 * 发送 HTTP GET 请求
 * @param {string} url 请求 URL
 * @returns {Promise<Object>} 响应数据
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      timeout: 30000
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve(result);
        } catch (e) {
          reject(new Error(`解析响应失败: ${body}`));
        }
      });
    });
    
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error('API_UNAVAILABLE'));
      } else {
        reject(e);
      }
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    
    req.end();
  });
}

/**
 * 本地方式恢复完整对话（不依赖 API）
 * @param {string} conversationId 对话ID
 */
function restoreConversationLocal(conversationId) {
  ensureDataDir();
  
  const allMemories = [
    ...getMemoriesFromDir(CONFIG.activeDir, false),
    ...getMemoriesFromDir(CONFIG.archiveDir, true)
  ];
  
  // 过滤出匹配 conversationId 的记忆
  const matchingMemories = allMemories.filter(m => m.conversationId === conversationId && m.canRestore);
  
  if (matchingMemories.length === 0) {
    return { success: false, error: `No memories found for conversation: ${conversationId}` };
  }
  
  // 按时间顺序排序（旧的在前）
  matchingMemories.sort((a, b) => a.id.localeCompare(b.id));
  
  // 合并所有消息
  const allMessages = [];
  const memoryDetails = [];
  
  for (const mem of matchingMemories) {
    const memoryDir = mem.isArchived 
      ? path.join(CONFIG.memoriesDir, CONFIG.archiveDir, mem.id)
      : path.join(CONFIG.memoriesDir, CONFIG.activeDir, mem.id);
    
    const messagesPath = path.join(memoryDir, CONFIG.messagesFile);
    
    try {
      const data = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
      
      let messages;
      if (Array.isArray(data)) {
        messages = data;
      } else if (data.messages && Array.isArray(data.messages)) {
        messages = data.messages;
      } else {
        continue;
      }
      
      allMessages.push(...messages);
      memoryDetails.push({
        memoryId: mem.id,
        topic: mem.topic,
        messageCount: messages.length,
        isArchived: mem.isArchived
      });
    } catch (e) {
      // 忽略读取错误
    }
  }
  
  return {
    success: true,
    conversationId,
    memories: memoryDetails,
    messages: allMessages,
    totalCount: allMessages.length
  };
}

/**
 * 恢复完整对话（合并所有片段）
 * @param {string} conversationId 对话ID
 */
async function restoreConversation(conversationId) {
  if (!conversationId) {
    outputError('Conversation ID is required');
    return;
  }
  
  // 尝试通过 API 获取
  try {
    const apiUrl = getApiUrl(`/conversation/${conversationId}/messages`);
    const result = await httpGet(apiUrl);
    
    if (result.success) {
      console.log(JSON.stringify(result, null, 2));
      return;
    } else {
      // API 返回错误，尝试本地方式
      const localResult = restoreConversationLocal(conversationId);
      console.log(JSON.stringify(localResult, null, 2));
    }
  } catch (error) {
    if (error.message === 'API_UNAVAILABLE') {
      // API 不可用，使用本地方式
      const localResult = restoreConversationLocal(conversationId);
      console.log(JSON.stringify(localResult, null, 2));
    } else {
      outputError(error.message);
    }
  }
}

/**
 * 输出错误 JSON
 */
function outputError(message) {
  const result = {
    success: false,
    error: message
  };
  console.log(JSON.stringify(result, null, 2));
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log('restore_memory.js - 恢复历史对话');
  console.log('');
  console.log('用法：');
  console.log('  node restore_memory.js --list                    列出可恢复的活跃记忆');
  console.log('  node restore_memory.js --list-all                列出所有可恢复的记忆（包含归档）');
  console.log('  node restore_memory.js <memory-id>               恢复指定记忆片段，输出 JSON');
  console.log('  node restore_memory.js --conversation <conv-id>  恢复完整对话（合并所有片段）');
  console.log('  node restore_memory.js --help                    显示帮助');
  console.log('');
  console.log('示例：');
  console.log('  node restore_memory.js --list');
  console.log('  node restore_memory.js mem-20260118-143000');
  console.log('  node restore_memory.js --conversation conv-20260118-160000');
  console.log('');
  console.log('说明：');
  console.log('  同一轮对话（从开始到 /clear）可能被多次保存为多个记忆片段，');
  console.log('  这些片段共享相同的 conversationId。使用 --conversation 选项');
  console.log('  可以合并恢复同一轮对话的所有片段。');
  console.log('');
  console.log('注意：');
  console.log('  只有包含 messages.json 的记忆才能恢复。');
  console.log('  旧版本保存的记忆（没有 messages.json）无法恢复。');
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    showHelp();
    return;
  }
  
  if (args[0] === '--list') {
    listMemories(false);
    return;
  }
  
  if (args[0] === '--list-all') {
    listMemories(true);
    return;
  }
  
  if (args[0] === '--conversation' || args[0] === '-c') {
    if (!args[1]) {
      outputError('Conversation ID is required. Usage: --conversation <conv-id>');
      return;
    }
    await restoreConversation(args[1]);
    return;
  }
  
  // 恢复指定记忆
  restoreMemory(args[0]);
}

// 导出供其他模块调用
module.exports = { 
  listMemories, 
  restoreMemory,
  restoreConversation,
  restoreConversationLocal,
  getMemoryInfo,
  extractTopic,
  extractTimestamp
};

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(err => {
    console.error('未知错误:', err);
    process.exit(1);
  });
}
