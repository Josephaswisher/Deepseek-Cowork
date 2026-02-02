/**
 * Request Queue - 请求队列管理
 * 
 * 实现 FIFO 队列，确保对 HappyService 的请求串行处理
 * 解决单会话 AI 服务的多用户并发问题
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

/**
 * @typedef {import('./types').ChannelContext} ChannelContext
 * @typedef {import('./types').ChannelAdapter} ChannelAdapter
 * @typedef {import('./types').QueuedRequest} QueuedRequest
 * @typedef {import('./types').RequestStatus} RequestStatus
 */

/**
 * 队列状态
 * @typedef {'idle' | 'processing' | 'waiting'} QueueState
 */

class RequestQueue extends EventEmitter {
    /**
     * @param {Object} options - 配置选项
     * @param {number} [options.timeoutMs=60000] - 请求超时时间（毫秒）
     * @param {number} [options.maxQueueSize=100] - 最大队列长度
     */
    constructor(options = {}) {
        super();
        
        /** @type {number} */
        this._timeoutMs = options.timeoutMs || 60000;
        
        /** @type {number} */
        this._maxQueueSize = options.maxQueueSize || 100;
        
        /** @type {QueuedRequest[]} */
        this._queue = [];
        
        /** @type {QueuedRequest|null} */
        this._currentRequest = null;
        
        /** @type {QueueState} */
        this._state = 'idle';
        
        /** @type {NodeJS.Timeout|null} */
        this._timeoutTimer = null;
        
        /** @type {function|null} */
        this._processCallback = null;
        
        console.log('[RequestQueue] Initialized with timeout:', this._timeoutMs, 'ms');
    }
    
