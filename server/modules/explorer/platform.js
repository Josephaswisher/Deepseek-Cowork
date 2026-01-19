/**
 * Platform Utility Module
 * 
 * Provides cross-platform compatibility detection and utility functions
 */

/**
 * Platform info and utilities
 */
const platform = {
  /**
   * Whether Windows system
   */
  isWindows: process.platform === 'win32',

  /**
   * Whether macOS system
   */
  isMac: process.platform === 'darwin',

  /**
   * Whether Linux system
   */
  isLinux: process.platform === 'linux',

  /**
   * Whether file system is case-sensitive
   * - Linux: case-sensitive
   * - Windows/macOS: case-insensitive (default)
   */
  isCaseSensitive: process.platform === 'linux',

  /**
   * Max path length
   * - Windows: 260 chars (default, can extend via registry)
   * - Linux/macOS: 4096 chars
   */
  maxPathLength: process.platform === 'win32' ? 260 : 4096,

  /**
   * Path length warning threshold (Windows)
   */
  pathLengthWarningThreshold: 250,

  /**
   * Compare if two paths are equal (platform-aware)
   * @param {string} path1 - First path
   * @param {string} path2 - Second path
   * @returns {boolean} Whether equal
   */
  pathEquals(path1, path2) {
    if (this.isCaseSensitive) {
      return path1 === path2;
    }
    return path1.toLowerCase() === path2.toLowerCase();
  },

  /**
   * Check if path starts with prefix (platform-aware)
   * @param {string} fullPath - Full path
   * @param {string} prefix - Prefix path
   * @returns {boolean} Whether starts with prefix
   */
  pathStartsWith(fullPath, prefix) {
    if (this.isCaseSensitive) {
      return fullPath.startsWith(prefix);
    }
    return fullPath.toLowerCase().startsWith(prefix.toLowerCase());
  },

  /**
   * Check if path length is near limit (Windows only)
   * @param {string} pathStr - Path string
   * @returns {Object} { isNearLimit, length, maxLength }
   */
  checkPathLength(pathStr) {
    const length = pathStr.length;
    const maxLength = this.maxPathLength;
    const isNearLimit = this.isWindows && length > this.pathLengthWarningThreshold;
    
    return {
      isNearLimit,
      length,
      maxLength,
      remaining: maxLength - length
    };
  },

  /**
   * Get platform name
   * @returns {string} Platform name
   */
  getPlatformName() {
    if (this.isWindows) return 'Windows';
    if (this.isMac) return 'macOS';
    if (this.isLinux) return 'Linux';
    return process.platform;
  },

  /**
   * Get platform info summary
   * @returns {Object} Platform info
   */
  getInfo() {
    return {
      platform: process.platform,
      platformName: this.getPlatformName(),
      isWindows: this.isWindows,
      isMac: this.isMac,
      isLinux: this.isLinux,
      isCaseSensitive: this.isCaseSensitive,
      maxPathLength: this.maxPathLength
    };
  }
};

module.exports = platform;
