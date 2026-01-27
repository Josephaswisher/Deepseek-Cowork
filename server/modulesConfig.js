/**
 * 内置模块配置
 * 
 * 声明式配置 server/modules/ 下的内置模块
 * 由 modulesManager.js 加载和管理
 */

const logger = require('./utils/logger');

/**
 * 内置模块配置列表
 */
const modules = [
    {
        // 浏览器控制服务
        name: 'browser',
        module: './modules/browser',
        setupFunction: 'setupBrowserControlService',
        enabled: true,
        
        // 服务特性
        features: {
            hasRoutes: true,
            emitsEvents: true
        },
        
        // 生成初始化参数
        getOptions: (config) => ({
            browserControlConfig: config.browserControl,
            serverConfig: {
                host: config.server.host,
                port: config.server.port
            }
        }),
        
        // 事件监听配置
        events: {
            started: ({ serverInfo }) => {
                logger.info('浏览器控制服务器已启动');
                logger.info('配置摘要:', JSON.stringify(serverInfo.config, null, 2));
                if (serverInfo.connections?.extensionWebSocket?.enabled) {
                    logger.info(`浏览器扩展WebSocket: ${serverInfo.connections.extensionWebSocket.baseUrl}`);
                }
            },
            stopped: () => {
                logger.info('浏览器控制服务器已停止');
            },
            error: ({ type, error }) => {
                logger.error(`浏览器控制服务器错误 (${type}):`, error);
            }
        }
    },
    
    {
        // Explorer 文件浏览服务
        name: 'explorer',
        module: './modules/explorer',
        setupFunction: 'setupExplorerService',
        enabled: true,
        
        // 启用条件（通过配置控制）
        enabledCondition: (config) => config.explorer?.enabled !== false,
        
        // 服务特性
        features: {
            hasRoutes: true,
            emitsEvents: true
        },
        
        // 生成初始化参数
        getOptions: (config) => ({
            explorerConfig: config.explorer,
            serverConfig: {
                host: config.server.host,
                port: config.server.port
            },
            appDir: global.rootDir || process.cwd()
        }),
        
        // 事件监听配置
        events: {
            started: ({ serverInfo }) => {
                logger.info('Explorer 服务已启动');
                logger.info('Explorer 配置摘要:', JSON.stringify(serverInfo.config, null, 2));
            },
            stopped: () => {
                logger.info('Explorer 服务已停止');
            },
            error: ({ type, error }) => {
                logger.error(`Explorer 服务错误 (${type}):`, error);
            },
            file_change: (data) => {
                logger.debug(`文件变化: ${data.type} - ${data.path}`);
            }
        }
    }
    
    // memory 模块目前在 server/bootstrap.js 中未被加载
    // 如需启用，可在此添加配置
];

module.exports = {
    modules
};
