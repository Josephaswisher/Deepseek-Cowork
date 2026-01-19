/**
 * 安全设置存储模块
 * 
 * 使用 Electron safeStorage API 加密存储敏感数据
 * 加密后的数据以 Base64 存储在 secure-settings.json 中
 * 
 * 创建时间: 2026-01-09
 */

const fs = require('fs');
const path = require('path');

// safeStorage 需要在主进程中使用，延迟加载
let safeStorage = null;

/**
 * 安全设置管理器
 */
class SecureSettings {
    constructor() {
        this._settings = null;
        this._settingsPath = null;
        this._userDataPath = null;
        this._initialized = false;
    }

    /**
     * 初始化（需要在 app ready 后调用）
     * @param {string} userDataPath Electron app.getPath('userData')
     */
    initialize(userDataPath) {
        // 延迟加载 safeStorage（只在主进程可用）
        try {
            const electron = require('electron');
            safeStorage = electron.safeStorage;
        } catch (error) {
            console.error('[SecureSettings] Failed to load safeStorage:', error.message);
        }
        
        this._userDataPath = userDataPath;
        this._settingsPath = path.join(userDataPath, 'secure-settings.json');
        this._load();
        this._initialized = true;
    }

    /**
     * 检查是否已初始化
     * @returns {boolean}
     */
    isInitialized() {
        return this._initialized;
    }

    /**
     * 检查加密是否可用
     * @returns {boolean}
     */
    isEncryptionAvailable() {
        return safeStorage && safeStorage.isEncryptionAvailable();
    }

    /**
     * 加载设置
     * @private
     */
    _load() {
        try {
            if (fs.existsSync(this._settingsPath)) {
                const content = fs.readFileSync(this._settingsPath, 'utf8');
                this._settings = JSON.parse(content);
            } else {
                this._settings = {};
            }
        } catch (error) {
            console.error('[SecureSettings] 加载设置失败:', error.message);
            this._settings = {};
        }
    }

    /**
     * 保存设置
     * @private
     */
    _save() {
        try {
            // 确保目录存在
            const dir = path.dirname(this._settingsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(this._settingsPath, JSON.stringify(this._settings, null, 2), 'utf8');
        } catch (error) {
            console.error('[SecureSettings] Failed to save settings:', error.message);
        }
    }

    /**
     * 加密并存储敏感数据
     * @param {string} key 键名
     * @param {string} value 明文值
     * @returns {boolean} 是否成功
     */
    setSecret(key, value) {
        if (!this._initialized) {
            throw new Error('SecureSettings not initialized');
        }
        
        if (!value || typeof value !== 'string') {
            throw new Error('值必须是非空字符串');
        }
        
        // 检查加密是否可用
        if (!this.isEncryptionAvailable()) {
            console.warn('[SecureSettings] System encryption unavailable, using Base64 encoding for storage');
            // 回退：使用 Base64 编码（不安全，仅用于兼容）
            this._settings[key] = {
                encrypted: false,
                data: Buffer.from(value, 'utf8').toString('base64')
            };
        } else {
            // 使用 safeStorage 加密
            const encrypted = safeStorage.encryptString(value);
            this._settings[key] = {
                encrypted: true,
                data: encrypted.toString('base64')
            };
        }
        
        this._save();
        return true;
    }

    /**
     * 解密并读取敏感数据
     * @param {string} key 键名
     * @returns {string|null} 明文值，不存在返回 null
     */
    getSecret(key) {
        if (!this._initialized) {
            throw new Error('SecureSettings not initialized');
        }
        
        const entry = this._settings[key];
        if (!entry || !entry.data) {
            return null;
        }
        
        try {
            const buffer = Buffer.from(entry.data, 'base64');
            
            if (entry.encrypted) {
                // 使用 safeStorage 解密
                if (!safeStorage) {
                    throw new Error('safeStorage unavailable');
                }
                return safeStorage.decryptString(buffer);
            } else {
                // Base64 解码
                return buffer.toString('utf8');
            }
        } catch (error) {
            console.error(`[SecureSettings] Failed to decrypt ${key}:`, error.message);
            return null;
        }
    }

    /**
     * 检查是否存在指定的敏感数据
     * @param {string} key 键名
     * @returns {boolean}
     */
    hasSecret(key) {
        if (!this._initialized) {
            return false;
        }
        
        const entry = this._settings[key];
        return entry && entry.data ? true : false;
    }

    /**
     * 删除敏感数据
     * @param {string} key 键名
     * @returns {boolean} 是否成功
     */
    deleteSecret(key) {
        if (!this._initialized) {
            throw new Error('SecureSettings not initialized');
        }
        
        if (this._settings[key]) {
            delete this._settings[key];
            this._save();
            return true;
        }
        
        return false;
    }

    /**
     * 获取所有已存储的键名
     * @returns {string[]}
     */
    getKeys() {
        if (!this._initialized) {
            return [];
        }
        return Object.keys(this._settings);
    }

    /**
     * 清空所有敏感数据
     */
    clear() {
        if (!this._initialized) {
            throw new Error('SecureSettings not initialized');
        }
        
        this._settings = {};
        this._save();
    }

    /**
     * 获取设置文件路径
     * @returns {string}
     */
    getSettingsPath() {
        return this._settingsPath;
    }
}

// 导出单例
module.exports = new SecureSettings();
