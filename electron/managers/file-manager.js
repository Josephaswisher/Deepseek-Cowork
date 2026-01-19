/**
 * 文件系统管理器
 * 
 * 提供安全的文件系统操作，限制在工作目录范围内
 * 
 * 创建时间: 2026-01-13
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { shell } = require('electron');

// 用户设置
const userSettings = require('../../lib/user-settings');

/**
 * 文件系统管理器类
 */
class FileManager {
  constructor() {
    this._workspaceDir = null;
  }

  /**
   * 获取当前工作目录
   * @returns {string} 工作目录路径
   */
  _getWorkspaceDir() {
    if (this._workspaceDir) {
      return this._workspaceDir;
    }
    
    // 优先使用用户设置的工作目录
    const customDir = userSettings.get('happy.workspaceDir');
    if (customDir && fsSync.existsSync(customDir)) {
      this._workspaceDir = customDir;
      return this._workspaceDir;
    }
    
    // 否则使用默认工作目录
    const defaultDir = userSettings.getDefaultWorkspaceDir();
    if (defaultDir) {
      // 确保目录存在
      if (!fsSync.existsSync(defaultDir)) {
        fsSync.mkdirSync(defaultDir, { recursive: true });
      }
      this._workspaceDir = defaultDir;
      return this._workspaceDir;
    }
    
    throw new Error('无法确定工作目录');
  }

  /**
   * 刷新工作目录缓存
   */
  refreshWorkspaceDir() {
    this._workspaceDir = null;
  }

  /**
   * 校验路径安全性（必须在工作目录范围内）
   * @param {string} targetPath 目标路径
   * @returns {string} 解析后的绝对路径
   * @throws {Error} 如果路径越权
   */
  _validatePath(targetPath) {
    const workspaceDir = this._getWorkspaceDir();
    
    // 解析为绝对路径
    let resolved;
    if (path.isAbsolute(targetPath)) {
      resolved = path.resolve(targetPath);
    } else {
      resolved = path.resolve(workspaceDir, targetPath);
    }
    
    // 规范化路径（处理 .. 和 . ）
    resolved = path.normalize(resolved);
    
    // 规范化工作目录路径
    const normalizedWorkspace = path.normalize(workspaceDir);
    
    // 检查是否在工作目录范围内
    if (!resolved.startsWith(normalizedWorkspace)) {
      throw new Error('路径越权访问: 不允许访问工作目录之外的文件');
    }
    
    return resolved;
  }

  /**
   * 获取工作目录根路径
   * @returns {string} 工作目录路径
   */
  getWorkspaceRoot() {
    return this._getWorkspaceDir();
  }

