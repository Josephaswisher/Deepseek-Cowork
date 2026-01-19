/**
 * 浏览器扩展WebSocket服务器类
 * 
 * 负责与浏览器扩展的 WebSocket 通信
 */

const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const Logger = require('./logger');
const { browserEventEmitter } = require('./event-emitter');

/**
 * 浏览器扩展WebSocket服务器类
 */
class ExtensionWebSocketServer {
    constructor(database, options = {}) {
        this.host = options.host || process.env.WEBSOCKET_HOST || 'localhost';
        this.port = options.port || 8080;
        this.maxClients = options.maxClients || 1;
        this.database = database;
        this.tabsManager = null;
        this.callbackManager = null;
        this.eventEmitter = null;
        this.server = null;
        this.activeConnections = new Map();
        this.pendingResponses = new Map();
        this.isShuttingDown = false;  // 关闭标志，防止关闭过程中写入数据库
    }

    /**
     * 设置标签页管理器
     * @param {Object} tabsManager 标签页管理器
     */
    setTabsManager(tabsManager) {
        this.tabsManager = tabsManager;
    }

    /**
     * 设置回调管理器
     * @param {Object} callbackManager 回调管理器
     */
    setCallbackManager(callbackManager) {
        this.callbackManager = callbackManager;
    }

    /**
     * 设置事件发射器
     * @param {EventEmitter} eventEmitter 事件发射器
     */
    setEventEmitter(eventEmitter) {
        this.eventEmitter = eventEmitter;
    }

    /**
     * 启动WebSocket服务器
     */
    start() {
        this.server = new WebSocket.Server({
            host: this.host,
            port: this.port
        });

        Logger.info(`Extension WebSocket server starting on ws://${this.host}:${this.port}`);

        this.server.on('connection', async (socket, request) => {
            await this.handleConnection(socket, request);
        });

        this.server.on('error', (error) => {
            Logger.error(`Extension WebSocket server error: ${error.message}`);
        });

        // 定期清理断开的连接
        setInterval(() => this.cleanupDisconnectedClients(), 30000);
    }

    /**
     * 处理新的WebSocket连接
     * @param {WebSocket} socket WebSocket连接
     * @param {Object} request HTTP请求
     */
    async handleConnection(socket, request) {
        try {
            await this.cleanupDisconnectedClients();

            // 检查连接类型 - 通过URL参数或header区分
            const url = new URL(request.url, `ws://${request.headers.host}`);
            const clientType = url.searchParams.get('type') || 'extension';
            
            if (clientType === 'automation') {
                await this.handleAutomationClient(socket, request);
            } else {
                await this.handleExtensionClient(socket, request);
            }
        } catch (err) {
            Logger.error(`Error handling WebSocket connection: ${err.message}`);
        }
    }

    /**
     * 处理浏览器扩展客户端连接
     */
    async handleExtensionClient(socket, request) {
        // 检查扩展客户端连接数限制
        if (this.activeConnections.size >= this.maxClients) {
            Logger.warning('Maximum extension client connections reached.');
            socket.close(1013, 'Maximum extension client connections reached.');
            return;
        }

        const clientId = uuidv4();
        const clientAddress = `${request.socket.remoteAddress}:${request.socket.remotePort}`;
        
        Logger.info(`Browser extension connected: ${clientAddress} (ID: ${clientId})`);
        
        await this.storeClient(clientId, clientAddress, 'extension');
        this.activeConnections.set(clientId, socket);

        socket.on('message', async (message) => {
            await this.handleMessage(message, clientId);
        });

        socket.on('close', async () => {
            Logger.info(`Browser extension disconnected: ${clientAddress} (ID: ${clientId})`);
            await this.updateClientDisconnected(clientId);
            this.activeConnections.delete(clientId);
        });

        socket.on('error', async (error) => {
            Logger.error(`Browser extension error for ${clientId}: ${error.message}`);
            await this.updateClientDisconnected(clientId);
            this.activeConnections.delete(clientId);
        });
    }

