/**
 * DeepSeek Cowork - 更新管理器
 * 
 * 功能：
 * - 封装 electron-updater 的 autoUpdater
 * - 用户可控更新策略（用户选择下载和安装时机）
 * - 处理更新生命周期事件
 * - 提供检查更新、下载更新、安装更新方法
 * - 下载进度跟踪和状态管理
 */

const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

/**
 * 更新状态枚举
 */
const UpdateStatus = {
  IDLE: 'idle',                    // 空闲状态
  CHECKING: 'checking',            // 正在检查更新
  AVAILABLE: 'available',          // 有新版本可用
  NOT_AVAILABLE: 'not-available',  // 已是最新版本
  DOWNLOADING: 'downloading',      // 正在下载
  DOWNLOADED: 'downloaded',        // 下载完成，等待安装
  ERROR: 'error'                   // 发生错误
};

class UpdateManager {
  constructor(mainWindow = null) {
    this.mainWindow = mainWindow;
    
    // 更新状态
    this.status = UpdateStatus.IDLE;
    this.updateInfo = null;       // 新版本信息
    this.downloadProgress = null; // 下载进度
    this.error = null;            // 错误信息
    
    // 状态变化回调
    this.statusChangeCallbacks = [];
    
    // 配置 autoUpdater
    this.configureAutoUpdater();
    
    // 设置事件监听
    this.setupEventListeners();
    
    console.log('UpdateManager initialized');
  }

  /**
   * 配置 autoUpdater
   */
  configureAutoUpdater() {
    // 用户可控更新策略
    autoUpdater.autoDownload = false;           // 不自动下载
    autoUpdater.autoInstallOnAppQuit = false;   // 不在退出时自动安装
    
    // 允许降级（开发测试用）
    autoUpdater.allowDowngrade = false;
    
    // 日志配置
    autoUpdater.logger = {
      info: (msg) => console.log('[AutoUpdater INFO]', msg),
      warn: (msg) => console.warn('[AutoUpdater WARN]', msg),
      error: (msg) => console.error('[AutoUpdater ERROR]', msg),
      debug: (msg) => console.log('[AutoUpdater DEBUG]', msg)
    };
    
    // 开发环境配置
    if (!app.isPackaged) {
      // 开发环境下使用 dev-app-update.yml（如果存在）
      const devConfigPath = path.join(__dirname, '../../dev-app-update.yml');
      autoUpdater.updateConfigPath = devConfigPath;
      console.log('[UpdateManager] Dev mode - using config:', devConfigPath);
    }
  }

  /**
   * 设置事件监听
   */
  setupEventListeners() {
    // 检查更新开始
    autoUpdater.on('checking-for-update', () => {
      console.log('[UpdateManager] Checking for updates...');
      this.setStatus(UpdateStatus.CHECKING);
      this.notifyRenderer('updater:checking', {});
    });

    // 有新版本可用
    autoUpdater.on('update-available', (info) => {
      console.log('[UpdateManager] Update available:', info.version);
      this.updateInfo = info;
      this.setStatus(UpdateStatus.AVAILABLE);
      this.notifyRenderer('updater:available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        currentVersion: app.getVersion()
      });
    });

    // 已是最新版本
    autoUpdater.on('update-not-available', (info) => {
      console.log('[UpdateManager] Already up to date:', info.version);
      this.updateInfo = info;
      this.setStatus(UpdateStatus.NOT_AVAILABLE);
      this.notifyRenderer('updater:not-available', {
        version: info.version,
        currentVersion: app.getVersion()
      });
    });

    // 下载进度
    autoUpdater.on('download-progress', (progress) => {
      this.downloadProgress = {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      };
      this.setStatus(UpdateStatus.DOWNLOADING);
      this.notifyRenderer('updater:download-progress', this.downloadProgress);
    });

