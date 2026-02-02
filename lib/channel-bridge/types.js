/**
 * Channel Bridge 类型定义
 * 
 * 使用 JSDoc 定义所有核心接口和类型
 */

/**
 * 会话类型
 * @typedef {'dm' | 'group'} ChatType
 */

/**
 * 请求状态
 * @typedef {'pending' | 'processing' | 'completed' | 'failed' | 'timeout'} RequestStatus
 */

/**
 * 统一消息上下文
 * @typedef {Object} ChannelContext
 * @property {string} channelId - 通道标识 (feishu, wechat, telegram...)
 * @property {string} sessionKey - 会话键 (如 feishu:dm:ou_xxx)
 * @property {string} messageId - 消息 ID
 * @property {string} senderId - 发送者 ID
 * @property {string} [senderName] - 发送者名称
 * @property {ChatType} chatType - 会话类型 (dm/group)
 * @property {string} content - 消息内容
 * @property {string} [replyToId] - 回复目标消息 ID
 * @property {string} [chatId] - 群聊 ID（群聊时）
 * @property {number} timestamp - 时间戳
 * @property {Object} [metadata] - 通道特定的元数据
 */

/**
 * 通道适配器接口
 * @typedef {Object} ChannelAdapter
 * @property {string} channelId - 通道标识
 * @property {function(string, string): Promise<SendResult>} sendText - 发送文本消息
 * @property {function(string, string): Promise<SendResult>} replyText - 回复消息
 * @property {function(string): Promise<void>} [sendTyping] - 发送输入中状态
 * @property {function(string, string): Promise<SendResult>} [sendMedia] - 发送媒体
 */

/**
 * 发送结果
 * @typedef {Object} SendResult
 * @property {boolean} success - 是否成功
 * @property {string} [messageId] - 发送的消息 ID
 * @property {string} [error] - 错误信息
 */

/**
 * 队列请求对象
 * @typedef {Object} QueuedRequest
 * @property {string} id - 请求 ID
 * @property {ChannelContext} context - 消息上下文
 * @property {ChannelAdapter} adapter - 对应的通道适配器
 * @property {RequestStatus} status - 请求状态
 * @property {number} createdAt - 创建时间戳
 * @property {number} [startedAt] - 开始处理时间戳
 * @property {number} [completedAt] - 完成时间戳
 * @property {string} [response] - AI 响应内容
 * @property {string} [error] - 错误信息
 */

/**
 * AI 响应消息
 * @typedef {Object} AIMessage
 * @property {string} [id] - 消息 ID
 * @property {string} role - 角色 (user/assistant/agent)
 * @property {string} content - 消息内容
 * @property {number} [timestamp] - 时间戳
 * @property {Object} [meta] - 元数据
 */

/**
 * Bridge 配置
 * @typedef {Object} BridgeConfig
 * @property {number} [requestTimeoutMs] - 请求超时时间（毫秒），默认 60000
 * @property {number} [maxQueueSize] - 最大队列长度，默认 100
 * @property {number} [messageChunkLimit] - 消息分块限制，默认 4000
 * @property {boolean} [enableLogging] - 是否启用日志，默认 true
 */

/**
 * Bridge 状态
 * @typedef {Object} BridgeStatus
 * @property {boolean} initialized - 是否已初始化
 * @property {boolean} aiConnected - AI 服务是否已连接
 * @property {number} queueLength - 当前队列长度
 * @property {string} [currentRequestId] - 当前处理中的请求 ID
 * @property {string[]} registeredChannels - 已注册的通道列表
 */

/**
 * 入站处理结果
 * @typedef {Object} InboundResult
 * @property {boolean} success - 是否成功入队
 * @property {string} [requestId] - 请求 ID
 * @property {string} [error] - 错误信息
 * @property {number} [queuePosition] - 队列位置
 */

// 导出空对象，类型通过 JSDoc 使用
module.exports = {};
