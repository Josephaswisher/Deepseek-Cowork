/**
 * DeepSeek Cowork - 视图管理器
 * 
 * 功能：
 * - 管理 BrowserView 加载管理界面
 * - 处理视图大小调整
 * - 提供刷新和导航功能
 */

const { BrowserView } = require('electron');

class ViewManager {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.browserView = null;
    
    // 管理界面配置
    this.config = {
      host: 'localhost',
      port: 3333,
      path: '/browser'
    };
    
    // 布局配置
    this.layout = {
      toolbarHeight: 32, // 极简标题栏高度
      statusBarHeight: 28
    };
    
    console.log('ViewManager initialized');
  }

  /**
   * 获取管理界面 URL
   */
  getManagementUrl() {
    return `http://${this.config.host}:${this.config.port}${this.config.path}`;
  }

  /**
   * 设置配置
   * @param {Object} config - 配置对象
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }

  /**
   * 设置布局配置
   * @param {Object} layout - 布局配置
   */
  setLayout(layout) {
    this.layout = { ...this.layout, ...layout };
    this.adjustBounds();
  }

  /**
   * 加载管理界面
   */
  loadManagementUI() {
    if (this.browserView) {
      this.destroy();
    }

    // 创建 BrowserView
    this.browserView = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

    // 设置到主窗口
    this.mainWindow.setBrowserView(this.browserView);
    
    // 调整大小
    this.adjustBounds();

    // Load management UI
    const url = this.getManagementUrl();
    console.log(`Loading management UI: ${url}`);
    
    this.browserView.webContents.loadURL(url);

    // Listen for load events
    this.browserView.webContents.on('did-finish-load', () => {
      console.log('Management UI loaded');
      this.notifyRenderer('view-loaded', { url });
    });

    this.browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`Management UI load failed: ${errorDescription} (${errorCode})`);
      this.notifyRenderer('view-load-failed', { errorCode, errorDescription });
    });

    // Listen for window resize
    this.mainWindow.on('resize', () => {
      this.adjustBounds();
    });

    return true;
  }

  /**
   * 调整 BrowserView 大小和位置
   */
  adjustBounds() {
    if (!this.browserView || !this.mainWindow) return;

    const [width, height] = this.mainWindow.getContentSize();
    const { toolbarHeight, statusBarHeight } = this.layout;

    this.browserView.setBounds({
      x: 0,
      y: toolbarHeight,
      width: width,
      height: height - toolbarHeight - statusBarHeight
    });

    // 设置自动调整大小
    this.browserView.setAutoResize({
      width: true,
      height: true,
      horizontal: false,
      vertical: false
    });
  }

  /**
   * 刷新管理界面
   */
  refresh() {
    if (this.browserView) {
      this.browserView.webContents.reload();
      console.log('Management UI refreshed');
      return true;
    }
    return false;
  }

  /**
   * 重新加载管理界面
   */
  reload() {
    return this.loadManagementUI();
  }

  /**
   * 打开开发者工具
   */
  openDevTools() {
    if (this.browserView) {
      this.browserView.webContents.openDevTools({ mode: 'detach' });
      return true;
    }
    return false;
  }

  /**
   * 关闭开发者工具
   */
  closeDevTools() {
    if (this.browserView) {
      this.browserView.webContents.closeDevTools();
      return true;
    }
    return false;
  }

  /**
   * 切换开发者工具
   */
  toggleDevTools() {
    if (this.browserView) {
      if (this.browserView.webContents.isDevToolsOpened()) {
        this.closeDevTools();
      } else {
        this.openDevTools();
      }
      return true;
    }
    return false;
  }

  /**
   * 获取当前 URL
   */
  getCurrentUrl() {
    if (this.browserView) {
      return this.browserView.webContents.getURL();
    }
    return null;
  }

  /**
   * 检查是否正在加载
   */
  isLoading() {
    if (this.browserView) {
      return this.browserView.webContents.isLoading();
    }
    return false;
  }

  /**
   * 销毁 BrowserView
   */
  destroy() {
    if (this.browserView) {
      this.mainWindow.removeBrowserView(this.browserView);
      this.browserView = null;
      console.log('BrowserView destroyed');
    }
  }

  /**
   * 通知渲染进程
   */
  notifyRenderer(channel, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

module.exports = ViewManager;
