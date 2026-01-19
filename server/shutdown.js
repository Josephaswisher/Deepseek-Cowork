/**
 * DeepSeek Cowork 服务器优雅关闭模块
 * 
 * 负责在服务器退出时按顺序关闭所有服务
 */

const { getServices } = require('./bootstrap');
const logger = require('./utils/logger');

/**
 * 关闭所有服务
 */
async function shutdownServices() {
    logger.info('正在关闭服务器...');
    
    const services = getServices();

    // 关闭浏览器控制服务
    if (services.browserControl) {
        try {
            await services.browserControl.stop();
            logger.info('浏览器控制服务已关闭');
        } catch (err) {
            logger.error('关闭浏览器控制服务时出错:', err);
        }
    }

    // 关闭 Explorer 服务
    if (services.explorer) {
        try {
            await services.explorer.stop();
            logger.info('Explorer 服务已关闭');
        } catch (err) {
            logger.error('关闭 Explorer 服务时出错:', err);
        }
    }

    // 添加超时机制，防止进程卡住
    setTimeout(() => {
        logger.warn('关闭超时，强制退出进程');
        process.exit(1);
    }, 5000); // 5秒后强制退出
}

/**
 * 设置 SIGINT/SIGTERM 处理器
 */
function setupShutdownHandler() {
    // 处理 Ctrl+C
    process.on('SIGINT', async () => {
        logger.info('收到 SIGINT 信号');
        await shutdownServices();
        process.exit(0);
    });

    // 处理终止信号
    process.on('SIGTERM', async () => {
        logger.info('收到 SIGTERM 信号');
        await shutdownServices();
        process.exit(0);
    });

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
        logger.error('未捕获的异常:', error);
        shutdownServices().then(() => process.exit(1));
    });

    // 处理未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('未处理的 Promise 拒绝:', reason);
    });
}

module.exports = {
    shutdownServices,
    setupShutdownHandler
};
