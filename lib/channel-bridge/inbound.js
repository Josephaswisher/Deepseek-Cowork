/**
 * Inbound - 入站处理
 * 
 * 统一的消息入站流程：
 * - 验证上下文
 * - 入队请求
 * - 触发处理
 */

/**
 * @typedef {import('./types').ChannelContext} ChannelContext
 * @typedef {import('./types').ChannelAdapter} ChannelAdapter
 * @typedef {import('./types').InboundResult} InboundResult
 */

/**
 * 必需的上下文字段
 */
const REQUIRED_FIELDS = ['channelId', 'messageId', 'senderId', 'content'];

/**
 * 验证上下文完整性
 * @param {ChannelContext} context - 消息上下文
 * @returns {{ valid: boolean, error?: string }} 验证结果
 */
function validateContext(context) {
    if (!context || typeof context !== 'object') {
        return { valid: false, error: 'Context is required' };
    }
    
    for (const field of REQUIRED_FIELDS) {
        if (!context[field]) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
    }
    
    // 验证内容不为空
    if (typeof context.content !== 'string' || context.content.trim() === '') {
        return { valid: false, error: 'Content cannot be empty' };
    }
    
    // 验证 chatType
    if (context.chatType && !['dm', 'group'].includes(context.chatType)) {
        return { valid: false, error: 'Invalid chatType, must be "dm" or "group"' };
    }
    
    return { valid: true };
}

/**
 * 规范化上下文
 * @param {ChannelContext} context - 原始上下文
 * @returns {ChannelContext} 规范化后的上下文
 */
function normalizeContext(context) {
    return {
        channelId: String(context.channelId).trim(),
        sessionKey: context.sessionKey || `${context.channelId}:${context.chatType || 'dm'}:${context.senderId}`,
        messageId: String(context.messageId),
        senderId: String(context.senderId),
        senderName: context.senderName || undefined,
        chatType: context.chatType || 'dm',
        content: String(context.content).trim(),
        replyToId: context.replyToId || context.messageId, // 默认回复原消息
        chatId: context.chatId || undefined,
        timestamp: context.timestamp || Date.now(),
        metadata: context.metadata || {}
    };
}

/**
 * 入站处理模块
 */
class Inbound {
    constructor() {
        /** @type {Object|null} */
        this._requestQueue = null;
        
        /** @type {Object|null} */
        this._registry = null;
        
        console.log('[Inbound] Created');
    }
    
    /**
     * 初始化
     * @param {Object} options - 配置选项
     * @param {Object} options.requestQueue - RequestQueue 实例
     * @param {Object} options.registry - Registry 实例
     */
    init(options) {
        this._requestQueue = options.requestQueue;
        this._registry = options.registry;
        console.log('[Inbound] Initialized');
    }
    
    /**
     * 处理入站消息
     * @param {ChannelContext} context - 消息上下文
     * @param {ChannelAdapter} adapter - 通道适配器
     * @returns {Promise<InboundResult>} 处理结果
     */
    async handleInbound(context, adapter) {
        // 1. 验证上下文
        const validation = validateContext(context);
        if (!validation.valid) {
            console.error(`[Inbound] Validation failed: ${validation.error}`);
            return {
                success: false,
                error: validation.error
            };
        }
        
        // 2. 验证适配器
        if (!adapter) {
            console.error('[Inbound] Adapter is required');
            return {
                success: false,
                error: 'Adapter is required'
            };
        }
        
        if (typeof adapter.sendText !== 'function' || typeof adapter.replyText !== 'function') {
            console.error('[Inbound] Invalid adapter: missing sendText or replyText');
            return {
                success: false,
                error: 'Invalid adapter'
            };
        }
        
        // 3. 规范化上下文
        const normalizedContext = normalizeContext(context);
        
        console.log(`[Inbound] Processing message from ${normalizedContext.channelId}:${normalizedContext.senderId}`);
        
        // 4. 检查队列是否可用
        if (!this._requestQueue) {
            console.error('[Inbound] Request queue not initialized');
            return {
                success: false,
                error: 'Request queue not available'
            };
        }
        
        // 5. 入队请求
        const result = this._requestQueue.enqueue(normalizedContext, adapter);
        
        if (!result.success) {
            console.error(`[Inbound] Failed to enqueue: ${result.error}`);
            
            // 通知用户队列已满
            if (result.error && result.error.includes('full')) {
                try {
                    await adapter.replyText(
                        normalizedContext.messageId,
                        '当前请求较多，请稍后再试。'
                    );
                } catch (e) {
                    console.error(`[Inbound] Failed to send busy message: ${e.message}`);
                }
            }
        }
        
        return result;
    }
    
    /**
     * 快捷方法：直接处理入站消息（自动从 registry 获取适配器）
     * @param {ChannelContext} context - 消息上下文
     * @returns {Promise<InboundResult>} 处理结果
     */
    async handle(context) {
        if (!this._registry) {
            return {
                success: false,
                error: 'Registry not initialized'
            };
        }
        
        const adapter = this._registry.getChannel(context.channelId);
        if (!adapter) {
            return {
                success: false,
                error: `Channel not registered: ${context.channelId}`
            };
        }
        
        return this.handleInbound(context, adapter);
    }
}

// 单例
const inbound = new Inbound();

module.exports = inbound;
module.exports.Inbound = Inbound;
module.exports.validateContext = validateContext;
module.exports.normalizeContext = normalizeContext;
