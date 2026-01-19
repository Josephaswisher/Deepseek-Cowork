#!/usr/bin/env node

/**
 * update_index.js - 更新记忆索引
 * 
 * 用法：
 *   node update_index.js
 * 
 * 功能：
 *   调用后端 API 重建索引，确保索引格式与保存记忆时一致
 * 
 * 注意：
 *   - 需要 DeepSeek Cowork 应用正在运行
 *   - 索引格式由后端 MemoryManager 统一管理
 */

const http = require('http');
const { getApiUrl } = require('./paths');

/**
 * 发送 HTTP POST 请求
 * @param {string} url 请求 URL
 * @param {Object} data 请求数据
 * @returns {Promise<Object>} 响应数据
 */
function httpPost(url, data = {}) {
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
  console.log('正在更新记忆索引...\n');
  
  try {
    const apiUrl = getApiUrl('/rebuild-index');
    console.log(`调用 API: ${apiUrl}`);
    
    const result = await httpPost(apiUrl);
    
    if (result.success) {
      console.log('\n✓ 索引更新成功！');
      console.log(`  活跃记忆：${result.memoryCount} 个`);
      console.log(`  索引大小：${result.indexTokens} tokens`);
    } else {
      console.error('\n✗ 更新失败:', result.error);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n✗ 更新失败:', error.message);
    
    if (error.message.includes('无法连接')) {
      console.error('\n提示：请确保 DeepSeek Cowork 应用正在运行');
      console.error('如果应用未运行，索引将在下次保存记忆时自动更新');
    }
    
    process.exit(1);
  }
}

// 导出供其他脚本调用
module.exports = { main };

// 如果直接运行此脚本
if (require.main === module) {
  main();
}
