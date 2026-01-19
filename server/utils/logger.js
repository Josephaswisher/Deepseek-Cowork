/**
 * DeepSeek Cowork Server 统一日志工具
 * 为所有日志输出添加时间戳
 */

/**
 * 格式化时间戳
 * @returns {string} 格式化的时间字符串 (YYYY-MM-DD HH:mm:ss.SSS)
 */
function formatTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * 创建带时间戳的日志函数
 */
const logger = {
    /**
     * 信息日志
     */
    info: (message, ...args) => {
        const timestamp = formatTimestamp();
        console.log(`[${timestamp}] [INFO] ${message}`, ...args);
    },

    /**
     * 警告日志
     */
    warn: (message, ...args) => {
        const timestamp = formatTimestamp();
        console.warn(`[${timestamp}] [WARN] ${message}`, ...args);
    },

    /**
     * 错误日志
     */
    error: (message, ...args) => {
        const timestamp = formatTimestamp();
        console.error(`[${timestamp}] [ERROR] ${message}`, ...args);
    },

    /**
     * 调试日志
     */
    debug: (message, ...args) => {
        const timestamp = formatTimestamp();
        console.log(`[${timestamp}] [DEBUG] ${message}`, ...args);
    },

    /**
     * 普通日志（兼容 console.log）
     */
    log: (message, ...args) => {
        const timestamp = formatTimestamp();
        console.log(`[${timestamp}] ${message}`, ...args);
    },

    /**
     * 格式化时间戳方法（供其他模块使用）
     */
    formatTimestamp: formatTimestamp
};

module.exports = logger;
