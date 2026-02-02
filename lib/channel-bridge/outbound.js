/**
 * Outbound - 出站投递
 * 
 * 统一的消息出站流程：
 * - 消息分块处理
 * - 调用适配器发送
 * - 错误处理和重试
 */

const { EventEmitter } = require('events');

/**
 * @typedef {import('./types').ChannelContext} ChannelContext
 * @typedef {import('./types').ChannelAdapter} ChannelAdapter
 * @typedef {import('./types').SendResult} SendResult
 */

/**
 * 默认分块限制（字符数）
 */
const DEFAULT_CHUNK_LIMIT = 4000;

/**
 * 按长度分割消息
 * @param {string} text - 原始文本
 * @param {number} limit - 每块最大长度
 * @returns {string[]} 分割后的文本数组
 */
function splitByLength(text, limit) {
    if (!text || text.length <= limit) {
        return [text || ''];
    }
    
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
        let end = start + limit;
        
        // 尝试在自然断点处分割
        if (end < text.length) {
            // 优先在换行符处断开
            const lastNewline = text.lastIndexOf('\n', end);
            if (lastNewline > start + limit / 2) {
                end = lastNewline + 1;
            } else {
                // 其次在空格处断开
                const lastSpace = text.lastIndexOf(' ', end);
                if (lastSpace > start + limit / 2) {
                    end = lastSpace + 1;
                }
            }
        }
        
        chunks.push(text.slice(start, end).trim());
        start = end;
        
        // 跳过开头的空白
        while (start < text.length && /\s/.test(text[start])) {
            start++;
        }
    }
    
    return chunks.filter(chunk => chunk.length > 0);
}

/**
 * 按段落分割消息
 * @param {string} text - 原始文本
 * @param {number} limit - 每块最大长度
 * @returns {string[]} 分割后的文本数组
 */
function splitByParagraph(text, limit) {
    if (!text || text.length <= limit) {
        return [text || ''];
    }
    
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
        // 单个段落超长，需要进一步分割
        if (paragraph.length > limit) {
            if (currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = '';
            }
            // 按长度分割超长段落
            const subChunks = splitByLength(paragraph, limit);
            chunks.push(...subChunks);
            continue;
        }
        
        const separator = currentChunk ? '\n\n' : '';
        if ((currentChunk + separator + paragraph).length > limit) {
            // 当前块满了，保存并开始新块
            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = paragraph;
        } else {
            currentChunk = currentChunk + separator + paragraph;
        }
    }
    
    // 保存最后一块
    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 0);
}

/**
 * 出站投递模块
 */
class Outbound extends EventEmitter {
    /**
     * @param {Object} options - 配置选项
     * @param {number} [options.chunkLimit] - 分块限制
     * @param {'length' | 'paragraph'} [options.chunkMode] - 分块模式
     */
    constructor(options = {}) {
        super();
        
        /** @type {number} */
        this._chunkLimit = options.chunkLimit || DEFAULT_CHUNK_LIMIT;
        
        /** @type {'length' | 'paragraph'} */
        this._chunkMode = options.chunkMode || 'paragraph';
        
        console.log('[Outbound] Created with chunkLimit:', this._chunkLimit);
    }
    
    /**
     * 分割消息
     * @param {string} text - 原始文本
     * @param {number} [limit] - 分块限制
     * @returns {string[]} 分割后的文本数组
     */
    splitMessage(text, limit) {
        const chunkLimit = limit || this._chunkLimit;
        
        if (this._chunkMode === 'paragraph') {
            return splitByParagraph(text, chunkLimit);
        }
        return splitByLength(text, chunkLimit);
    }
    
    /**
     * 投递响应到通道
     * @param {ChannelContext} context - 消息上下文
     * @param {ChannelAdapter} adapter - 通道适配器
     * @param {string} responseText - 响应文本
     * @returns {Promise<{ success: boolean, chunks: number, results: SendResult[], errors: string[] }>}
     */
    async deliver(context, adapter, responseText) {
        if (!context) {
            throw new Error('Context is required');
        }
        
        if (!adapter) {
            throw new Error('Adapter is required');
        }
        
        if (!responseText || typeof responseText !== 'string') {
            console.warn('[Outbound] Empty response, skipping delivery');
            return { success: true, chunks: 0, results: [], errors: [] };
        }
        
        // 分割消息
        const chunks = this.splitMessage(responseText);
        
        console.log(`[Outbound] Delivering ${chunks.length} chunk(s) to ${context.channelId}:${context.senderId}`);
        
        const results = [];
        const errors = [];
        
        // 逐个发送
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            try {
                let result;
                
                // 第一条消息使用回复，后续消息直接发送
                if (i === 0 && context.replyToId) {
                    result = await adapter.replyText(context.replyToId, chunk);
                } else {
                    // 对于后续消息，发送到发送者（私聊）或群聊
                    const target = context.chatType === 'group' && context.chatId 
                        ? context.chatId 
                        : context.senderId;
                    result = await adapter.sendText(target, chunk);
                }
                
                results.push(result);
                
                if (!result.success) {
                    errors.push(result.error || `Failed to send chunk ${i + 1}`);
                }
                
                console.log(`[Outbound] Chunk ${i + 1}/${chunks.length} sent, success: ${result.success}`);
                
            } catch (error) {
                console.error(`[Outbound] Error sending chunk ${i + 1}: ${error.message}`);
                errors.push(error.message);
                results.push({ success: false, error: error.message });
            }
        }
        
        const success = errors.length === 0;
        
        this.emit('delivery:complete', {
            context,
            success,
            chunks: chunks.length,
            results,
            errors
        });
        
        return {
            success,
            chunks: chunks.length,
            results,
            errors
        };
    }
    
    /**
     * 发送简单文本消息（不分块）
     * @param {ChannelAdapter} adapter - 通道适配器
     * @param {string} to - 接收者 ID
     * @param {string} text - 文本内容
     * @returns {Promise<SendResult>}
     */
    async sendText(adapter, to, text) {
        if (!adapter || !adapter.sendText) {
            throw new Error('Invalid adapter');
        }
        
        return await adapter.sendText(to, text);
    }
    
    /**
     * 回复消息（不分块）
     * @param {ChannelAdapter} adapter - 通道适配器
     * @param {string} messageId - 要回复的消息 ID
     * @param {string} text - 文本内容
     * @returns {Promise<SendResult>}
     */
    async replyText(adapter, messageId, text) {
        if (!adapter || !adapter.replyText) {
            throw new Error('Invalid adapter');
        }
        
        return await adapter.replyText(messageId, text);
    }
    
    /**
     * 更新配置
     * @param {Object} options - 配置选项
     */
    updateConfig(options) {
        if (options.chunkLimit) {
            this._chunkLimit = options.chunkLimit;
        }
        if (options.chunkMode) {
            this._chunkMode = options.chunkMode;
        }
    }
    
    /**
     * 获取配置
     * @returns {{ chunkLimit: number, chunkMode: string }}
     */
    getConfig() {
        return {
            chunkLimit: this._chunkLimit,
            chunkMode: this._chunkMode
        };
    }
}

// 单例
const outbound = new Outbound();

module.exports = outbound;
module.exports.Outbound = Outbound;
module.exports.splitByLength = splitByLength;
module.exports.splitByParagraph = splitByParagraph;
