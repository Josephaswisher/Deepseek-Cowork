#!/usr/bin/env node

/**
 * save_memory.js - 保存对话记忆
 * 
 * 用法：
 *   node save_memory.js [options]
 * 
 * 选项：
 *   --summary-file <路径>    从文件读取标题和摘要（推荐）
 *   --topic <主题>           指定记忆标题（可选，覆盖文件中的标题）
 *   --keywords <关键词>      指定关键词（逗号分隔）
 *   --summary <摘要>         直接指定摘要文本（需配合 --topic）
 *   --help                  显示帮助信息
 * 
 * 摘要文件格式：
 *   第一行：# 标题
 *   后续行：摘要正文
 * 
 * 功能：
 *   1. 读取当前 session 信息
 *   2. 读取标题和摘要（从文件解析或命令行参数）
 *   3. 调用 Memory API 保存对话
 *   4. 输出保存结果
 * 
 * 注意：
 *   - 需要 DeepSeek Cowork 应用正在运行
 *   - 需要已连接到 HappyClient session
 *   - 摘要文件第一行必须是标题（# 开头）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getApiUrl, readCurrentSession, ensureDataDir } = require('./paths');

/**
 * 解析命令行参数
 * @returns {Object} 解析后的参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    topic: null,
    keywords: null,
    summary: null,
    summaryFile: null,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--topic' && args[i + 1]) {
      options.topic = args[++i];
    } else if (arg === '--keywords' && args[i + 1]) {
      options.keywords = args[++i].split(',').map(k => k.trim());
    } else if (arg === '--summary' && args[i + 1]) {
      options.summary = args[++i];
    } else if (arg === '--summary-file' && args[i + 1]) {
      options.summaryFile = args[++i];
    }
  }
  
  return options;
}

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
保存对话记忆脚本

用法：
  node save_memory.js [options]

选项：
  --summary-file <路径>    从文件读取标题和摘要（推荐）
  --topic <主题>           指定记忆标题（可选，会覆盖文件中的标题）
  --keywords <关键词>      指定关键词，逗号分隔（可选，自动提取）
  --summary <摘要>         直接指定摘要文本（需配合 --topic 使用）
  --help, -h              显示此帮助信息

摘要文件格式（--summary-file）：
  第一行必须是标题，格式为 "# 标题内容"
  标题后面是摘要正文

  示例文件内容：
  ┌────────────────────────────────────
  │ # 项目重构讨论
  │ 
  │ 本次对话讨论了项目架构重构方案，
  │ 主要包括以下内容：
  │ - 数据库层优化
  │ - API 接口重设计
  │ - 前端组件拆分
  └────────────────────────────────────

示例：
  node save_memory.js --summary-file ./temp/summary.md
  node save_memory.js --topic "自定义标题" --summary-file ./temp/summary.md

推荐流程：
  1. 分析对话，撰写标题和摘要
  2. 将内容写入文件（如 .claude/data/conversation-memory/temp/summary.md）
  3. 使用 --summary-file 参数保存
  4. 保存成功后可删除临时文件

注意：
  - 需要 DeepSeek Cowork 应用正在运行
  - 需要已连接到 HappyClient session
  - 摘要文件第一行必须是标题（# 开头）
  - 只会保存上次保存后的新消息
`);
}

/**
 * 发送 HTTP POST 请求
 * @param {string} url 请求 URL
 * @param {Object} data 请求数据
 * @returns {Promise<Object>} 响应数据
 */
function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
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
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(result.error || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`解析响应失败: ${body}`));
        }
      });
    });
    
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error('无法连接到 DeepSeek Cowork 服务，请确保应用正在运行'));
      } else {
        reject(e);
      }
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * 主函数
 */
