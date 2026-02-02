/**
 * Feishu Message Handler - 消息处理器
 * 
 * 负责：
 * - 解析飞书消息内容
 * - 权限检查（私聊/群聊策略）
 * - @提及检测
 * - 通过 Channel Bridge 与 AI 集成
 * - 管理会话历史
 */

const { EventEmitter } = require('events');

/**
 * 消息处理器类
 */
class MessageHandler extends EventEmitter {
    /**
     * @param {Object} options - 配置选项
     * @param {Object} options.config - 飞书配置
     * @param {Object} options.messageStore - MessageStore 实例
     * @param {Object} options.sender - Sender 实例
     * @param {Object} options.policy - Policy 实例
     * @param {Map} options.chatHistories - 会话历史映射
     * @param {Object} options.adapter - Channel Adapter 实例
     * @param {Object} options.channelBridge - Channel Bridge 实例
     */
    constructor(options = {}) {
        super();
        
        this.config = options.config || {};
        this.messageStore = options.messageStore;
        this.sender = options.sender;
        this.policy = options.policy;
        this.chatHistories = options.chatHistories || new Map();
        
        // Channel Bridge 集成
        this.adapter = options.adapter;
        this.channelBridge = options.channelBridge;
    }
    
    /**
     * 处理传入消息
     * @param {Object} event - 消息事件
     * @param {string} botOpenId - 机器人 Open ID
     */
    async handleIncomingMessage(event, botOpenId) {
        console.log(`[MessageHandler] Message received: ${event.chatType} - ${event.senderOpenId}`);
        
        // 解析消息内容
        const context = this._parseMessageContext(event, botOpenId);
        
        // 权限检查
        const policyResult = this._checkPolicy(context);
        if (!policyResult.allowed) {
            console.log(`[MessageHandler] Message rejected by policy: ${policyResult.reason}`);
            
            // 群聊中未@机器人的消息，记录到历史但不响应
            if (policyResult.reason === 'not_mentioned' && context.isGroup) {
                this._recordToHistory(context);
            }
            return;
        }
        
        // 通过 Channel Bridge 发送到 AI
        await this._sendToAI(context);
    }
    
    /**
     * 解析消息上下文
     * @param {Object} event - 消息事件
     * @param {string} botOpenId - 机器人 Open ID
     * @returns {Object} 消息上下文
     */
    _parseMessageContext(event, botOpenId) {
        // 解析消息内容
        let textContent = '';
        try {
            const parsed = JSON.parse(event.content);
            if (event.messageType === 'text') {
                textContent = parsed.text || '';
            } else {
                textContent = event.content;
            }
        } catch {
            textContent = event.content;
        }
        
        // 检测是否@机器人
        const mentionedBot = this._checkBotMentioned(event.mentions, botOpenId);
        
        // 移除@机器人的文本
        const cleanContent = this._stripBotMention(textContent, event.mentions);
        
        // 构造会话 ID
        const isGroup = event.chatType === 'group';
        const sessionId = isGroup 
            ? `feishu:group:${event.chatId}`
            : `feishu:dm:${event.senderOpenId}`;
        
        return {
            // 原始事件
            event,
            
            // 消息内容
            rawContent: textContent,
            content: cleanContent,
            
            // 会话信息
            sessionId,
            chatId: event.chatId,
            messageId: event.messageId,
            isGroup,
            
            // 发送者信息
            senderId: event.senderId,
            senderOpenId: event.senderOpenId,
            
            // @提及
            mentionedBot,
            mentions: event.mentions,
            
            // 回复信息
            rootId: event.rootId,
            parentId: event.parentId,
            
            // 时间戳
            timestamp: Date.now()
        };
    }
    
    /**
     * 检测是否@机器人
     * @param {Array} mentions - @提及列表
     * @param {string} botOpenId - 机器人 Open ID
     * @returns {boolean} 是否@机器人
     */
    _checkBotMentioned(mentions, botOpenId) {
        if (!mentions || mentions.length === 0) return false;
        if (!botOpenId) return mentions.length > 0;
        
        return mentions.some(m => 
            m.id?.open_id === botOpenId || 
            m.id?.user_id === botOpenId
        );
    }
    
    /**
     * 移除@机器人的文本
     * @param {string} text - 原始文本
     * @param {Array} mentions - @提及列表
     * @returns {string} 清理后的文本
     */
    _stripBotMention(text, mentions) {
        if (!mentions || mentions.length === 0) return text;
        
        let result = text;
        for (const mention of mentions) {
            // 移除 @name 格式
            if (mention.name) {
                result = result.replace(new RegExp(`@${mention.name}\\s*`, 'g'), '').trim();
            }
            // 移除 mention key
            if (mention.key) {
                result = result.replace(new RegExp(mention.key, 'g'), '').trim();
            }
        }
        
        return result;
    }
    
