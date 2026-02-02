/**
 * Feishu Channel Adapter - 飞书通道适配器
 * 
 * 实现 ChannelAdapter 接口，封装 Sender 模块
 * 用于与 Channel Bridge 集成
 */

/**
 * @typedef {Object} ChannelAdapter
 * @property {string} channelId - 通道标识
 * @property {function(string, string): Promise<SendResult>} sendText - 发送文本消息
 * @property {function(string, string): Promise<SendResult>} replyText - 回复消息
 * @property {function(string): Promise<void>} [sendTyping] - 发送输入中状态
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} success - 是否成功
 * @property {string} [messageId] - 发送的消息 ID
 * @property {string} [error] - 错误信息
 */

/**
 * 创建飞书通道适配器
 * @param {Object} sender - Sender 实例
 * @returns {ChannelAdapter} 通道适配器
 */
function createFeishuAdapter(sender) {
    if (!sender) {
        throw new Error('Sender is required');
    }
    
    return {
        /**
         * 通道标识
         */
        channelId: 'feishu',
        
        /**
         * 发送文本消息
         * @param {string} to - 接收者 ID (open_id 或 chat_id)
         * @param {string} text - 文本内容
         * @returns {Promise<SendResult>} 发送结果
         */
        async sendText(to, text) {
            try {
                const result = await sender.sendText(to, text);
                return {
                    success: result.success !== false,
                    messageId: result.messageIds?.[0] || undefined,
                    chunks: result.chunks
                };
            } catch (error) {
                console.error(`[FeishuAdapter] sendText error: ${error.message}`);
                return {
                    success: false,
                    error: error.message
                };
            }
        },
        
        /**
         * 回复消息
         * @param {string} messageId - 要回复的消息 ID
         * @param {string} text - 文本内容
         * @returns {Promise<SendResult>} 发送结果
         */
        async replyText(messageId, text) {
            try {
                const result = await sender.replyText(messageId, text);
                return {
                    success: result.success !== false,
                    messageId: result.messageIds?.[0] || undefined,
                    chunks: result.chunks
                };
            } catch (error) {
                console.error(`[FeishuAdapter] replyText error: ${error.message}`);
                return {
                    success: false,
                    error: error.message
                };
            }
        },
        
        /**
         * 发送输入中状态（飞书暂不支持）
         * @param {string} to - 接收者 ID
         * @returns {Promise<void>}
         */
        async sendTyping(to) {
            // 飞书 API 暂不支持发送输入中状态
            // 可以考虑发送一个"正在思考..."的消息，但这里先跳过
            console.log(`[FeishuAdapter] sendTyping called for ${to} (not supported)`);
        },
        
        /**
         * 发送媒体消息（可选）
         * @param {string} to - 接收者 ID
         * @param {string} mediaUrl - 媒体 URL
         * @param {string} [caption] - 说明文字
         * @returns {Promise<SendResult>}
         */
        async sendMedia(to, mediaUrl, caption) {
            // 飞书媒体消息需要先上传到飞书服务器
            // 这里简化处理，只发送文字链接
            const text = caption ? `${caption}\n${mediaUrl}` : mediaUrl;
            return this.sendText(to, text);
        },
        
        /**
         * 发送卡片消息（飞书特有）
         * @param {string} to - 接收者 ID
         * @param {Object} card - 卡片内容
         * @returns {Promise<SendResult>}
         */
        async sendCard(to, card) {
            try {
                const result = await sender.sendCard(to, card);
                return {
                    success: true,
                    messageId: result.messageId
                };
            } catch (error) {
                console.error(`[FeishuAdapter] sendCard error: ${error.message}`);
                return {
                    success: false,
                    error: error.message
                };
            }
        }
    };
}

module.exports = { createFeishuAdapter };