async function main() {
  const options = parseArgs();
  
  // 显示帮助
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  console.log('正在保存对话记忆...\n');
  
  // 1. 读取当前 session 信息
  const sessionInfo = readCurrentSession();
  
  if (!sessionInfo || !sessionInfo.sessionId) {
    console.error('错误：无法获取当前 session 信息');
    console.error('请确保：');
    console.error('  1. DeepSeek Cowork 应用正在运行');
    console.error('  2. 已连接到 HappyClient session');
    process.exit(1);
  }
  
  console.log(`当前 Session: ${sessionInfo.sessionId.substring(0, 8)}...`);
  if (sessionInfo.conversationId) {
    console.log(`当前对话: ${sessionInfo.conversationId}`);
  }
  
  // 2. 确保数据目录存在
  try {
    ensureDataDir();
  } catch (e) {
    // 忽略错误，API 会处理
  }
  
  // 3. 处理摘要内容（优先从文件读取）
  let summaryContent = options.summary;
  let topicFromFile = null;
  
  if (options.summaryFile) {
    // 从文件读取摘要
    const summaryFilePath = path.isAbsolute(options.summaryFile) 
      ? options.summaryFile 
      : path.resolve(process.cwd(), options.summaryFile);
    
    if (!fs.existsSync(summaryFilePath)) {
      console.error(`错误：摘要文件不存在: ${summaryFilePath}`);
      process.exit(1);
    }
    
    try {
      const fileContent = fs.readFileSync(summaryFilePath, 'utf8').trim();
      
      // 解析摘要文件格式：第一行是标题（# 标题），后面是摘要内容
      const lines = fileContent.split('\n');
      const firstLine = lines[0].trim();
      
      // 检查第一行是否是标题格式（# 开头）
      if (firstLine.startsWith('# ')) {
        topicFromFile = firstLine.substring(2).trim();
        // 摘要内容是标题之后的所有内容
        summaryContent = lines.slice(1).join('\n').trim();
        console.log(`已从文件读取摘要: ${summaryFilePath}`);
        console.log(`标题: ${topicFromFile}`);
        console.log(`摘要长度: ${summaryContent.length} 字符`);
      } else {
        console.error('错误：摘要文件格式不正确');
        console.error('文件第一行必须是标题，格式为: # 标题内容');
        console.error('示例：');
        console.error('  # 项目重构讨论');
        console.error('  ');
        console.error('  本次对话讨论了...');
        process.exit(1);
      }
    } catch (e) {
      console.error(`错误：读取摘要文件失败: ${e.message}`);
      process.exit(1);
    }
  }
  
  // 检查是否提供了摘要
  if (!summaryContent) {
    console.error('错误：必须提供摘要内容');
    console.error('请使用以下方式之一：');
    console.error('  --summary-file <路径>  从文件读取摘要（推荐）');
    console.error('  --summary <内容>       直接指定摘要文本（需配合 --topic）');
    console.error('\n摘要文件格式：');
    console.error('  # 标题');
    console.error('  ');
    console.error('  摘要正文内容...');
    console.error('\n使用 --help 查看更多信息');
    process.exit(1);
  }
  
  // 4. 构建请求数据
  const requestData = {
    sessionId: sessionInfo.sessionId,
    aiSummary: summaryContent
  };
  
  // 包含 conversationId（如果有）
  if (sessionInfo.conversationId) {
    requestData.conversationId = sessionInfo.conversationId;
  }
  
  // 标题优先级：命令行参数 > 文件中的标题
  if (options.topic) {
    requestData.topic = options.topic;
  } else if (topicFromFile) {
    requestData.topic = topicFromFile;
  }
  
  if (options.keywords) {
    requestData.keywords = options.keywords;
  }
  
  // 5. 调用 API 保存
  try {
    const apiUrl = getApiUrl('/save');
    console.log(`调用 API: ${apiUrl}`);
    
    const result = await httpPost(apiUrl, requestData);
    
    if (result.success) {
      console.log('\n✓ 记忆保存成功！');
      console.log(`  记忆名称: ${result.memoryName}`);
      console.log(`  主题: ${result.topic || '（自动生成）'}`);
      console.log(`  消息数: ${result.messageCount}`);
      if (result.conversationId) {
        console.log(`  对话ID: ${result.conversationId}`);
      }
      
      // 提示查看位置
      console.log('\n记忆文件已保存到:');
      console.log(`  .claude/data/conversation-memory/memories/active/${result.memoryName}/`);
    } else {
      console.error('\n✗ 保存失败:', result.error);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n✗ 保存失败:', error.message);
    
    if (error.message.includes('无法连接')) {
      console.error('\n提示：请确保 DeepSeek Cowork 应用正在运行');
    }
    
    process.exit(1);
  }
}

// 运行
main().catch(err => {
  console.error('未知错误:', err);
  process.exit(1);
});