    /**
     * 检查权限策略
     * @param {Object} context - 消息上下文
     * @returns {Object} 检查结果 { allowed, reason }
     */
    _checkPolicy(context) {
        if (!this.policy) {
            return { allowed: true };
        }
        
        if (context.isGroup) {
            // 群聊策略
            const groupResult = this.policy.checkGroup({
                chatId: context.chatId,
                senderId: context.senderOpenId
            });
            
            if (!groupResult.allowed) {
                return groupResult;
            }
            
            // 检查是否需要@提及
            if (this.config.requireMention && !context.mentionedBot) {
                return { allowed: false, reason: 'not_mentioned' };
            }
            
            return { allowed: true };
        } else {
            // 私聊策略
            return this.policy.checkDM({
                senderId: context.senderOpenId
            });
        }
    }
    
    /**
     * 记录消息到历史
     * @param {Object} context - 消息上下文
     */
    _recordToHistory(context) {
        const historyKey = context.chatId;
        
        if (!this.chatHistories.has(historyKey)) {
            this.chatHistories.set(historyKey, []);
        }
        
        const history = this.chatHistories.get(historyKey);
        history.push({
            sender: context.senderOpenId,
            body: context.content,
            timestamp: context.timestamp,
            messageId: context.messageId
        });
        
        // 限制历史记录数量
        const maxHistory = 50;
        if (history.length > maxHistory) {
            history.splice(0, history.length - maxHistory);
        }
        
        console.log(`[MessageHandler] Recorded to history: ${historyKey} (${history.length} messages)`);
    }
    
    /**
     * 发送消息到 AI（通过 Channel Bridge）
     * @param {Object} context - 消息上下文
     */
    async _sendToAI(context) {
        // 检查 Channel Bridge 是否可用
        if (!this.channelBridge) {
            console.error('[MessageHandler] Channel Bridge not available');
            await this._sendErrorMessage(context, 'AI 服务暂不可用');
            return;
        }
        
        if (!this.adapter) {
            console.error('[MessageHandler] Adapter not available');
            await this._sendErrorMessage(context, 'AI 服务配置错误');
            return;
        }
        
        // 构建上下文历史（用于群聊）
        let messageBody = context.content;
        if (context.isGroup) {
            const historyKey = context.chatId;
            const history = this.chatHistories.get(historyKey) || [];
            
            if (history.length > 0) {
                // 构建历史上下文
                const historyText = history
                    .slice(-10) // 最近 10 条
                    .map(h => `[${h.sender}]: ${h.body}`)
                    .join('\n');
                
                messageBody = `[群聊上下文]\n${historyText}\n\n[当前消息]\n${context.content}`;
            }
        }
        
        try {
            console.log(`[MessageHandler] Sending to AI via Bridge: ${messageBody.substring(0, 100)}...`);
            
            // 构建 Channel Bridge 上下文
            const bridgeContext = {
                channelId: 'feishu',
                sessionKey: context.sessionId,
                messageId: context.messageId,
                senderId: context.senderOpenId,
                chatType: context.isGroup ? 'group' : 'dm',
                chatId: context.chatId,
                content: messageBody,
                replyToId: context.messageId, // 回复原消息
                timestamp: context.timestamp,
                metadata: {
                    rawContent: context.rawContent,
                    mentionedBot: context.mentionedBot
                }
            };
            
            // 通过 Channel Bridge 处理消息
            const result = await this.channelBridge.handleInbound(bridgeContext, this.adapter);
            
            if (!result.success) {
                console.error(`[MessageHandler] Bridge handleInbound failed: ${result.error}`);
                
                // 如果是队列满的情况，已经在 inbound 中发送了提示
                if (!result.error?.includes('full')) {
                    await this._sendErrorMessage(context, result.error || '处理消息时发生错误');
                }
                return;
            }
            
            console.log(`[MessageHandler] Message queued: ${result.requestId}, position: ${result.queuePosition}`);
            
            // 保存用户消息到 MessageStore
            if (this.messageStore) {
                try {
                    this.messageStore.addMessage?.(context.sessionId, {
                        role: 'user',
                        content: context.content,
                        timestamp: context.timestamp,
                        metadata: {
                            source: 'feishu',
                            chatId: context.chatId,
                            messageId: context.messageId,
                            senderOpenId: context.senderOpenId
                        }
                    });
                } catch (e) {
                    console.warn('[MessageHandler] Failed to save message:', e.message);
                }
            }
            
            // 清理群聊历史（消息已发送，清理历史）
            if (context.isGroup) {
                this.chatHistories.delete(context.chatId);
            }
            
        } catch (error) {
            console.error('[MessageHandler] Failed to send to AI:', error.message);
            await this._sendErrorMessage(context, `处理消息时发生错误: ${error.message}`);
        }
    }
    
    /**
     * 发送错误消息
     * @param {Object} context - 消息上下文
     * @param {string} errorMessage - 错误信息
     */
    async _sendErrorMessage(context, errorMessage) {
        if (!this.sender) return;
        
        try {
            await this.sender.replyText(context.messageId, 
                `抱歉，${errorMessage}`);
        } catch (e) {
            console.error('[MessageHandler] Failed to send error message:', e.message);
        }
    }
}

module.exports = MessageHandler;
