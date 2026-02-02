/**
 * Channel Bridge - 通道桥接层
 * 
 * 作为外部通道与 HappyService AI 核心之间的统一中介
 * 
 * 主要功能：
 * - 通道注册管理
 * - 请求队列（串行处理）
 * - AI 适配（响应分发）
 * - 入站/出站处理
 * 
 * 使用方式：
 * ```javascript
 * const bridge = require('../lib/channel-bridge');
 * 
 * // 初始化（在服务启动时调用）
 * bridge.init({ happyService: HappyService });
 * 
 * // 注册通道
 * bridge.registerChannel('feishu', feishuAdapter);
 * 
 * // 处理入站消息
 * await bridge.handleInbound(context, adapter);
 * ```
 */

const registry = require('./registry');
const requestQueue = require('./request-queue');
const aiAdapter = require('./ai-adapter');
const inbound = require('./inbound');
const outbound = require('./outbound');

/**
 * @typedef {import('./types').ChannelContext} ChannelContext
 * @typedef {import('./types').ChannelAdapter} ChannelAdapter
 * @typedef {import('./types').BridgeConfig} BridgeConfig
 * @typedef {import('./types').BridgeStatus} BridgeStatus
 * @typedef {import('./types').InboundResult} InboundResult
 */

/**
 * Bridge 初始化状态
 */
let _initialized = false;

/**
 * HappyService 实例引用
 */
let _happyService = null;

/**
 * 初始化 Channel Bridge
 * @param {Object} options - 配置选项
 * @param {Object} options.happyService - HappyService 实例
 * @param {BridgeConfig} [options.config] - Bridge 配置
 */
function init(options = {}) {
    if (_initialized) {
        console.warn('[ChannelBridge] Already initialized');
        return;
    }
    
    const { happyService, config = {} } = options;
    
    if (!happyService) {
        console.error('[ChannelBridge] HappyService is required');
        throw new Error('HappyService is required for initialization');
    }
    
    _happyService = happyService;
    
    // 配置请求队列
    if (config.requestTimeoutMs) {
        // RequestQueue 在构造时配置，这里暂不支持动态更新
        console.log('[ChannelBridge] Request timeout configured:', config.requestTimeoutMs);
    }
    
    // 配置出站
    if (config.messageChunkLimit) {
        outbound.updateConfig({ chunkLimit: config.messageChunkLimit });
    }
    
    // 初始化入站处理
    inbound.init({
        requestQueue,
        registry
    });
    
    // 初始化 AI 适配器
    aiAdapter.init({
        happyService,
        requestQueue,
        outbound
    });
    
    _initialized = true;
    console.log('[ChannelBridge] Initialized successfully');
}

/**
 * 注册通道适配器
 * @param {string} channelId - 通道标识
 * @param {ChannelAdapter} adapter - 通道适配器
 * @returns {boolean} 是否成功
 */
function registerChannel(channelId, adapter) {
    return registry.registerChannel(channelId, adapter);
}

/**
 * 注销通道适配器
 * @param {string} channelId - 通道标识
 * @returns {boolean} 是否成功
 */
function unregisterChannel(channelId) {
    return registry.unregisterChannel(channelId);
}

/**
 * 获取通道适配器
 * @param {string} channelId - 通道标识
 * @returns {ChannelAdapter|undefined} 通道适配器
 */
function getChannel(channelId) {
    return registry.getChannel(channelId);
}

/**
 * 列出所有已注册的通道
 * @returns {string[]} 通道 ID 列表
 */
function listChannels() {
    return registry.listChannels();
}

/**
 * 处理入站消息
 * @param {ChannelContext} context - 消息上下文
 * @param {ChannelAdapter} adapter - 通道适配器
 * @returns {Promise<InboundResult>} 处理结果
 */
async function handleInbound(context, adapter) {
    if (!_initialized) {
        console.error('[ChannelBridge] Not initialized');
        return {
            success: false,
            error: 'Channel Bridge not initialized'
        };
    }
    
    return await inbound.handleInbound(context, adapter);
}

/**
 * 获取 Bridge 状态
 * @returns {BridgeStatus} Bridge 状态
 */
function getStatus() {
    const queueStatus = requestQueue.getStatus();
    const adapterStatus = aiAdapter.getStatus();
    
    return {
        initialized: _initialized,
        aiConnected: adapterStatus.aiConnected,
        queueLength: queueStatus.queueLength,
        queueState: queueStatus.state,
        currentRequestId: queueStatus.currentRequestId,
        registeredChannels: registry.listChannels()
    };
}

/**
 * 检查是否已初始化
 * @returns {boolean} 是否已初始化
 */
function isInitialized() {
    return _initialized;
}

/**
 * 检查 AI 是否已连接
 * @returns {boolean} 是否已连接
 */
function isAIConnected() {
    return aiAdapter.isConnected();
}

/**
 * 清空请求队列
 * @param {string} [reason='Manual clear'] - 清空原因
 */
function clearQueue(reason = 'Manual clear') {
    requestQueue.clear(reason);
}

/**
 * 销毁 Bridge
 */
function destroy() {
    if (!_initialized) {
        return;
    }
    
    // 清空队列
    requestQueue.clear('Bridge destroying');
    
    // 清空注册的通道
    registry.clear();
    
    // 销毁 AI 适配器
    aiAdapter.destroy();
    
    _happyService = null;
    _initialized = false;
    
    console.log('[ChannelBridge] Destroyed');
}

// 导出主要 API
module.exports = {
    // 初始化
    init,
    destroy,
    isInitialized,
    
    // 通道管理
    registerChannel,
    unregisterChannel,
    getChannel,
    listChannels,
    
    // 消息处理
    handleInbound,
    
    // 状态
    getStatus,
    isAIConnected,
    clearQueue,
    
    // 子模块（高级用法）
    registry,
    requestQueue,
    aiAdapter,
    inbound,
    outbound
};