    // 下载完成
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[UpdateManager] Update downloaded:', info.version);
      this.updateInfo = info;
      this.downloadProgress = null;
      this.setStatus(UpdateStatus.DOWNLOADED);
      this.notifyRenderer('updater:downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      });
    });

    // 错误处理
    autoUpdater.on('error', (error) => {
      console.error('[UpdateManager] Update error:', error.message);
      this.error = {
        message: error.message,
        stack: error.stack
      };
      this.setStatus(UpdateStatus.ERROR);
      this.notifyRenderer('updater:error', {
        message: error.message
      });
    });
  }

  /**
   * 设置主窗口引用
   * @param {BrowserWindow} mainWindow - 主窗口
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * 设置状态并触发回调
   * @param {string} status - 新状态
   */
  setStatus(status) {
    const oldStatus = this.status;
    this.status = status;
    
    if (oldStatus !== status) {
      this.emitStatusChange({
        status: this.status,
        updateInfo: this.updateInfo,
        downloadProgress: this.downloadProgress,
        error: this.error
      });
    }
  }

  /**
   * 注册状态变化回调
   * @param {Function} callback - 回调函数
   */
  onStatusChange(callback) {
    this.statusChangeCallbacks.push(callback);
  }

  /**
   * 触发状态变化
   * @param {Object} data - 状态数据
   */
  emitStatusChange(data) {
    this.statusChangeCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('[UpdateManager] Status callback error:', error);
      }
    });
  }

  /**
   * 检查更新
   * @returns {Promise<Object>} 检查结果
   */
  async checkForUpdates() {
    try {
      // 开发环境下提示
      if (!app.isPackaged) {
        console.log('[UpdateManager] Running in dev mode - update check may not work');
      }
      
      this.error = null;
      const result = await autoUpdater.checkForUpdates();
      return {
        success: true,
        updateInfo: result?.updateInfo
      };
    } catch (error) {
      console.error('[UpdateManager] Check for updates error:', error);
      this.error = { message: error.message };
      this.setStatus(UpdateStatus.ERROR);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 下载更新
   * @returns {Promise<Object>} 下载结果
   */
  async downloadUpdate() {
    try {
      if (this.status !== UpdateStatus.AVAILABLE) {
        return {
          success: false,
          error: 'No update available to download'
        };
      }
      
      this.error = null;
      this.setStatus(UpdateStatus.DOWNLOADING);
      
      await autoUpdater.downloadUpdate();
      
      return { success: true };
    } catch (error) {
      console.error('[UpdateManager] Download update error:', error);
      this.error = { message: error.message };
      this.setStatus(UpdateStatus.ERROR);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 退出并安装更新
   * @param {boolean} isSilent - 是否静默安装（Windows）
   * @param {boolean} isForceRunAfter - 安装后是否强制运行
   */
  quitAndInstall(isSilent = false, isForceRunAfter = true) {
    if (this.status !== UpdateStatus.DOWNLOADED) {
      console.warn('[UpdateManager] No downloaded update to install');
      return false;
    }
    
    console.log('[UpdateManager] Quitting and installing update...');
    
    // 设置 autoInstallOnAppQuit 为 true 确保安装
    autoUpdater.autoInstallOnAppQuit = true;
    
    // 退出并安装
    autoUpdater.quitAndInstall(isSilent, isForceRunAfter);
    
    return true;
  }

  /**
   * 获取当前状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      status: this.status,
      currentVersion: app.getVersion(),
      updateInfo: this.updateInfo,
      downloadProgress: this.downloadProgress,
      error: this.error
    };
  }

  /**
   * 重置状态
   */
  resetStatus() {
    this.status = UpdateStatus.IDLE;
    this.updateInfo = null;
    this.downloadProgress = null;
    this.error = null;
  }

  /**
   * 通知渲染进程
   * @param {string} channel - 通道名称
   * @param {Object} data - 数据
   */
  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.statusChangeCallbacks = [];
    this.mainWindow = null;
    autoUpdater.removeAllListeners();
  }
}

// 导出状态枚举
UpdateManager.UpdateStatus = UpdateStatus;

module.exports = UpdateManager;