  /**
   * 列出目录内容
   * @param {string} dirPath 目录路径（相对于工作目录或绝对路径）
   * @returns {Promise<Object>} 目录内容列表
   */
  async listDirectory(dirPath) {
    try {
      // 如果没有传入路径，使用工作目录根
      const targetPath = dirPath || this._getWorkspaceDir();
      const resolvedPath = this._validatePath(targetPath);
      
      // 检查目录是否存在
      const stat = await fs.stat(resolvedPath);
      if (!stat.isDirectory()) {
        throw new Error('指定路径不是目录');
      }
      
      // 读取目录内容
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      
      // 获取每个条目的详细信息
      const items = await Promise.all(entries.map(async (entry) => {
        const itemPath = path.join(resolvedPath, entry.name);
        let itemStat;
        
        try {
          itemStat = await fs.stat(itemPath);
        } catch (e) {
          // 无法获取状态的文件（例如权限问题）
          return null;
        }
        
        return {
          name: entry.name,
          path: itemPath,
          relativePath: path.relative(this._getWorkspaceDir(), itemPath),
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: itemStat.size,
          modifiedTime: itemStat.mtime.toISOString(),
          createdTime: itemStat.birthtime.toISOString(),
          extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : null
        };
      }));
      
      // 过滤掉无法访问的条目，并排序（文件夹在前，然后按名称排序）
      const validItems = items
        .filter(item => item !== null)
        .sort((a, b) => {
          // 文件夹优先
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          // 同类型按名称排序
          return a.name.localeCompare(b.name, 'zh-CN');
        });
      
      return {
        success: true,
        path: resolvedPath,
        relativePath: path.relative(this._getWorkspaceDir(), resolvedPath),
        workspaceRoot: this._getWorkspaceDir(),
        items: validItems,
        totalCount: validItems.length,
        folderCount: validItems.filter(i => i.isDirectory).length,
        fileCount: validItems.filter(i => i.isFile).length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * 创建文件夹
   * @param {string} folderPath 文件夹路径
   * @returns {Promise<Object>} 创建结果
   */
  async createFolder(folderPath) {
    try {
      const resolvedPath = this._validatePath(folderPath);
      
      // 检查是否已存在
      try {
        await fs.access(resolvedPath);
        throw new Error('文件夹已存在');
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }
      
      // 创建文件夹
      await fs.mkdir(resolvedPath, { recursive: true });
      
      return {
        success: true,
        path: resolvedPath,
        relativePath: path.relative(this._getWorkspaceDir(), resolvedPath)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * 删除文件或文件夹
   * @param {string} itemPath 文件/文件夹路径
   * @returns {Promise<Object>} 删除结果
   */
  async deleteItem(itemPath) {
    try {
      const resolvedPath = this._validatePath(itemPath);
      
      // 不允许删除工作目录根
      if (resolvedPath === this._getWorkspaceDir()) {
        throw new Error('不允许删除工作目录根');
      }
      
      // 检查是否存在
      const stat = await fs.stat(resolvedPath);
      
      // 删除
      if (stat.isDirectory()) {
        await fs.rm(resolvedPath, { recursive: true, force: true });
      } else {
        await fs.unlink(resolvedPath);
      }
      
      return {
        success: true,
        path: resolvedPath,
        wasDirectory: stat.isDirectory()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * 重命名文件或文件夹
   * @param {string} oldPath 原路径
   * @param {string} newPath 新路径
   * @returns {Promise<Object>} 重命名结果
   */
  async renameItem(oldPath, newPath) {
    try {
      const resolvedOldPath = this._validatePath(oldPath);
      const resolvedNewPath = this._validatePath(newPath);
      
      // 不允许重命名工作目录根
      if (resolvedOldPath === this._getWorkspaceDir()) {
        throw new Error('不允许重命名工作目录根');
      }
      
      // 检查原路径是否存在
      await fs.access(resolvedOldPath);
      
      // 检查新路径是否已存在
      try {
        await fs.access(resolvedNewPath);
        throw new Error('目标路径已存在');
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }
      
      // 重命名
      await fs.rename(resolvedOldPath, resolvedNewPath);
      
      return {
        success: true,
        oldPath: resolvedOldPath,
        newPath: resolvedNewPath,
        relativePath: path.relative(this._getWorkspaceDir(), resolvedNewPath)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * 使用系统默认程序打开文件
   * @param {string} filePath 文件路径
   * @returns {Promise<Object>} 打开结果
   */
  async openWithSystem(filePath) {
    try {
      const resolvedPath = this._validatePath(filePath);
      
      // 检查文件是否存在
      const stat = await fs.stat(resolvedPath);
      
      // 使用 shell.openPath 打开
      const result = await shell.openPath(resolvedPath);
      
      if (result) {
        // openPath 返回非空字符串表示错误
        throw new Error(result);
      }
      
      return {
        success: true,
        path: resolvedPath,
        isDirectory: stat.isDirectory()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * 在系统文件管理器中显示文件
   * @param {string} filePath 文件路径
   * @returns {Object} 操作结果
   */
  showInExplorer(filePath) {
    try {
      const resolvedPath = this._validatePath(filePath);
      
      // 使用 shell.showItemInFolder 在文件管理器中显示
      shell.showItemInFolder(resolvedPath);
      
      return {
        success: true,
        path: resolvedPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取文件/文件夹信息
   * @param {string} itemPath 文件/文件夹路径
   * @returns {Promise<Object>} 文件信息
   */
  async getItemInfo(itemPath) {
    try {
      const resolvedPath = this._validatePath(itemPath);
      const stat = await fs.stat(resolvedPath);
      
      const info = {
        success: true,
        name: path.basename(resolvedPath),
        path: resolvedPath,
        relativePath: path.relative(this._getWorkspaceDir(), resolvedPath),
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        size: stat.size,
        modifiedTime: stat.mtime.toISOString(),
        createdTime: stat.birthtime.toISOString(),
        accessedTime: stat.atime.toISOString()
      };
      
      if (stat.isFile()) {
        info.extension = path.extname(resolvedPath).toLowerCase();
      }
      
      if (stat.isDirectory()) {
        // 获取目录中的条目数量
        try {
          const entries = await fs.readdir(resolvedPath);
          info.itemCount = entries.length;
        } catch (e) {
          info.itemCount = 0;
        }
      }
      
      return info;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * 复制文件或文件夹
   * @param {string} sourcePath 源路径
   * @param {string} destPath 目标路径
   * @returns {Promise<Object>} 复制结果
   */
  async copyItem(sourcePath, destPath) {
    try {
      const resolvedSource = this._validatePath(sourcePath);
      const resolvedDest = this._validatePath(destPath);
      
      // 检查源是否存在
      const stat = await fs.stat(resolvedSource);
      
      // 检查目标是否已存在
      try {
        await fs.access(resolvedDest);
        throw new Error('目标路径已存在');
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }
      
      // 复制
      if (stat.isDirectory()) {
        await this._copyDirectory(resolvedSource, resolvedDest);
      } else {
        await fs.copyFile(resolvedSource, resolvedDest);
      }
      
      return {
        success: true,
        sourcePath: resolvedSource,
        destPath: resolvedDest,
        relativePath: path.relative(this._getWorkspaceDir(), resolvedDest)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }

  /**
   * 递归复制目录
   * @param {string} source 源目录
   * @param {string} dest 目标目录
   */
  async _copyDirectory(source, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this._copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * 移动文件或文件夹
   * @param {string} sourcePath 源路径
   * @param {string} destPath 目标路径
   * @returns {Promise<Object>} 移动结果
   */
  async moveItem(sourcePath, destPath) {
    try {
      const resolvedSource = this._validatePath(sourcePath);
      const resolvedDest = this._validatePath(destPath);
      
      // 不允许移动工作目录根
      if (resolvedSource === this._getWorkspaceDir()) {
        throw new Error('不允许移动工作目录根');
      }
      
      // 检查源是否存在
      await fs.access(resolvedSource);
      
      // 检查目标是否已存在
      try {
        await fs.access(resolvedDest);
        throw new Error('目标路径已存在');
      } catch (e) {
        if (e.code !== 'ENOENT') {
          throw e;
        }
      }
      
      // 移动（重命名）
      await fs.rename(resolvedSource, resolvedDest);
      
      return {
        success: true,
        sourcePath: resolvedSource,
        destPath: resolvedDest,
        relativePath: path.relative(this._getWorkspaceDir(), resolvedDest)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code
      };
    }
  }
}

// 导出单例
module.exports = new FileManager();