    /**
     * 生成请求 ID
     * @returns {string} 请求 ID
     */
    _generateRequestId() {
        return `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    }
    
    /**
     * 入队请求
     * @param {ChannelContext} context - 消息上下文
     * @param {ChannelAdapter} adapter - 通道适配器
     * @returns {{ success: boolean, requestId?: string, error?: string, queuePosition?: number }}
     */
    enqueue(context, adapter) {
        // 检查队列是否已满
        if (this._queue.length >= this._maxQueueSize) {
            console.warn('[RequestQueue] Queue is full, rejecting request');
            return { 
                success: false, 
                error: 'Queue is full, please try again later' 
            };
        }
        
        const requestId = this._generateRequestId();
        
        /** @type {QueuedRequest} */
        const request = {
            id: requestId,
            context,
            adapter,
            status: 'pending',
            createdAt: Date.now()
        };
        
        this._queue.push(request);
        const queuePosition = this._queue.length;
        
        console.log(`[RequestQueue] Request enqueued: ${requestId}, position: ${queuePosition}, channel: ${context.channelId}`);
        
        this.emit('request:enqueued', { request, queuePosition });
        
        // 如果当前空闲，立即开始处理
        if (this._state === 'idle') {
            this._processNext();
        }
        
        return { 
            success: true, 
            requestId, 
            queuePosition 
        };
    }
    
    /**
     * 设置处理回调函数
     * @param {function(QueuedRequest): Promise<void>} callback - 处理回调
     */
    setProcessCallback(callback) {
        this._processCallback = callback;
    }
    
    /**
     * 处理下一个请求
     * @private
     */
    async _processNext() {
        if (this._state !== 'idle') {
            return;
        }
        
        if (this._queue.length === 0) {
            return;
        }
        
        // 取出队首请求
        this._currentRequest = this._queue.shift();
        if (!this._currentRequest) {
            return;
        }
        
        this._currentRequest.status = 'processing';
        this._currentRequest.startedAt = Date.now();
        this._state = 'processing';
        
        console.log(`[RequestQueue] Processing request: ${this._currentRequest.id}`);
        
        this.emit('request:processing', { request: this._currentRequest });
        
        // 设置超时定时器
        this._startTimeout();
        
        // 调用处理回调
        if (this._processCallback) {
            try {
                await this._processCallback(this._currentRequest);
                this._state = 'waiting';
                console.log(`[RequestQueue] Request sent to AI, waiting for response: ${this._currentRequest.id}`);
            } catch (error) {
                console.error(`[RequestQueue] Process callback error: ${error.message}`);
                this.failCurrentRequest(error.message);
            }
        } else {
            console.warn('[RequestQueue] No process callback set');
            this.failCurrentRequest('No process callback configured');
        }
    }
    
    /**
     * 启动超时定时器
     * @private
     */
    _startTimeout() {
        this._clearTimeout();
        
        this._timeoutTimer = setTimeout(() => {
            if (this._currentRequest) {
                console.warn(`[RequestQueue] Request timeout: ${this._currentRequest.id}`);
                this.failCurrentRequest('Request timeout');
            }
        }, this._timeoutMs);
    }
    
    /**
     * 清除超时定时器
     * @private
     */
    _clearTimeout() {
        if (this._timeoutTimer) {
            clearTimeout(this._timeoutTimer);
            this._timeoutTimer = null;
        }
    }
    
    /**
     * 获取当前处理中的请求
     * @returns {QueuedRequest|null} 当前请求
     */
    getCurrentRequest() {
        return this._currentRequest;
    }
    
    /**
     * 完成当前请求
     * @param {string} response - AI 响应内容
     */
    completeCurrentRequest(response) {
        if (!this._currentRequest) {
            console.warn('[RequestQueue] No current request to complete');
            return;
        }
        
        this._clearTimeout();
        
        this._currentRequest.status = 'completed';
        this._currentRequest.completedAt = Date.now();
        this._currentRequest.response = response;
        
        const duration = this._currentRequest.completedAt - this._currentRequest.startedAt;
        console.log(`[RequestQueue] Request completed: ${this._currentRequest.id}, duration: ${duration}ms`);
        
        this.emit('request:completed', { 
            request: this._currentRequest,
            response,
            duration
        });
        
        this._currentRequest = null;
        this._state = 'idle';
        
        // 继续处理下一个
        this._processNext();
    }
    
    /**
     * 标记当前请求失败
     * @param {string} error - 错误信息
     */
    failCurrentRequest(error) {
        if (!this._currentRequest) {
            console.warn('[RequestQueue] No current request to fail');
            return;
        }
        
        this._clearTimeout();
        
        this._currentRequest.status = 'failed';
        this._currentRequest.completedAt = Date.now();
        this._currentRequest.error = error;
        
        console.error(`[RequestQueue] Request failed: ${this._currentRequest.id}, error: ${error}`);
        
        this.emit('request:failed', { 
            request: this._currentRequest,
            error
        });
        
        this._currentRequest = null;
        this._state = 'idle';
        
        // 继续处理下一个
        this._processNext();
    }
    
    /**
     * 获取队列状态
     * @returns {{ state: QueueState, queueLength: number, currentRequestId: string|null }}
     */
    getStatus() {
        return {
            state: this._state,
            queueLength: this._queue.length,
            currentRequestId: this._currentRequest?.id || null
        };
    }
    
    /**
     * 获取队列长度
     * @returns {number} 队列长度
     */
    getQueueLength() {
        return this._queue.length;
    }
    
    /**
     * 检查队列是否为空
     * @returns {boolean} 是否为空
     */
    isEmpty() {
        return this._queue.length === 0 && this._currentRequest === null;
    }
    
    /**
     * 清空队列
     * @param {string} [reason='Queue cleared'] - 清空原因
     */
    clear(reason = 'Queue cleared') {
        this._clearTimeout();
        
        // 将所有待处理请求标记为失败
        for (const request of this._queue) {
            request.status = 'failed';
            request.error = reason;
            this.emit('request:failed', { request, error: reason });
        }
        
        // 处理当前请求
        if (this._currentRequest) {
            this._currentRequest.status = 'failed';
            this._currentRequest.error = reason;
            this.emit('request:failed', { request: this._currentRequest, error: reason });
        }
        
        this._queue = [];
        this._currentRequest = null;
        this._state = 'idle';
        
        console.log(`[RequestQueue] Queue cleared: ${reason}`);
    }
    
    /**
     * 获取队列中的所有请求（用于调试）
     * @returns {QueuedRequest[]} 请求列表
     */
    getQueueSnapshot() {
        return [...this._queue];
    }
}

// 单例
const requestQueue = new RequestQueue();

module.exports = requestQueue;
module.exports.RequestQueue = RequestQueue;
