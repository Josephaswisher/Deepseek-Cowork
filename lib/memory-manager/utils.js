/**
 * MemoryManager 工具函数（简化版）
 * 
 * 提供 token 估算、日期格式化等基础功能
 * 
 * 创建时间: 2026-01-17
 * 更新时间: 2026-01-18 - 简化，去掉索引相关函数
 */

const config = require('./config');

/**
 * 估算文本的 token 数量
 * 使用简化的字符计数法，适用于中英文混合文本
 * @param {string} text - 文本内容
 * @returns {number} 估算的 token 数
 */
function estimateTokens(text) {
    if (!text) return 0;
    
    // 简化估算：总字符数 / 平均每 token 字符数
    const tokens = Math.ceil(text.length / config.tokenEstimate.charsPerToken);
    
    // 应用缓冲系数
    return Math.ceil(tokens * config.tokenEstimate.bufferRatio);
}

/**
 * 格式化日期时间
 * @param {Date} date - 日期对象
 * @returns {string} 格式化的日期时间字符串
 */
function formatDateTime(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 生成记忆名称
 * 格式：mem-YYYYMMDD-HHMMSS
 * @returns {string} 记忆名称
 */
function generateMemoryName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `mem-${year}${month}${day}-${hours}${minutes}${seconds}`;
}

module.exports = {
    estimateTokens,
    formatDateTime,
    generateMemoryName
};