    /**
     * 处理automation客户端连接
     */
    async handleAutomationClient(socket, request) {
        const clientId = uuidv4();
        const clientAddress = `${request.socket.remoteAddress}:${request.socket.remotePort}`;
        
        Logger.info(`Automation client connected: ${clientAddress} (ID: ${clientId})`);
        
        await this.storeClient(clientId, clientAddress, 'automation_client');
        this.activeConnections.set(clientId, socket);

        socket.on('message', async (message) => {
            await this.handleAutomationMessage(message, clientId, socket);
        });

        socket.on('close', async () => {
            Logger.info(`Automation client disconnected: ${clientAddress} (ID: ${clientId})`);
            await this.updateClientDisconnected(clientId);
            this.activeConnections.delete(clientId);
        });

        socket.on('error', async (error) => {
            Logger.error(`Automation client error for ${clientId}: ${error.message}`);
            await this.updateClientDisconnected(clientId);
            this.activeConnections.delete(clientId);
        });

        // 发送欢迎消息
        this.sendToAutomationClient(socket, {
            type: 'connection_established',
            clientId: clientId,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 处理automation客户端消息
     */
    async handleAutomationMessage(message, clientId, socket) {
        try {
            const data = JSON.parse(message);
            const { type, requestId } = data;

            Logger.info(`Received automation message: ${type} from ${clientId}`);

            switch (type) {
                case 'get_tabs':
                    await this.handleGetTabsRequest(data, socket);
                    break;
                case 'open_url':
                    await this.handleOpenUrlRequest(data, socket);
                    break;
                case 'close_tab':
                    await this.handleCloseTabRequest(data, socket);
                    break;
                case 'get_html':
                    await this.handleGetHtmlRequest(data, socket);
                    break;
                case 'execute_script':
                    await this.handleExecuteScriptRequest(data, socket);
                    break;
                case 'inject_css':
                    await this.handleInjectCssRequest(data, socket);
                    break;
                case 'get_cookies':
                    await this.handleGetCookiesRequest(data, socket);
                    break;
                case 'subscribe_events':
                    await this.handleSubscribeEventsRequest(data, socket, clientId);
                    break;
                case 'unsubscribe_events':
                    await this.handleUnsubscribeEventsRequest(data, socket, clientId);
                    break;
                default:
                    this.sendToAutomationClient(socket, {
                        type: 'error',
                        requestId,
                        message: `Unknown message type: ${type}`
                    });
                    break;
            }
        } catch (err) {
            Logger.error(`Error handling automation message: ${err.message}`);
            this.sendToAutomationClient(socket, {
                type: 'error',
                message: `Invalid message format: ${err.message}`
            });
        }
    }

    /**
     * 处理获取标签页请求
     */
    async handleGetTabsRequest(data, socket) {
        try {
            if (!this.tabsManager) {
                throw new Error('标签页管理器不可用');
            }

            const tabsData = await this.tabsManager.getTabs();
            this.sendToAutomationClient(socket, {
                type: 'get_tabs_response',
                requestId: data.requestId,
                status: 'success',
                data: tabsData
            });
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'get_tabs_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理打开URL请求
     */
    async handleOpenUrlRequest(data, socket) {
        try {
            const { url, tabId, windowId, requestId } = data;
            
            if (!url) {
                throw new Error("缺少'url'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal');
            }

            this.pendingResponses.set(requestId, socket);

            const result = await this.sendToExtensions({
                type: 'open_url',
                url: url,
                tabId: tabId,
                windowId: windowId,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.pendingResponses.delete(requestId);
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'open_url_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理关闭标签页请求
     */
    async handleCloseTabRequest(data, socket) {
        try {
            const { tabId, requestId } = data;
            
            if (!tabId) {
                throw new Error("缺少'tabId'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal');
            }

            this.pendingResponses.set(requestId, socket);

            const result = await this.sendToExtensions({
                type: 'close_tab',
                tabId: tabId,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.pendingResponses.delete(requestId);
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'close_tab_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理获取HTML请求
     */
    async handleGetHtmlRequest(data, socket) {
        try {
            const { tabId, requestId } = data;
            
            if (!tabId) {
                throw new Error("缺少'tabId'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal');
            }

            this.pendingResponses.set(requestId, socket);

            const result = await this.sendToExtensions({
                type: 'get_html',
                tabId: tabId,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.pendingResponses.delete(requestId);
                throw new Error(result.message);
            }

            // 启动轮询等待CallbackManager响应
            this.waitForCallbackResponse(requestId, socket);
            
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'get_html_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理执行脚本请求
     */
    async handleExecuteScriptRequest(data, socket) {
        try {
            const { tabId, code, requestId } = data;
            
            if (!tabId || !code) {
                throw new Error("缺少'tabId'或'code'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal');
            }

            this.pendingResponses.set(requestId, socket);

            const result = await this.sendToExtensions({
                type: 'execute_script',
                tabId: tabId,
                code: code,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.pendingResponses.delete(requestId);
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'execute_script_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理注入CSS请求
     */
    async handleInjectCssRequest(data, socket) {
        try {
            const { tabId, css, requestId } = data;
            
            if (!tabId || !css) {
                throw new Error("缺少'tabId'或'css'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal');
            }

            this.pendingResponses.set(requestId, socket);

            const result = await this.sendToExtensions({
                type: 'inject_css',
                tabId: tabId,
                css: css,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.pendingResponses.delete(requestId);
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'inject_css_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理获取Cookies请求
     */
    async handleGetCookiesRequest(data, socket) {
        try {
            const { tabId, requestId } = data;
            
            if (!tabId) {
                throw new Error("缺少'tabId'参数");
            }

            if (this.callbackManager) {
                await this.callbackManager.registerCallback(requestId, '_internal');
            }

            this.pendingResponses.set(requestId, socket);

            const result = await this.sendToExtensions({
                type: 'get_cookies',
                tabId: tabId,
                requestId: requestId
            });

            if (result.status === 'error') {
                this.pendingResponses.delete(requestId);
                throw new Error(result.message);
            }
        } catch (error) {
            this.sendToAutomationClient(socket, {
                type: 'get_cookies_response',
                requestId: data.requestId,
                status: 'error',
                message: error.message
            });
        }
    }

    /**
     * 处理事件订阅请求
     */
    async handleSubscribeEventsRequest(data, socket, clientId) {
        const { events = [], requestId } = data;
        
        // 为客户端注册事件监听器
        if (!socket.eventListeners) {
            socket.eventListeners = new Map();
        }

        events.forEach(eventType => {
            if (!socket.eventListeners.has(eventType)) {
                const listener = (eventData) => {
                    this.sendToAutomationClient(socket, {
                        type: 'event',
                        event: eventType,
                        data: eventData
                    });
                };
                
                socket.eventListeners.set(eventType, listener);
                if (this.eventEmitter) {
                    this.eventEmitter.on(eventType, listener);
                }
            }
        });

        this.sendToAutomationClient(socket, {
            type: 'subscribe_events_response',
            requestId: requestId,
            status: 'success',
            subscribedEvents: events
        });
    }

    /**
     * 处理事件取消订阅请求
     */
    async handleUnsubscribeEventsRequest(data, socket, clientId) {
        const { events = [], requestId } = data;
        
        if (socket.eventListeners) {
            events.forEach(eventType => {
                const listener = socket.eventListeners.get(eventType);
                if (listener && this.eventEmitter) {
                    this.eventEmitter.removeListener(eventType, listener);
                    socket.eventListeners.delete(eventType);
                }
            });
        }

        this.sendToAutomationClient(socket, {
            type: 'unsubscribe_events_response',
            requestId: requestId,
            status: 'success',
            unsubscribedEvents: events
        });
    }

    /**
     * 等待回调响应并转发给 WebSocket 客户端
     */
    waitForCallbackResponse(requestId, socket) {
        const maxWaitTime = 60000; // 60秒超时
        const checkInterval = 100; // 每100ms检查一次
        let elapsedTime = 0;

        const checkResponse = async () => {
            if (elapsedTime >= maxWaitTime) {
                this.pendingResponses.delete(requestId);
                this.sendToAutomationClient(socket, {
                    type: 'get_html_response',
                    requestId: requestId,
                    status: 'error',
                    message: '请求超时'
                });
                return;
            }

            if (this.callbackManager) {
                const response = await this.callbackManager.getCallbackResponse(requestId);
                if (response) {
                    this.pendingResponses.delete(requestId);
                    this.sendToAutomationClient(socket, {
                        type: 'get_html_response',
                        requestId: requestId,
                        status: 'success',
                        data: response
                    });
                    return;
                }
            }

            elapsedTime += checkInterval;
            setTimeout(checkResponse, checkInterval);
        };

        checkResponse();
    }

    /**
     * 向automation客户端发送消息
     */
    sendToAutomationClient(socket, message) {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(message));
        }
    }

    /**
     * 向所有automation客户端广播消息
     */
    broadcastToAutomationClients(message) {
        this.activeConnections.forEach((socket, clientId) => {
            if (socket.readyState === WebSocket.OPEN) {
                this.sendToAutomationClient(socket, message);
            }
        });
    }

    /**
     * 向浏览器扩展发送消息
     */
    async sendToExtensions(message) {
        try {
            if (this.activeConnections.size === 0) {
                return { 
                    status: 'error', 
                    message: 'No active browser extension connections' 
                };
            }

            let sentCount = 0;
            for (const [clientId, socket] of this.activeConnections.entries()) {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(message));
                    sentCount++;
                }
            }

            return { 
                status: 'success', 
                message: `Message sent to ${sentCount} extensions`,
                requestId: message.requestId,
                needsCallback: true
            };
        } catch (err) {
            Logger.error(`Error sending message to extensions: ${err.message}`);
            return { 
                status: 'error', 
                message: `Failed to send message: ${err.message}`,
                needsCallback: false
            };
        }
    }

    /**
     * 处理浏览器扩展消息
     * @param {string} message 接收到的消息
     * @param {string} clientId 客户端ID
     */
    async handleMessage(message, clientId) {
        try {
            const data = JSON.parse(message);

            // 处理错误消息
            if (data.type === 'error') {
                const requestId = data.requestId;
                const errorMessage = data.message || 'Unknown error';
                Logger.error(`Received error message from extension ${clientId}: ${errorMessage}`);
                
                if (requestId && this.callbackManager) {
                    await this.callbackManager.postToCallback(requestId, {
                        status: 'error',
                        type: 'error',
                        message: errorMessage,
                        requestId
                    });
                }
                
                // 广播错误事件
                if (this.eventEmitter) {
                    this.eventEmitter.emit('error', {
                        message: errorMessage,
                        requestId
                    });
                }
                
                browserEventEmitter.emitBrowserEvent('error', {
                    message: errorMessage,
                    requestId
                });
                
                return;
            }

            // 处理初始化消息
            if (data.type === 'init') {
                Logger.info('Received init message from extension.');
                
                if (this.eventEmitter) {
                    this.eventEmitter.emit('init', {
                        timestamp: new Date().toISOString()
                    });
                }
                
                browserEventEmitter.emitBrowserEvent('init', {
                    timestamp: new Date().toISOString()
                });
                
                return;
            }

            // 处理标签页数据更新
            if (data.type === 'data' && this.tabsManager) {
                const tabs = data.payload?.tabs || [];
                const active_tab_id = data.payload?.active_tab_id;
                
                await this.tabsManager.updateTabs(tabs, active_tab_id);
                
                if (this.eventEmitter) {
                    this.eventEmitter.emit('tabs_update', {
                        tabs: tabs,
                        active_tab_id: active_tab_id,
                        timestamp: new Date().toISOString()
                    });
                }
                
                browserEventEmitter.emitBrowserEvent('tabs_update', {
                    tabs: tabs,
                    active_tab_id: active_tab_id,
                    timestamp: new Date().toISOString()
                });
                
                return;
            }

            // 其他消息必须包含requestId
            if (!data.requestId) {
                Logger.warning(`Message from extension ${clientId} does not contain requestId: ${JSON.stringify(data)}`);
                return;
            }

            const requestId = data.requestId;

            // 根据消息类型处理和转发
            switch (data.type) {
                case 'open_url_complete':
                    if (data.cookies && this.tabsManager) {
                        await this.tabsManager.saveCookies(data.tabId, data.cookies);
                    }
                    
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, {
                            status: 'success',
                            type: 'open_url_complete',
                            tabId: data.tabId,
                            url: data.url,
                            cookies: data.cookies || [],
                            requestId
                        });
                    }

                    const isNewTab = data.isNewTab !== undefined ? data.isNewTab : !data.originalTabId;
                    const eventType = isNewTab ? 'tab_opened' : 'tab_url_changed';
                    
                    if (this.eventEmitter) {
                        this.eventEmitter.emit(eventType, {
                            tabId: data.tabId,
                            url: data.url,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent(eventType, {
                        tabId: data.tabId,
                        url: data.url,
                        timestamp: new Date().toISOString()
                    });
                    break;

                case 'tab_html_chunk':
                    if (this.tabsManager) {
                        await this.tabsManager.handleHtmlChunk(data, requestId);
                    }
                    break;

                case 'close_tab_complete':
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, {
                            status: 'success',
                            type: 'close_tab_complete',
                            tabId: data.tabId,
                            requestId
                        });
                    }

                    if (this.eventEmitter) {
                        this.eventEmitter.emit('tab_closed', {
                            tabId: data.tabId,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('tab_closed', {
                        tabId: data.tabId,
                        timestamp: new Date().toISOString()
                    });
                    break;

                case 'tab_html_complete':
                    if (this.tabsManager) {
                        await this.tabsManager.handleTabHtmlComplete(data, requestId);
                    }

                    if (this.eventEmitter) {
                        this.eventEmitter.emit('tab_html_received', {
                            tabId: data.tabId,
                            htmlLength: data.html ? data.html.length : 0,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('tab_html_received', {
                        tabId: data.tabId,
                        htmlLength: data.html ? data.html.length : 0,
                        timestamp: new Date().toISOString()
                    });
                    break;

                case 'execute_script_complete':
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, {
                            status: 'success',
                            type: 'execute_script_complete',
                            tabId: data.tabId,
                            result: data.result,
                            requestId
                        });
                    }

                    if (this.eventEmitter) {
                        this.eventEmitter.emit('script_executed', {
                            tabId: data.tabId,
                            result: data.result,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('script_executed', {
                        tabId: data.tabId,
                        result: data.result,
                        timestamp: new Date().toISOString()
                    });
                    break;

                case 'inject_css_complete':
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, {
                            status: 'success',
                            type: 'inject_css_complete',
                            tabId: data.tabId,
                            requestId
                        });
                    }

                    if (this.eventEmitter) {
                        this.eventEmitter.emit('css_injected', {
                            tabId: data.tabId,
                            timestamp: new Date().toISOString()
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('css_injected', {
                        tabId: data.tabId,
                        timestamp: new Date().toISOString()
                    });
                    break;

                case 'get_cookies_complete':
                    Logger.info(`Received get_cookies_complete message: tabId=${data.tabId}, cookies count=${data.cookies ? data.cookies.length : 0}`);
                    
                    let cookieAnalysis = null;
                    if (data.cookies && data.cookies.length > 0) {
                        cookieAnalysis = this.analyzeCookieCompleteness(data.cookies, data.url);
                        Logger.info(`[Cookie分析] 标签页 ${data.tabId} 获取到 ${data.cookies.length} 个cookies`);
                    }
                    
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, {
                            status: 'success',
                            type: 'get_cookies_complete',
                            tabId: data.tabId,
                            url: data.url,
                            cookies: data.cookies || [],
                            analysis: cookieAnalysis,
                            requestId
                        });
                    }

                    browserEventEmitter.emitBrowserEvent('cookies_received', {
                        tabId: data.tabId,
                        url: data.url,
                        cookies: data.cookies || [],
                        analysis: cookieAnalysis,
                        requestId: requestId,
                        timestamp: new Date().toISOString()
                    });
                    break;

                case 'upload_file_to_tab_complete':
                    Logger.info(`Received upload_file_to_tab_complete message: tabId=${data.tabId}, uploaded files=${data.uploadedFiles ? data.uploadedFiles.length : 0}`);
                    
                    if (this.callbackManager) {
                        await this.callbackManager.postToCallback(requestId, {
                            status: 'success',
                            type: 'upload_file_to_tab_complete',
                            tabId: data.tabId,
                            uploadedFiles: data.uploadedFiles || [],
                            targetSelector: data.targetSelector,
                            message: data.message || '文件上传完成',
                            requestId
                        });
                    }
                    
                    if (this.eventEmitter) {
                        this.eventEmitter.emit('file_uploaded', {
                            tabId: data.tabId,
                            uploadedFiles: data.uploadedFiles || [],
                            timestamp: new Date().toISOString()
                        });
                    }
                    
                    browserEventEmitter.emitBrowserEvent('file_uploaded', {
                        tabId: data.tabId,
                        uploadedFiles: data.uploadedFiles || [],
                        requestId: requestId,
                        timestamp: new Date().toISOString()
                    });
                    break;

                default:
                    Logger.warning(`Unknown message type from extension ${clientId}: ${data.type}`);
                    break;
            }

            // 如果有WebSocket客户端等待回调，直接发送给他们
            if (data.requestId && this.callbackManager) {
                const callbackUrl = await this.callbackManager.getCallbackUrl(data.requestId);
                if (callbackUrl === '_websocket_internal') {
                    this.broadcastToAutomationClients({
                        type: `${data.type.replace('_complete', '_response')}`,
                        requestId: data.requestId,
                        status: 'success',
                        data: data
                    });
                }
            }
        } catch (err) {
            Logger.error(`Error handling extension message from ${clientId}: ${err.message}`);
        }
    }

    /**
     * 向所有活动连接发送消息
     * @param {Object} message 要发送的消息
     * @returns {Object} 操作结果
     */
    async sendMessage(message) {
        try {
            if (this.activeConnections.size === 0) {
                return { 
                    status: 'error', 
                    message: 'No active WebSocket connections' 
                };
            }

            let sentCount = 0;
            for (const [clientId, socket] of this.activeConnections.entries()) {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify(message));
                    sentCount++;
                } else {
                    Logger.warning(`Skipping client ${clientId} - Socket not in OPEN state.`);
                }
            }

            return { 
                status: 'success', 
                message: `Message sent to ${sentCount} clients`,
                requestId: message.requestId,
                needsCallback: true
            };
        } catch (err) {
            Logger.error(`Error sending WebSocket message: ${err.message}`);
            return { 
                status: 'error', 
                message: `Failed to send message: ${err.message}`,
                needsCallback: false
            };
        }
    }

    /**
     * 获取活动客户端连接数
     * @returns {number} 活动连接数
     */
    getActiveClients() {
        return this.activeConnections.size;
    }

    /**
     * 将客户端信息存储到数据库
     * @param {string} clientId 客户端ID
     * @param {string} address 客户端地址
     * @param {string} clientType 客户端类型 (extension, automation)
     */
    async storeClient(clientId, address, clientType = 'extension') {
        // 如果正在关闭，跳过数据库写入
        if (this.isShuttingDown) {
            Logger.debug(`Skipping client store for ${clientId} - server is shutting down`);
            return;
        }
        
        try {
            await this.database.run(
                'INSERT INTO websocket_clients (client_id, address, client_type) VALUES (?, ?, ?)',
                [clientId, address, clientType]
            );
            Logger.info(`Stored ${clientType} client ${clientId} in database.`);
        } catch (err) {
            Logger.error(`Error storing ${clientType} client ${clientId} in database: ${err.message}`);
        }
    }

    /**
     * 更新客户端断开连接时间
     * @param {string} clientId 客户端ID
     */
    async updateClientDisconnected(clientId) {
        // 如果正在关闭，跳过数据库更新以避免写入已关闭的数据库
        if (this.isShuttingDown) {
            Logger.debug(`Skipping disconnect update for client ${clientId} - server is shutting down`);
            return;
        }
        
        try {
            await this.database.run(
                'UPDATE websocket_clients SET disconnected_at = CURRENT_TIMESTAMP WHERE client_id = ?',
                [clientId]
            );
            Logger.info(`Updated disconnect time for client ${clientId} in database.`);
        } catch (err) {
            Logger.error(`Error updating disconnect time for client ${clientId}: ${err.message}`);
        }
    }

    /**
     * 清理断开连接的客户端
     */
    async cleanupDisconnectedClients() {
        // 如果正在关闭，跳过清理
        if (this.isShuttingDown) {
            return;
        }
        
        try {
            for (const [clientId, socket] of this.activeConnections.entries()) {
                if (socket.readyState !== WebSocket.OPEN) {
                    this.activeConnections.delete(clientId);
                    await this.updateClientDisconnected(clientId);
                    Logger.info(`Removed disconnected client ${clientId} from connection map.`);
                }
            }
        } catch (err) {
            Logger.error(`Error cleaning up disconnected clients: ${err.message}`);
        }
    }

    /**
     * 停止WebSocket服务器
     */
    stop() {
        // 设置关闭标志，防止 close 事件回调写入已关闭的数据库
        this.isShuttingDown = true;
        
        if (this.server) {
            this.server.close();
            this.server = null;

            for (const [clientId, socket] of this.activeConnections.entries()) {
                try {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.close(1000, 'Server shutting down');
                    }
                } catch (err) {
                    Logger.error(`Error closing WebSocket connection for client ${clientId}: ${err.message}`);
                }
            }
            
            this.activeConnections.clear();
            Logger.info('WebSocket server stopped.');
        }
    }

    /**
     * 分析Cookie完整性和质量
     * @param {Array} cookies Cookie数组
     * @param {string} url 页面URL
     * @returns {Object} 分析结果
     */
    analyzeCookieCompleteness(cookies, url) {
        const analysis = {
            domainStats: {},
            typeStats: {
                secure: 0,
                httpOnly: 0,
                session: 0,
                persistent: 0,
                sameSiteStrict: 0,
                sameSiteLax: 0,
                sameSiteNone: 0,
                thirdParty: 0,
                firstParty: 0
            },
            warnings: [],
            recommendations: []
        };

        if (!cookies || cookies.length === 0) {
            analysis.warnings.push('未获取到任何cookies');
            return analysis;
        }

        try {
            const urlObj = new URL(url);
            const mainDomain = urlObj.hostname;
            const parentDomain = mainDomain.split('.').slice(-2).join('.');

            cookies.forEach(cookie => {
                const domain = cookie.domain || 'unknown';
                
                analysis.domainStats[domain] = (analysis.domainStats[domain] || 0) + 1;
                
                if (cookie.secure) analysis.typeStats.secure++;
                if (cookie.httpOnly) analysis.typeStats.httpOnly++;
                if (cookie.session) analysis.typeStats.session++;
                else analysis.typeStats.persistent++;
                
                switch (cookie.sameSite) {
                    case 'strict':
                        analysis.typeStats.sameSiteStrict++;
                        break;
                    case 'lax':
                        analysis.typeStats.sameSiteLax++;
                        break;
                    case 'none':
                        analysis.typeStats.sameSiteNone++;
                        break;
                }
                
                if (domain === mainDomain || domain === `.${parentDomain}` || domain.endsWith(`.${parentDomain}`)) {
                    analysis.typeStats.firstParty++;
                } else {
                    analysis.typeStats.thirdParty++;
                }
            });

            const totalCookies = cookies.length;
            
            const hasFirstPartyCookies = analysis.typeStats.firstParty > 0;
            if (!hasFirstPartyCookies) {
                analysis.warnings.push('未检测到第一方cookies，可能存在获取不完整的问题');
            }
            
            if (totalCookies < 3) {
                analysis.warnings.push(`Cookie数量较少(${totalCookies}个)，可能未完全获取`);
            }
            
            const secureRatio = analysis.typeStats.secure / totalCookies;
            if (secureRatio < 0.5 && url.startsWith('https://')) {
                analysis.warnings.push(`HTTPS网站的安全cookies比例较低(${(secureRatio * 100).toFixed(1)}%)`);
            }

        } catch (error) {
            analysis.warnings.push(`Cookie分析时出错: ${error.message}`);
        }

        return analysis;
    }
}

module.exports = ExtensionWebSocketServer;
