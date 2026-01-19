/**
 * 浏览器控制服务模块
 * 
 * 提供浏览器标签页控制功能，遵循标准服务模块接口
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { EventEmitter } = require('events');

// 导入模块内部组件
const Database = require('./database');
const TabsManager = require('./tabs-manager');
const CallbackManager = require('./callback-manager');
const Logger = require('./logger');
const { browserEventEmitter } = require('./event-emitter');
const { browserControlServerConfig } = require('./config');
const ExtensionWebSocketServer = require('./ExtensionWebSocketServer');

/**
 * 设置浏览器控制服务
 * @param {Object} options 配置选项
 * @returns {BrowserControlService} 浏览器控制服务实例
 */
function setupBrowserControlService(options = {}) {
  /**
   * 浏览器控制服务类
   */
  class BrowserControlService extends EventEmitter {
    constructor() {
      super();
      this.database = null;
      this.extensionWebSocketServer = null;
      this.tabsManager = null;
      this.callbackManager = null;
      this.config = null;
      this.isRunning = false;
    }

    /**
     * 初始化服务
     */
    async init() {
      try {
        // 初始化配置系统
        this.config = browserControlServerConfig.initialize({
          browserControlConfig: options.browserControlConfig,
          serverConfig: options.serverConfig
        });
        
        // 设置日志级别
        const logLevel = this.config.logging?.level || 'INFO';
        Logger.setLogLevel(logLevel);
        
        Logger.info('Browser control server config initialized:', browserControlServerConfig.getSummary());
        
        // 确保数据库目录存在
        const dbDir = path.isAbsolute(this.config.database.directory) 
          ? this.config.database.directory 
          : path.join(global.rootDir || process.cwd(), this.config.database.directory);
        
        if (!fs.existsSync(dbDir)) {
          fs.mkdirSync(dbDir, { recursive: true });
        }
        
        // 初始化数据库
        const dbPath = path.isAbsolute(this.config.database.path)
          ? this.config.database.path
          : path.join(global.rootDir || process.cwd(), this.config.database.path);
        
        this.database = new Database(dbPath);
        await this.database.initDb();
        
        // 创建回调管理器
        this.callbackManager = new CallbackManager(this.database);
        
        // 创建标签页管理器
        this.tabsManager = new TabsManager(this.database, this.callbackManager);
        
        // 创建浏览器扩展WebSocket服务器
        if (this.config.extensionWebSocket.enabled) {
          this.extensionWebSocketServer = new ExtensionWebSocketServer(this.database, {
            host: this.config.extensionWebSocket.host,
            port: this.config.extensionWebSocket.port,
            maxClients: this.config.extensionWebSocket.maxClients
          });
          this.extensionWebSocketServer.setTabsManager(this.tabsManager);
          this.extensionWebSocketServer.setCallbackManager(this.callbackManager);
          this.extensionWebSocketServer.setEventEmitter(this);
        }

        // Cookie管理改为完全手动模式
        Logger.info('Cookie retrieval in manual mode');
        
        // 连接browserEventEmitter事件到当前实例
        this.setupEventBridge();
        
        // 添加扩展连接检测
        this.setupExtensionConnectionMonitor();
        
        return true;
      } catch (error) {
        Logger.error(`Failed to initialize browser control server: ${error.message}`);
        this.emit('error', { type: 'initError', error });
        throw error;
      }
    }

    /**
     * 设置事件桥接
     */
    setupEventBridge() {
      Logger.info('Setting up browserEventEmitter event bridge');
      
      browserEventEmitter.on('browser_event', (event) => {
        try {
          this.emit(event.type, event.data);
          Logger.debug(`Event bridge: ${event.type}`);
        } catch (error) {
          Logger.error(`Event bridge failed: ${error.message}`);
        }
      });
      
      Logger.info('Event bridge setup complete');
    }

    /**
     * 设置扩展连接监控
     */
    setupExtensionConnectionMonitor() {
      if (!this.config.monitoring.enableConnectionMonitor) {
        return;
      }
      
      setInterval(() => {
        const extensionConnections = this.extensionWebSocketServer ? this.extensionWebSocketServer.getActiveClients() : 0;
        
        if (extensionConnections === 0) {
          if (this.config.extensionWebSocket.enabled) {
            Logger.warning(`No browser extension connected to WebSocket server (${this.config.extensionWebSocket.baseUrl})`);
          }
        } else {
          Logger.debug(`Detected ${extensionConnections} extension connection(s)`);
        }
      }, this.config.monitoring.connectionCheckInterval);
    }

    /**
     * 启动服务
     */
    async start() {
      try {
        Logger.info("Starting browser control server...");
        
        // 启动浏览器扩展WebSocket服务器
        if (this.extensionWebSocketServer && this.config.extensionWebSocket.enabled) {
          this.extensionWebSocketServer.start();
          Logger.info(`Browser extension WebSocket server started: ${this.config.extensionWebSocket.baseUrl}`);
        }
        
        this.isRunning = true;
        this.emit('started', { serverInfo: this.getStatus() });
        return true;
      } catch (error) {
        Logger.error('Failed to start browser control service:', error);
        this.emit('error', { type: 'startError', error });
        throw error;
      }
    }

    /**
     * 停止服务
     */
    async stop() {
      try {
        if (!this.extensionWebSocketServer) {
          Logger.info('Browser control server not started, no need to stop');
          return true;
        }
        
        Logger.info("Closing browser control server...");
        
        // 停止WebSocket服务器
        if (this.extensionWebSocketServer) {
          this.extensionWebSocketServer.stop();
          Logger.info('Browser extension WebSocket server stopped');
        }
        
        // 清理TabsManager资源
        if (this.tabsManager && typeof this.tabsManager.destroy === 'function') {
          this.tabsManager.destroy();
        }
        
        // 关闭数据库连接
        if (this.database) {
          await this.database.close();
        }
        
        this.isRunning = false;
        this.emit('stopped');
        return true;
      } catch (error) {
        Logger.error('Failed to stop browser control service:', error);
        this.emit('error', { type: 'stopError', error });
        throw error;
      }
    }
    
    /**
     * 设置路由
     * @param {Object} app Express 应用实例
     */
    setupRoutes(app) {
      // 设置静态文件服务
      app.use('/browser-assets', express.static(path.join(__dirname, './html')));
      
      // 主页/控制面板
      app.get('/browser', (req, res) => {
        res.removeHeader('Content-Type');
        res.sendFile(path.join(__dirname, './html/index.html'));
      });
      
      // API路由前缀
      const apiRouter = express.Router();
      
      // 启用 CORS
      apiRouter.use(cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Accept']
      }));
      
      app.use('/api/browser', apiRouter);
      
      // 获取服务器配置信息
      apiRouter.get('/config', (req, res) => {
        res.json({
          status: 'success',
          config: {
            server: {
              host: this.config.server.host,
              port: this.config.server.port,
              baseUrl: this.config.server.baseUrl
            },
            extensionWebSocket: {
              enabled: this.config.extensionWebSocket.enabled,
              host: this.config.extensionWebSocket.host,
              port: this.config.extensionWebSocket.port,
              baseUrl: this.config.extensionWebSocket.baseUrl
            },
            websocketAddress: this.config.extensionWebSocket.baseUrl,
            host: this.config.extensionWebSocket.host,
            extensionPort: this.config.extensionWebSocket.port
          }
        });
      });
      
      // 获取服务状态
      apiRouter.get('/status', (req, res) => {
        res.json({
          status: 'success',
          data: this.getStatus()
        });
      });
      
      // 获取所有标签页
      apiRouter.get('/tabs', async (req, res) => {
        try {
          if (!this.tabsManager) {
            return res.status(500).json({ 
              status: 'error', 
              message: '标签页管理器不可用',
              needsCallback: false
            });
          }
          
          const tabsData = await this.tabsManager.getTabs();
          res.json({
            ...tabsData,
            status: 'success',
            needsCallback: false
          });
        } catch (err) {
          Logger.error(`Failed to get tabs: ${err.message}`);
          res.status(500).json({ 
            status: 'error', 
            message: '无法获取标签页数据',
            needsCallback: false
          });
        }
      });
      
      // SSE 事件接口
      apiRouter.get('/events', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        res.write(':\n\n');
        
        const createEventHandler = (eventType) => {
          return (data) => {
            try {
              res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
            } catch (err) {
              Logger.error(`Error sending ${eventType} event: ${err.message}`);
            }
          };
        };
        
        const eventTypes = [
          'tabs_update', 'tab_opened', 'tab_closed', 'tab_url_changed',
          'tab_html_received', 'script_executed', 'css_injected',
          'cookies_received', 'error', 'init', 'custom_event'
        ];
        
        const eventHandlers = {};
        
        eventTypes.forEach(type => {
          eventHandlers[type] = createEventHandler(type);
          this.on(type, eventHandlers[type]);
        });
        
        res.write(`event: connected\ndata: ${JSON.stringify({
          message: 'SSE连接已建立',
          timestamp: new Date().toISOString()
        })}\n\n`);
        
        const heartbeatInterval = setInterval(() => {
          res.write(':\n\n');
        }, 30000);
        
        req.on('close', () => {
          clearInterval(heartbeatInterval);
          eventTypes.forEach(type => {
            if (eventHandlers[type]) {
              this.removeListener(type, eventHandlers[type]);
            }
          });
          Logger.info('SSE client disconnected');
        });
      });
      
      // 打开或更改标签页URL
      apiRouter.post('/open_url', async (req, res) => {
        const { url, tabId, requestId, callbackUrl, windowId } = req.body;
        
        if (!url) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'url'参数" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'open_url',
          url: url,
          tabId: tabId,
          windowId: windowId,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 关闭标签页
      apiRouter.post('/close_tab', async (req, res) => {
        const { tabId, requestId, callbackUrl } = req.body;
        
        if (!tabId) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'close_tab',
          tabId: tabId,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 获取标签页HTML
      apiRouter.post('/get_html', async (req, res) => {
        const { tabId, requestId, callbackUrl } = req.body;
        
        if (!tabId) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'get_html',
          tabId: tabId,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 执行脚本
      apiRouter.post('/execute_script', async (req, res) => {
        const { tabId, code, requestId, callbackUrl } = req.body;
        
        if (!tabId || !code) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'或'code'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'execute_script',
          tabId: tabId,
          code: code,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 注入CSS
      apiRouter.post('/inject_css', async (req, res) => {
        const { tabId, css, requestId, callbackUrl } = req.body;
        
        if (!tabId || !css) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'或'css'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'inject_css',
          tabId: tabId,
          css: css,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        res.json(result);
      });
      
      // 获取cookies
      apiRouter.post('/get_cookies', async (req, res) => {
        const { tabId, requestId, callbackUrl } = req.body;
        
        if (!tabId) {
          return res.status(400).json({ 
            status: 'error', 
            message: "请求中缺少'tabId'" 
          });
        }
        
        if (!this.extensionWebSocketServer) {
          return res.status(500).json({ 
            status: 'error', 
            message: 'WebSocket服务器不可用' 
          });
        }
        
        const finalRequestId = requestId || uuidv4();
        
        if (this.callbackManager) {
          await this.callbackManager.registerCallback(finalRequestId, callbackUrl || '_internal');
        }
        
        const result = await this.extensionWebSocketServer.sendMessage({
          type: 'get_cookies',
          tabId: tabId,
          requestId: finalRequestId
        });
        
        result.needsCallback = true;
        result.requestId = finalRequestId;
        res.json(result);
      });
      
      // 保存cookies
      apiRouter.post('/save_cookies', async (req, res) => {
        const { tabId, cookies, url } = req.body;
        
        if (!tabId) {
          return res.status(400).json({ 
            status: 'error', 
            message: '缺少必需的参数: tabId',
            needsCallback: false
          });
        }
        
        if (!Array.isArray(cookies)) {
          return res.status(400).json({ 
            status: 'error', 
            message: '缺少必需的参数: cookies (必须是数组)',
            needsCallback: false
          });
        }
        
        try {
          if (!this.tabsManager) {
            return res.status(500).json({ 
              status: 'error', 
              message: '标签页管理器不可用',
              needsCallback: false
            });
          }
          
          const saveResult = await this.tabsManager.saveCookies(tabId, cookies);
          
          if (!saveResult) {
            return res.status(500).json({
              status: 'error',
              message: 'Cookie保存到数据库失败',
              needsCallback: false
            });
          }
          
          res.json({
            status: 'success',
            message: `成功保存 ${cookies.length} 个cookies`,
            needsCallback: false
          });
          
        } catch (error) {
          Logger.error(`Error saving cookies: ${error.message}`);
          res.status(500).json({ 
            status: 'error', 
            message: error.message,
            needsCallback: false
          });
        }
      });

      // 获取所有cookies
      apiRouter.get('/cookies', async (req, res) => {
        const { domain, name, limit = 100, offset = 0 } = req.query;
        
        if (!this.database) {
          return res.status(500).json({ 
            status: 'error', 
            message: '数据库不可用',
            needsCallback: false
          });
        }
        
        try {
          let query = 'SELECT * FROM cookies';
          let params = [];
          const conditions = [];
          
          if (domain) {
            conditions.push('domain LIKE ?');
            params.push(`%${domain}%`);
          }
          
          if (name) {
            conditions.push('name LIKE ?');
            params.push(`%${name}%`);
          }
          
          if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
          }
          
          query += ' ORDER BY domain, name';
          query += ' LIMIT ? OFFSET ?';
          params.push(parseInt(limit), parseInt(offset));
          
          const cookies = await this.database.all(query, params);
          
          const formattedCookies = cookies.map(cookie => ({
            id: cookie.id,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path,
            secure: Boolean(cookie.secure),
            httpOnly: Boolean(cookie.http_only),
            sameSite: cookie.same_site,
            expirationDate: cookie.expiration_date,
            session: Boolean(cookie.session),
            storeId: cookie.store_id,
            createdAt: cookie.created_at,
            updatedAt: cookie.updated_at
          }));
          
          res.json({
            status: 'success',
            cookies: formattedCookies,
            total: formattedCookies.length,
            pagination: { limit: parseInt(limit), offset: parseInt(offset) },
            needsCallback: false
          });
        } catch (err) {
          Logger.error(`Failed to get all cookies: ${err.message}`);
          res.status(500).json({ 
            status: 'error', 
            message: '获取cookies失败',
            needsCallback: false
          });
        }
      });
      
      // 获取回调响应
      apiRouter.get('/callback_response/:requestId', async (req, res) => {
        const { requestId } = req.params;
        
        if (!requestId) {
          return res.status(400).json({ 
            status: 'error', 
            message: "缺少请求ID参数" 
          });
        }
        
        if (!this.callbackManager) {
          return res.status(500).json({ 
            status: 'error', 
            message: '回调管理器不可用' 
          });
        }
        
        try {
          const response = await this.callbackManager.getCallbackResponse(requestId);
          if (response) {
            res.json(response);
          } else {
            res.status(404).json({ 
              status: 'error', 
              message: '未找到给定请求ID的响应' 
            });
          }
        } catch (err) {
          Logger.error(`获取回调响应出错: ${err.message}`);
          res.status(500).json({ 
            status: 'error', 
            message: '获取回调响应失败' 
          });
        }
      });
      
      this.emit('routesSetup', { app });
      return app;
    }
    
    /**
     * 获取服务状态
     */
    getStatus() {
      return {
        isRunning: this.isRunning,
        config: browserControlServerConfig.getSummary(),
        connections: {
          extensionWebSocket: {
            enabled: this.config?.extensionWebSocket?.enabled || false,
            activeConnections: this.extensionWebSocketServer ? this.extensionWebSocketServer.getActiveClients() : 0,
            port: this.config?.extensionWebSocket?.port,
            baseUrl: this.config?.extensionWebSocket?.baseUrl
          },
        },
        extensionWsPort: this.config?.extensionWebSocket?.port,
        activeExtensionConnections: this.extensionWebSocketServer ? this.extensionWebSocketServer.getActiveClients() : 0
      };
    }
    
    /**
     * 获取标签页管理器
     */
    getTabsManager() {
      return this.tabsManager;
    }
    
    /**
     * 获取 ExtensionWebSocketServer 实例
     */
    getExtensionWebSocketServer() {
      return this.extensionWebSocketServer;
    }
    
    /**
     * 获取数据库实例
     */
    getDatabase() {
      return this.database;
    }
    
    /**
     * 获取配置
     */
    getConfig() {
      return this.config;
    }
  }

  return new BrowserControlService();
}

// 导出模块
module.exports = { 
    setupBrowserControlService,
    ExtensionWebSocketServer
};
