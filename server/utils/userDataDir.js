/**
 * 用户数据目录工具
 * 
 * 提供跨平台的用户数据目录路径获取
 * 用于支持用户自定义模块的加载
 */

const os = require('os');
const path = require('path');
const fs = require('fs');

// 应用名称
const APP_NAME = 'deepseek-cowork';

// 用户模块目录名
const USER_MODULES_DIR = 'user-server-modules';

// 用户模块配置文件名
const USER_MODULES_CONFIG = 'userServerModulesConfig.js';

/**
 * 获取跨平台用户数据目录
 * @returns {string} 用户数据目录路径
 */
function getUserDataDir() {
    const platform = process.platform;
    let dataDir;
    
    if (platform === 'win32') {
        // Windows: %APPDATA%\deepseek-cowork
        dataDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
    } else if (platform === 'darwin') {
        // macOS: ~/Library/Application Support/deepseek-cowork
        dataDir = path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
    } else {
        // Linux: ~/.config/deepseek-cowork
        dataDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME);
    }
    
    return dataDir;
}

/**
 * 获取用户模块目录路径
 * @returns {string} 用户模块目录路径
 */
function getUserModulesDir() {
    return path.join(getUserDataDir(), USER_MODULES_DIR);
}

/**
 * 获取用户模块配置文件路径
 * @returns {string} 用户模块配置文件路径
 */
function getUserModulesConfigPath() {
    return path.join(getUserDataDir(), USER_MODULES_CONFIG);
}

/**
 * 确保目录存在
 * @param {string} dirPath 目录路径
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * 检查用户模块目录是否存在
 * @returns {boolean} 是否存在
 */
function userModulesDirExists() {
    return fs.existsSync(getUserModulesDir());
}

/**
 * 检查用户模块配置文件是否存在
 * @returns {boolean} 是否存在
 */
function userModulesConfigExists() {
    return fs.existsSync(getUserModulesConfigPath());
}

module.exports = {
    APP_NAME,
    USER_MODULES_DIR,
    USER_MODULES_CONFIG,
    getUserDataDir,
    getUserModulesDir,
    getUserModulesConfigPath,
    ensureDir,
    userModulesDirExists,
    userModulesConfigExists
};
