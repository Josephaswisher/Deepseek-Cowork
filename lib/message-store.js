/**
 * 消息历史持久化模块
 * 
 * 使用 JSON 文件存储对话消息和用量统计
 * 存储位置：userData/messages.json
 * 
 * 创建时间: 2026-01-13
 */

const fs = require('fs');
const path = require('path');

// 默认配置
const DEFAULT_DATA = {
    sessions: {},
    version: 1
};

// 每个 session 最大消息数
const MAX_MESSAGES_PER_SESSION = 200;

// 写入防抖延迟（毫秒）
const SAVE_DEBOUNCE_MS = 1000;

/**
 * 消息存储管理器
 */
class MessageStore {
    constructor() {
        this._data = null;
        this._storagePath = null;
        this._userDataPath = null;
        this._saveTimer = null;
        this._pendingSave = false;
        // conversationId 管理：每个 session 的当前 conversationId
        this._currentConversationIds = {};
    }

    /**
     * 初始化（需要在 app ready 后调用）
     * @param {string} userDataPath Electron app.getPath('userData')
     */
    initialize(userDataPath) {
        this._userDataPath = userDataPath;
        this._storagePath = path.join(userDataPath, 'messages.json');
        this._load();
        console.log('[MessageStore] Initialized:', this._storagePath);
    }

    /**
     * 加载数据
     * @private
     */
    _load() {
        try {
            if (fs.existsSync(this._storagePath)) {
                const content = fs.readFileSync(this._storagePath, 'utf8');
                this._data = JSON.parse(content);
                
                // 确保数据结构完整
                if (!this._data.sessions) {
                    this._data.sessions = {};
                }
                if (!this._data.version) {
                    this._data.version = 1;
                }
                
                console.log('[MessageStore] Loaded data, sessions:', Object.keys(this._data.sessions).length);
            } else {
                this._data = JSON.parse(JSON.stringify(DEFAULT_DATA));
                console.log('[MessageStore] No existing data, using defaults');
            }
        } catch (error) {
            console.error('[MessageStore] Failed to load data:', error.message);
            this._data = JSON.parse(JSON.stringify(DEFAULT_DATA));
        }
    }

    /**
     * 保存数据（带防抖）
     * @private
     */
    _save() {
        // 标记需要保存
        this._pendingSave = true;
        
        // 如果已有定时器，跳过
        if (this._saveTimer) {
            return;
        }
        
        // 设置防抖定时器
        this._saveTimer = setTimeout(() => {
            this._doSave();
            this._saveTimer = null;
            this._pendingSave = false;
        }, SAVE_DEBOUNCE_MS);
    }

    /**
     * 立即保存数据
     * @private
     */
    _doSave() {
        try {
            // 确保目录存在
            const dir = path.dirname(this._storagePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this._storagePath, JSON.stringify(this._data, null, 2), 'utf8');
        } catch (error) {
            console.error('[MessageStore] Failed to save data:', error.message);
        }
    }

    /**
     * 强制立即保存（用于应用退出前）
     */
    flush() {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        if (this._pendingSave || this._data) {
            this._doSave();
            this._pendingSave = false;
        }
    }

    /**
     * 确保 session 数据结构存在
     * @param {string} sessionId Session ID
     * @private
     */
    _ensureSession(sessionId) {
        if (!this._data) {
            this._data = JSON.parse(JSON.stringify(DEFAULT_DATA));
        }
        if (!this._data.sessions[sessionId]) {
            this._data.sessions[sessionId] = {
                messages: [],
                usage: null,
                totalOutputTokens: 0,
                lastSavedIndex: -1,  // 记忆保存边界：-1 表示从未保存
                lastUpdated: new Date().toISOString()
            };
        }
        // 兼容旧数据：添加 lastSavedIndex 字段
        if (this._data.sessions[sessionId].lastSavedIndex === undefined) {
            this._data.sessions[sessionId].lastSavedIndex = -1;
        }
    }

