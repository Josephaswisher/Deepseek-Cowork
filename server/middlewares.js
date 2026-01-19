/**
 * DeepSeek Cowork 中间件配置模块
 * 
 * 设置 Express 中间件
 */

const express = require('express');
const path = require('path');
const cors = require('cors');

/**
 * 设置 Express 中间件
 * @param {Object} app Express 应用实例
 * @param {Object} config 配置对象
 */
function setupMiddlewares(app, config) {
    // 启用 CORS
    app.use(cors({
        origin: config.cors?.origins || '*',
        methods: config.cors?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: config.cors?.allowedHeaders || ['Content-Type', 'Accept', 'Authorization']
    }));

    // 设置静态文件服务
    if (config.staticDir) {
        app.use(express.static(path.resolve(config.staticDir)));
    }

    // JSON 解析中间件
    app.use(express.json({ limit: config.bodyLimit || '100mb' }));
    app.use(express.urlencoded({ extended: true, limit: config.bodyLimit || '100mb' }));

    // 设置响应头，为 API 请求设置 Content-Type
    app.use((req, res, next) => {
        if (req.path.startsWith('/api')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        next();
    });

    // 请求日志中间件（可选）
    if (config.enableRequestLogging) {
        app.use((req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
                const duration = Date.now() - start;
                console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
            });
            next();
        });
    }
}

module.exports = {
    setupMiddlewares
};
