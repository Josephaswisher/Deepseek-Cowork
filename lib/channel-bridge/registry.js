/**
 * Channel Registry - 通道注册表
 * 
 * 管理所有已注册的外部通道适配器
 */

const { EventEmitter } = require('events');

/**
 * @typedef {import('./types').ChannelAdapter} ChannelAdapter
 */

class ChannelRegistry extends EventEmitter {
    constructor() {
        super();
        
        /** @type {Map<string, ChannelAdapter>} */
        this._channels = new Map();
        
        console.log('[ChannelRegistry] Initialized');
    }
    
    /**
     * 注册通道适配器
     * @param {string} channelId - 通道标识
     * @param {ChannelAdapter} adapter - 通道适配器
     * @returns {boolean} 是否成功
     */
    registerChannel(channelId, adapter) {
        if (!channelId || typeof channelId !== 'string') {
            console.error('[ChannelRegistry] Invalid channelId');
            return false;
        }
        
        if (!adapter) {
            console.error('[ChannelRegistry] Invalid adapter');
            return false;
        }
        
        // 验证适配器接口
        if (typeof adapter.sendText !== 'function' || typeof adapter.replyText !== 'function') {
            console.error('[ChannelRegistry] Adapter must implement sendText and replyText methods');
            return false;
        }
        
        if (this._channels.has(channelId)) {
            console.warn(`[ChannelRegistry] Channel ${channelId} already registered, replacing`);
        }
        
        this._channels.set(channelId, adapter);
        console.log(`[ChannelRegistry] Channel registered: ${channelId}`);
        
        this.emit('channel:registered', { channelId, adapter });
        return true;
    }
    
    /**
     * 注销通道适配器
     * @param {string} channelId - 通道标识
     * @returns {boolean} 是否成功
     */
    unregisterChannel(channelId) {
        if (!this._channels.has(channelId)) {
            console.warn(`[ChannelRegistry] Channel ${channelId} not found`);
            return false;
        }
        
        this._channels.delete(channelId);
        console.log(`[ChannelRegistry] Channel unregistered: ${channelId}`);
        
        this.emit('channel:unregistered', { channelId });
        return true;
    }
    
    /**
     * 获取通道适配器
     * @param {string} channelId - 通道标识
     * @returns {ChannelAdapter|undefined} 通道适配器
     */
    getChannel(channelId) {
        return this._channels.get(channelId);
    }
    
    /**
     * 检查通道是否已注册
     * @param {string} channelId - 通道标识
     * @returns {boolean} 是否已注册
     */
    hasChannel(channelId) {
        return this._channels.has(channelId);
    }
    
    /**
     * 列出所有已注册的通道 ID
     * @returns {string[]} 通道 ID 列表
     */
    listChannels() {
        return Array.from(this._channels.keys());
    }
    
    /**
     * 获取所有已注册的通道适配器
     * @returns {Map<string, ChannelAdapter>} 通道适配器映射
     */
    getAllChannels() {
        return new Map(this._channels);
    }
    
    /**
     * 获取已注册通道数量
     * @returns {number} 通道数量
     */
    size() {
        return this._channels.size;
    }
    
    /**
     * 清空所有注册的通道
     */
    clear() {
        const channels = this.listChannels();
        this._channels.clear();
        console.log('[ChannelRegistry] All channels cleared');
        
        this.emit('registry:cleared', { channels });
    }
}

// 单例
const registry = new ChannelRegistry();

module.exports = registry;
module.exports.ChannelRegistry = ChannelRegistry;