    /**
     * 获取指定 session 的消息历史
     * @param {string} sessionId Session ID
     * @param {number} limit 返回消息数量限制
     * @returns {Array} 消息列表
     */
    getMessages(sessionId, limit = MAX_MESSAGES_PER_SESSION) {
        if (!this._data || !sessionId) {
            return [];
        }
        
        const session = this._data.sessions[sessionId];
        if (!session || !session.messages) {
            return [];
        }
        
        // 返回最近的 limit 条消息
        const messages = session.messages;
        if (limit > 0 && messages.length > limit) {
            return messages.slice(-limit);
        }
        return [...messages];
    }

    /**
     * 添加消息到指定 session
     * @param {string} sessionId Session ID
     * @param {Object} message 消息对象
     */
    addMessage(sessionId, message) {
        if (!sessionId || !message) {
            return;
        }
        
        this._ensureSession(sessionId);
        
        const session = this._data.sessions[sessionId];
        
        // 添加消息
        session.messages.push({
            role: message.role,
            text: message.text,
            messageId: message.messageId,
            timestamp: message.timestamp || new Date().toISOString(),
            // 可选字段
            ...(message.tool && { tool: message.tool }),
            ...(message.kind && { kind: message.kind }),
            ...(message.content && { content: message.content }),
            ...(message.meta && { meta: message.meta })
        });
        
        // 限制消息数量
        if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
            session.messages = session.messages.slice(-MAX_MESSAGES_PER_SESSION);
        }
        
        // 更新时间戳
        session.lastUpdated = new Date().toISOString();
        
