/**
 * DeepSeek Cowork 服务编排启动模块
 * 
 * 负责初始化和启动所有服务模块
 */

const logger = require('./utils/logger');

// 服务实例存储
const services = {
    browserControl: null,
    explorer: null
};

/**
 * 获取所有服务实例
 */
function getServices() {
    return services;
}

/**
 * 获取单个服务实例
 * @param {string} name 服务名称
 */
function getService(name) {
    return services[name] || null;
}

/**
 * 初始化服务实例（在服务器启动前调用）
 * @param {Object} config 配置对象
 */
function initServices(config) {
    // 导入服务模块
    const { setupBrowserControlService } = require('./modules/browser');
    const { setupExplorerService } = require('./modules/explorer');

    // 创建浏览器控制服务实例
    services.browserControl = setupBrowserControlService({
        browserControlConfig: config.browserControl,
        serverConfig: {
            host: config.server.host,
            port: config.server.port
        }
    });

    // 创建 Explorer 服务实例
    if (config.explorer?.enabled !== false) {
        services.explorer = setupExplorerService({
            explorerConfig: config.explorer,
            serverConfig: {
                host: config.server.host,
                port: config.server.port
            },
            appDir: global.rootDir || process.cwd()
        });
    }

    return getServices();
}

/**
 * 启动所有服务
 * @param {Object} context 启动上下文
 */
async function bootstrapServices({ app, io, http, config, PORT }) {
    // 启动浏览器控制服务
    try {
        logger.info('正在启动浏览器控制服务...');
        
        // 初始化服务器
        await services.browserControl.init();
        
        // 设置路由
        services.browserControl.setupRoutes(app);
        
        // 启动服务器
        await services.browserControl.start();
        
        // 添加事件监听器
        services.browserControl.on('started', ({ serverInfo }) => {
            logger.info('浏览器控制服务器已启动');
            logger.info('配置摘要:', JSON.stringify(serverInfo.config, null, 2));
            
            // 显示连接信息
            if (serverInfo.connections?.extensionWebSocket?.enabled) {
                logger.info(`浏览器扩展WebSocket: ${serverInfo.connections.extensionWebSocket.baseUrl}`);
            }
        });
        
        services.browserControl.on('stopped', () => {
            logger.info('浏览器控制服务器已停止');
        });
        
        services.browserControl.on('error', ({ type, error }) => {
            logger.error(`浏览器控制服务器错误 (${type}):`, error);
        });
        
    } catch (error) {
        logger.error('启动浏览器控制服务器时出错:', error);
    }

    // 启动 Explorer 服务
    if (services.explorer) {
        try {
            logger.info('正在启动 Explorer 服务...');
            
            // 初始化服务
            await services.explorer.init();
            
            // 设置路由
            services.explorer.setupRoutes(app);
            
            // 启动服务
            await services.explorer.start();
            
            // 添加事件监听器
            services.explorer.on('started', ({ serverInfo }) => {
                logger.info('Explorer 服务已启动');
                logger.info('Explorer 配置摘要:', JSON.stringify(serverInfo.config, null, 2));
            });
            
            services.explorer.on('stopped', () => {
                logger.info('Explorer 服务已停止');
            });
            
            services.explorer.on('error', ({ type, error }) => {
                logger.error(`Explorer 服务错误 (${type}):`, error);
            });
            
            services.explorer.on('file_change', (data) => {
                logger.debug(`文件变化: ${data.type} - ${data.path}`);
            });
            
        } catch (error) {
            logger.error('启动 Explorer 服务时出错:', error);
        }
    }
}

module.exports = {
    initServices,
    bootstrapServices,
    getServices,
    getService
};
