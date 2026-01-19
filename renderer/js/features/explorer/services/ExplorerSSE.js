/**
 * ExplorerSSE - SSE 事件管理模块
 * 管理与 Explorer 服务的 SSE 连接，实现实时文件变化监听
 * 
 * @created 2026-01-15
 * @module features/explorer/services/ExplorerSSE
 */

class ExplorerSSE extends EventTarget {
  /**
   * 连接状态枚举
   */
  static ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting'
  };

  /**
   * 构造函数
   * @param {string} baseUrl - Explorer 服务基础 URL
   * @param {Object} options - 配置选项
   */
  constructor(baseUrl = 'http://localhost:3333', options = {}) {
    super();
    
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.eventSource = null;
    this.connectionState = ExplorerSSE.ConnectionState.DISCONNECTED;
    
    // 配置选项
    this.options = {
      autoReconnect: true,
      maxReconnectAttempts: 10,
      initialReconnectDelay: 1000,
      maxReconnectDelay: 30000,
      eventDebounceMs: 300,
      ...options
    };
    
    // 重连状态
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    
    // 事件防抖
    this.pendingEvents = new Map();
    this.debounceTimers = new Map();
  }

  /**
   * 获取 SSE 端点 URL
   * @returns {string} SSE 端点完整 URL
   */
  getEventsUrl() {
    return `${this.baseUrl}/api/explorer/events`;
  }

  /**
   * 连接到 SSE 服务
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.eventSource) {
        this.disconnect();
      }

      this.connectionState = ExplorerSSE.ConnectionState.CONNECTING;
      this.emitStateChange();

      try {
        this.eventSource = new EventSource(this.getEventsUrl());

        // 连接成功
        this.eventSource.addEventListener('connected', (event) => {
          this.connectionState = ExplorerSSE.ConnectionState.CONNECTED;
          this.reconnectAttempts = 0;
          this.emitStateChange();
          
          try {
            const data = JSON.parse(event.data);
            this.dispatchEvent(new CustomEvent('connected', { detail: data }));
          } catch (e) {
            this.dispatchEvent(new CustomEvent('connected', { detail: {} }));
          }
          
          resolve();
        });

        // 通用消息处理
        this.eventSource.onmessage = (event) => {
          this.handleMessage(event);
        };

        // 文件变化事件
        this.eventSource.addEventListener('file_change', (event) => {
          this.handleFileChangeEvent(event);
        });

        // 结构更新事件
        this.eventSource.addEventListener('structure_update', (event) => {
          this.handleStructureUpdateEvent(event);
        });

        // 错误处理
        this.eventSource.onerror = (error) => {
          console.error('[ExplorerSSE] Connection error:', error);
          
          if (this.eventSource.readyState === EventSource.CLOSED) {
            this.connectionState = ExplorerSSE.ConnectionState.DISCONNECTED;
            this.emitStateChange();
            this.dispatchEvent(new CustomEvent('disconnected', { detail: { reason: 'error' } }));
            
            if (this.options.autoReconnect) {
              this.scheduleReconnect();
            }
          }
          
          this.dispatchEvent(new CustomEvent('error', { detail: error }));
        };

        // 设置连接超时
        const timeoutTimer = setTimeout(() => {
          if (this.connectionState === ExplorerSSE.ConnectionState.CONNECTING) {
            console.error('[ExplorerSSE] Connection timeout');
            this.disconnect();
            reject(new Error('Connection timeout'));
          }
        }, 10000);
        
        // 清除超时定时器（如果连接成功）
        this.eventSource.addEventListener('connected', () => {
          clearTimeout(timeoutTimer);
        }, { once: true });

      } catch (error) {
        this.connectionState = ExplorerSSE.ConnectionState.DISCONNECTED;
        this.emitStateChange();
        reject(error);
      }
    });
  }

  /**
   * 断开 SSE 连接
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // 清理防抖计时器
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();
    this.pendingEvents.clear();

    this.connectionState = ExplorerSSE.ConnectionState.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.emitStateChange();
    this.dispatchEvent(new CustomEvent('disconnected', { detail: { reason: 'manual' } }));
  }

  /**
   * 手动重连
   * @returns {Promise<void>}
   */
  async reconnect() {
    this.disconnect();
    return this.connect();
  }

  /**
   * 计划重连（指数退避）
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.warn('[ExplorerSSE] Max reconnect attempts reached');
      this.dispatchEvent(new CustomEvent('reconnect_failed', { 
        detail: { attempts: this.reconnectAttempts } 
      }));
      return;
    }

    this.connectionState = ExplorerSSE.ConnectionState.RECONNECTING;
    this.emitStateChange();

    // 计算重连延迟（指数退避）
    const delay = Math.min(
      this.options.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.options.maxReconnectDelay
    );

    console.log(`[ExplorerSSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
        console.log('[ExplorerSSE] Reconnected successfully');
      } catch (error) {
        console.error('[ExplorerSSE] Reconnect failed:', error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  /**
   * 处理通用消息
   * @param {MessageEvent} event - 消息事件
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.dispatchEvent(new CustomEvent('message', { detail: data }));
    } catch (e) {
      // 忽略解析错误（可能是心跳）
    }
  }

  /**
   * 处理文件变化事件（带防抖）
   * @param {MessageEvent} event - SSE 事件
   */
  handleFileChangeEvent(event) {
    try {
      const data = JSON.parse(event.data);
      const key = `file_change:${data.path}:${data.type}`;
      
      // 存储最新的事件数据
      this.pendingEvents.set(key, data);
      
      // 清除旧的防抖计时器
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key));
      }
      
      // 设置新的防抖计时器
      this.debounceTimers.set(key, setTimeout(() => {
        const eventData = this.pendingEvents.get(key);
        if (eventData) {
          this.dispatchEvent(new CustomEvent('file_change', { detail: eventData }));
          this.pendingEvents.delete(key);
        }
        this.debounceTimers.delete(key);
      }, this.options.eventDebounceMs));
      
    } catch (e) {
      console.error('[ExplorerSSE] Error parsing file_change event:', e);
    }
  }

  /**
   * 处理结构更新事件（带防抖）
   * @param {MessageEvent} event - SSE 事件
   */
  handleStructureUpdateEvent(event) {
    try {
      const data = JSON.parse(event.data);
      const key = `structure_update:${data.watcherKey || 'default'}`;
      
      this.pendingEvents.set(key, data);
      
      if (this.debounceTimers.has(key)) {
        clearTimeout(this.debounceTimers.get(key));
      }
      
      this.debounceTimers.set(key, setTimeout(() => {
        const eventData = this.pendingEvents.get(key);
        if (eventData) {
          this.dispatchEvent(new CustomEvent('structure_update', { detail: eventData }));
          this.pendingEvents.delete(key);
        }
        this.debounceTimers.delete(key);
      }, this.options.eventDebounceMs));
      
    } catch (e) {
      console.error('[ExplorerSSE] Error parsing structure_update event:', e);
    }
  }

  /**
   * 发送状态变化事件
   */
  emitStateChange() {
    this.dispatchEvent(new CustomEvent('state_change', { 
      detail: { state: this.connectionState } 
    }));
  }

  /**
   * 检查是否已连接
   * @returns {boolean}
   */
  isConnected() {
    return this.connectionState === ExplorerSSE.ConnectionState.CONNECTED;
  }

  /**
   * 获取当前连接状态
   * @returns {string}
   */
  getConnectionState() {
    return this.connectionState;
  }

  /**
   * 更新基础 URL
   * @param {string} newBaseUrl - 新的基础 URL
   */
  setBaseUrl(newBaseUrl) {
    this.baseUrl = newBaseUrl.replace(/\/$/, '');
    if (this.isConnected()) {
      this.reconnect();
    }
  }
}

// 导出到全局（浏览器环境）
if (typeof window !== 'undefined') {
  window.ExplorerSSE = ExplorerSSE;
}