        // 触发保存
        this._save();
    }

    /**
     * 批量设置消息（用于初始化或恢复）
     * @param {string} sessionId Session ID
     * @param {Array} messages 消息列表
     */
    setMessages(sessionId, messages) {
        if (!sessionId) {
            return;
        }
        
        this._ensureSession(sessionId);
        
        const session = this._data.sessions[sessionId];
        
        // 限制消息数量
        if (messages && messages.length > MAX_MESSAGES_PER_SESSION) {
            session.messages = messages.slice(-MAX_MESSAGES_PER_SESSION);
        } else {
            session.messages = messages || [];
        }
        
        session.lastUpdated = new Date().toISOString();
        this._save();
    }

    /**
     * 获取指定 session 的 usage 数据
     * @param {string} sessionId Session ID
     * @returns {Object|null} { usage, totalOutputTokens } 或 null
     */
    getUsage(sessionId) {
        if (!this._data || !sessionId) {
            return null;
        }
        
        const session = this._data.sessions[sessionId];
        if (!session) {
            return null;
        }
        
        return {
            usage: session.usage,
            totalOutputTokens: session.totalOutputTokens || 0
        };
    }

    /**
     * 保存 usage 数据
     * @param {string} sessionId Session ID
     * @param {Object} usage Usage 数据对象
     * @param {number} totalOutputTokens 累计输出 tokens
     */
    saveUsage(sessionId, usage, totalOutputTokens = 0) {
        if (!sessionId) {
            return;
        }
        
        this._ensureSession(sessionId);
        
        const session = this._data.sessions[sessionId];
        session.usage = usage;
        session.totalOutputTokens = totalOutputTokens;
        session.lastUpdated = new Date().toISOString();
        
        this._save();
    }

    /**
     * 获取上次保存之后的消息（用于记忆保存）
     * @param {string} sessionId Session ID
     * @returns {Array} 上次保存后的消息列表
     */
    getMessagesSinceLastSave(sessionId) {
        if (!this._data || !sessionId) {
            return [];
        }
        
        const session = this._data.sessions[sessionId];
        if (!session || !session.messages) {
            return [];
        }
        
        const lastSavedIndex = session.lastSavedIndex ?? -1;
        
        // lastSavedIndex 是上次保存时的最后一条消息索引
        // 返回该索引之后的所有消息
        if (lastSavedIndex < 0) {
            // 从未保存，返回全部消息
            return [...session.messages];
        }
        
        if (lastSavedIndex >= session.messages.length - 1) {
            // 没有新消息
            return [];
        }
        
        return session.messages.slice(lastSavedIndex + 1);
    }

    /**
     * 标记当前消息已保存到记忆（更新保存边界）
     * @param {string} sessionId Session ID
     */
    markSaved(sessionId) {
        if (!this._data || !sessionId) {
            return;
        }
        
        this._ensureSession(sessionId);
        
        const session = this._data.sessions[sessionId];
        // 将边界设置为当前最后一条消息的索引
        session.lastSavedIndex = session.messages.length - 1;
        session.lastUpdated = new Date().toISOString();
        
        this._save();
        console.log(`[MessageStore] Marked saved at index ${session.lastSavedIndex} for session: ${sessionId.substring(0, 8)}...`);
    }

    /**
     * 获取保存边界索引
     * @param {string} sessionId Session ID
     * @returns {number} 保存边界索引，-1 表示从未保存
     */
    getLastSavedIndex(sessionId) {
        if (!this._data || !sessionId) {
            return -1;
        }
        
        const session = this._data.sessions[sessionId];
        if (!session) {
            return -1;
        }
        
        return session.lastSavedIndex ?? -1;
    }

    /**
     * 清空指定 session 的数据
     * @param {string} sessionId Session ID
     */
    clearSession(sessionId) {
        if (!this._data || !sessionId) {
            return;
        }
        
        if (this._data.sessions[sessionId]) {
            this._data.sessions[sessionId] = {
                messages: [],
                usage: null,
                totalOutputTokens: 0,
                lastSavedIndex: -1,
                lastUpdated: new Date().toISOString()
            };
            // 同时重置 conversationId，下次发消息时会生成新的
            this.resetConversationId(sessionId);
            this._save();
            console.log('[MessageStore] Cleared session:', sessionId);
        }
    }

    /**
     * 删除指定 session 的数据
     * @param {string} sessionId Session ID
     */
    deleteSession(sessionId) {
        if (!this._data || !sessionId) {
            return;
        }
        
        if (this._data.sessions[sessionId]) {
            delete this._data.sessions[sessionId];
            this._save();
            console.log('[MessageStore] Deleted session:', sessionId);
        }
    }

    /**
     * 获取所有 session ID 列表
     * @returns {Array<string>} Session ID 列表
     */
    getAllSessionIds() {
        if (!this._data) {
            return [];
        }
        return Object.keys(this._data.sessions);
    }

    /**
     * 清理过期的 session 数据（超过指定天数未更新）
     * @param {number} days 过期天数
     */
    cleanupOldSessions(days = 30) {
        if (!this._data) {
            return;
        }
        
        const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
        let cleaned = 0;
        
        for (const sessionId of Object.keys(this._data.sessions)) {
            const session = this._data.sessions[sessionId];
            const lastUpdated = session.lastUpdated ? new Date(session.lastUpdated).getTime() : 0;
            
            if (lastUpdated < cutoffTime) {
                delete this._data.sessions[sessionId];
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            this._save();
            console.log(`[MessageStore] Cleaned up ${cleaned} old sessions`);
        }
    }

    /**
     * 获取存储文件路径
     * @returns {string} 存储文件路径
     */
    getStoragePath() {
        return this._storagePath;
    }

    /**
     * 获取 userData 目录路径
     * @returns {string} userData 目录路径
     */
    getUserDataPath() {
        return this._userDataPath;
    }

    /**
     * 获取当前 session 文件路径
     * @returns {string} current-session.json 文件路径
     */
    getCurrentSessionFilePath() {
        if (!this._userDataPath) {
            return null;
        }
        return path.join(this._userDataPath, 'current-session.json');
    }

    /**
     * 写入当前 session 信息到文件
     * @param {string} sessionId Session ID
     * @param {string} conversationId ConversationId（可选，不传则自动获取当前的）
     */
    writeCurrentSession(sessionId, conversationId = null) {
        if (!this._userDataPath || !sessionId) {
            return;
        }
        
        try {
            const filePath = this.getCurrentSessionFilePath();
            // 如果没有传入 conversationId，则获取当前的
            const convId = conversationId || this.getCurrentConversationId(sessionId);
            const data = {
                sessionId,
                conversationId: convId,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`[MessageStore] Current session written: ${sessionId.substring(0, 8)}..., conv: ${convId}`);
        } catch (error) {
            console.error(`[MessageStore] Failed to write current session: ${error.message}`);
        }
    }

    /**
     * 清空当前 session 文件
     */
    clearCurrentSession() {
        if (!this._userDataPath) {
            return;
        }
        
        try {
            const filePath = this.getCurrentSessionFilePath();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('[MessageStore] Current session file cleared');
            }
        } catch (error) {
            console.error(`[MessageStore] Failed to clear current session: ${error.message}`);
        }
    }

    /**
     * 读取当前 session 信息
     * @returns {Object|null} { sessionId, updatedAt } 或 null
     */
    readCurrentSession() {
        if (!this._userDataPath) {
            return null;
        }
        
        try {
            const filePath = this.getCurrentSessionFilePath();
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error(`[MessageStore] Failed to read current session: ${error.message}`);
        }
        return null;
    }

    /**
     * 获取存储统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        if (!this._data) {
            return { sessions: 0, totalMessages: 0 };
        }
        
        let totalMessages = 0;
        for (const session of Object.values(this._data.sessions)) {
            totalMessages += session.messages?.length || 0;
        }
        
        return {
            sessions: Object.keys(this._data.sessions).length,
            totalMessages,
            storagePath: this._storagePath
        };
    }

    // ============ ConversationId 管理 ============

    /**
     * 生成新的 conversationId
     * 格式：conv-YYYYMMDD-HHMMSS
     * @returns {string} 新的 conversationId
     */
    generateConversationId() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        return `conv-${year}${month}${day}-${hours}${minutes}${seconds}`;
    }

    /**
     * 获取当前 conversationId
     * 如果没有则自动生成新的
     * @param {string} sessionId Session ID
     * @returns {string} 当前 conversationId
     */
    getCurrentConversationId(sessionId) {
        if (!sessionId) {
            return null;
        }
        
        // 如果没有 conversationId，自动生成
        if (!this._currentConversationIds[sessionId]) {
            this._currentConversationIds[sessionId] = this.generateConversationId();
            console.log(`[MessageStore] Generated new conversationId for session ${sessionId.substring(0, 8)}...: ${this._currentConversationIds[sessionId]}`);
        }
        
        return this._currentConversationIds[sessionId];
    }

    /**
     * 重置 conversationId（/clear 时调用）
     * 设为 null，下次发消息时自动生成新的
     * @param {string} sessionId Session ID
     */
    resetConversationId(sessionId) {
        if (!sessionId) {
            return;
        }
        
        const oldConvId = this._currentConversationIds[sessionId];
        this._currentConversationIds[sessionId] = null;
        
        if (oldConvId) {
            console.log(`[MessageStore] Reset conversationId for session ${sessionId.substring(0, 8)}...: ${oldConvId} -> null`);
        }
    }

    /**
     * 设置 conversationId（用于恢复场景）
     * @param {string} sessionId Session ID
     * @param {string} conversationId ConversationId
     */
    setConversationId(sessionId, conversationId) {
        if (!sessionId) {
            return;
        }
        
        this._currentConversationIds[sessionId] = conversationId;
        console.log(`[MessageStore] Set conversationId for session ${sessionId.substring(0, 8)}...: ${conversationId}`);
    }
}

// 导出单例
module.exports = new MessageStore();
