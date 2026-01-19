/**
 * DeepSeek Cowork Server 主入口
 * 
 * 简洁的服务器入口文件，负责：
 * - 创建 Express 应用
 * - 加载配置
 * - 设置中间件
 * - 初始化服务
 * - 设置路由
 * - 启动监听
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// 设置全局根目录
global.rootDir = path.join(__dirname, '..');

// 导入模块
const { setupConfig } = require('./config');
const { setupMiddlewares } = require('./middlewares');
const { initServices, bootstrapServices, getServices } = require('./bootstrap');
const { setupRoutes } = require('./routes');
const { setupShutdownHandler } = require('./shutdown');
const logger = require('./utils/logger');

// 主函数
async function main() {
    try {
        // 1. 加载配置
        logger.info('加载配置...');
        const config = setupConfig();
        
        // 2. 创建 Express 应用
        const app = express();
        const httpServer = http.createServer(app);
        
        // 3. 创建 Socket.IO 实例
        const io = new Server(httpServer, {
            cors: {
                origin: config.cors?.origins || '*',
                methods: config.cors?.methods || ['GET', 'POST']
            }
        });
        
        // 4. 设置中间件
        logger.info('设置中间件...');
        setupMiddlewares(app, config);
        
        // 5. 初始化服务
        logger.info('初始化服务...');
        initServices(config);
        
        // 6. 设置全局路由
        logger.info('设置路由...');
        setupRoutes(app, config, io);
        
        // 7. 设置关闭处理器
        setupShutdownHandler();
        
        // 8. 启动 HTTP 服务器
        const PORT = config.server.port || 3333;
        const HOST = config.server.host || 'localhost';
        
        httpServer.listen(PORT, HOST, async () => {
            logger.info(`DeepSeek Cowork Server 已启动`);
            logger.info(`访问地址: ${config.server.baseUrl}`);
            
            // 9. 启动所有服务
            await bootstrapServices({ app, io, http: httpServer, config, PORT });
            
            logger.info('所有服务已启动完成');
        });
        
        // 处理服务器错误
        httpServer.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`端口 ${PORT} 已被占用，请检查或更换端口`);
            } else {
                logger.error('服务器错误:', error);
            }
            process.exit(1);
        });
        
    } catch (error) {
        logger.error('服务器启动失败:', error);
        process.exit(1);
    }
}

// 导出模块（用于被其他模块集成）
module.exports = {
    main,
    getServices
};

// 如果直接运行此文件，启动服务器
if (require.main === module) {
    main();
}
