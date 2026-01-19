/**
 * Explorer Service Configuration Module
 * 
 * Provides config management for server, supports:
 * - Load from project config system
 * - Pass config directly
 * - Watch directory configuration
 */

const path = require('path');
const fs = require('fs');

// Run mode enum
const EXPLORER_MODES = {
  INTERNAL_ONLY: 'internal-only',  // Internal only: disable webhook receiving (default mode)
  WEBHOOK_ONLY: 'webhook-only'     // Webhook only: disable internal monitoring, only receive external webhooks
};

/**
 * Explorer Service Configuration class
 */
class ExplorerServerConfig {
  constructor() {
    this.config = null;
    this.defaultConfig = this.getDefaultConfig();
  }

  /**
   * Get default config
   * @returns {Object} Default config object
   */
  getDefaultConfig() {
    return {
      // Whether service is enabled
      enabled: true,

      // Server basic config
      server: {
        host: 'localhost',
        port: 3333,
        baseUrl: null,
        routePrefix: '/api/explorer',
        webInterfacePath: '/explorer'
      },

      // Watch directory config
      watchDirs: [
        {
          path: 'workspace',
          name: 'Workspace',
          description: 'AI workspace'
        }
      ],

      // Exclude patterns
      excludePatterns: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.*',
        '**/*.tmp',
        '**/*.log'
      ],

      // Run mode
      mode: EXPLORER_MODES.INTERNAL_ONLY,

      // File watch options
      watchOptions: {
        stabilityThreshold: 1000,
        pollInterval: 100,
        ignoreInitial: true,
        awaitWriteFinish: true
      },

      // Security config
      security: {
        enableCors: true,
        corsOrigins: ['*'],
        maxFileSize: '50mb',
        allowedExtensions: null,  // null means allow all extensions
        disallowedExtensions: ['.exe', '.dll', '.so', '.dylib']
      },

      // Logging config
      logging: {
        level: 'INFO',
        enableConsole: true
      },

      // SSE event config
      sse: {
        enabled: true,
        heartbeatInterval: 30000,  // 30 second heartbeat
        maxConnections: 50
      },

      // Webhook config
      webhook: {
        enabled: true,
        maxPayloadSize: '10mb'
      }
    };
  }

  /**
   * Deep merge config objects
   * @param {Object} target Target object
   * @param {Object} source Source object
   * @returns {Object} Merged object
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else if (source[key] !== undefined) {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Generate dynamic URLs
   * @param {Object} config Config object
   */
  generateDynamicUrls(config) {
    if (!config.server.baseUrl && config.server.host && config.server.port) {
      const protocol = config.server.port === 443 ? 'https' : 'http';
      const port = (config.server.port === 80 || config.server.port === 443) ? '' : `:${config.server.port}`;
      config.server.baseUrl = `${protocol}://${config.server.host}${port}`;
    }
  }

  /**
   * Process watch directory config
   * @param {Object} config Config object
   * @param {string} appDir App root directory
   */
  processWatchDirs(config, appDir) {
    config.watchDirs = config.watchDirs.map(dir => {
      // Normalize path separator
      const normalizedPath = dir.path.replace(/\\/g, '/');
      
      // Calculate full path
      const fullPath = path.isAbsolute(normalizedPath) 
        ? normalizedPath 
        : path.join(appDir, normalizedPath);
      
      return {
        ...dir,
        path: normalizedPath,
        fullPath: fullPath
      };
    });
  }

  /**
   * Validate config
   * @param {Object} config Config object
   * @returns {Array} Validation errors array
   */
  validateConfig(config) {
    const errors = [];

    // Check required config sections
    if (!config.server) {
      errors.push('Missing server config section');
    }

    // Validate watch directories
    if (!config.watchDirs || !Array.isArray(config.watchDirs)) {
      errors.push('watchDirs must be an array');
    } else if (config.watchDirs.length === 0) {
      errors.push('At least one watch directory is required');
    } else {
      config.watchDirs.forEach((dir, index) => {
        if (!dir.path) {
          errors.push(`watchDirs[${index}] missing path property`);
        }
      });
    }

    // Validate run mode
    if (config.mode && !Object.values(EXPLORER_MODES).includes(config.mode)) {
      errors.push(`Invalid run mode: ${config.mode}, must be: ${Object.values(EXPLORER_MODES).join(', ')}`);
    }

    // Validate log level
    const validLogLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (config.logging?.level && !validLogLevels.includes(config.logging.level.toUpperCase())) {
      errors.push(`Invalid log level: ${config.logging.level}, must be: ${validLogLevels.join(', ')}`);
    }

    return errors;
  }

  /**
   * Initialize config
   * @param {Object} options Options
   * @param {Object} options.explorerConfig explorer config
   * @param {Object} options.serverConfig Main server config
   * @param {string} options.appDir App root directory
   * @returns {Object} Final config
   */
  initialize(options = {}) {
    try {
      // 1. Start from default config
      let config = JSON.parse(JSON.stringify(this.defaultConfig));

      // 2. Merge passed explorerConfig
      if (options.explorerConfig) {
        console.log('[Explorer] Using integrated config mode');
        config = this.deepMerge(config, options.explorerConfig);
      } else {
        console.log('[Explorer] Using standalone config mode');
      }

      // 3. Inherit from main server config
      if (options.serverConfig) {
        if (options.serverConfig.port && !options.explorerConfig?.server?.port) {
          config.server.port = options.serverConfig.port;
        }
        if (options.serverConfig.host) {
          config.server.host = options.serverConfig.host;
        }
      }

      // 4. Process watch directories
      const appDir = options.appDir || global.rootDir || process.cwd();
      this.processWatchDirs(config, appDir);

      // 5. Generate dynamic URLs
      this.generateDynamicUrls(config);

      // 6. Validate config
      const errors = this.validateConfig(config);
      if (errors.length > 0) {
        throw new Error(`Explorer service config validation failed: ${errors.join(', ')}`);
      }

      // 7. Save final config
      this.config = config;

      console.log('[Explorer] Config initialized successfully');
      return config;
    } catch (error) {
      console.error('[Explorer] Config initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Get current config
   * @returns {Object} Current config
   */
  getConfig() {
    if (!this.config) {
      throw new Error('Config not initialized, call initialize() method first');
    }
    return this.config;
  }

  /**
   * Get config section
   * @param {string} section Config section name
   * @returns {Object} Config section
   */
  getSection(section) {
    const config = this.getConfig();
    return config[section] || {};
  }

  /**
   * Get config summary info
   * @returns {Object} Config summary
   */
  getSummary() {
    if (!this.config) {
      return { status: 'not_initialized' };
    }

    return {
      status: 'initialized',
      enabled: this.config.enabled,
      mode: this.config.mode,
      server: {
        host: this.config.server.host,
        port: this.config.server.port,
        baseUrl: this.config.server.baseUrl
      },
      watchDirs: this.config.watchDirs.map(dir => ({
        path: dir.path,
        name: dir.name,
        fullPath: dir.fullPath
      })),
      excludePatterns: this.config.excludePatterns
    };
  }

  /**
   * Check if internal monitoring is enabled
   * @returns {boolean} Whether internal monitoring is enabled
   */
  isInternalMonitoringEnabled() {
    return this.config?.mode === EXPLORER_MODES.INTERNAL_ONLY;
  }

  /**
   * Check if webhook receiving is enabled
   * @returns {boolean} Whether webhook receiving is enabled
   */
  isWebhookReceivingEnabled() {
    return this.config?.mode === EXPLORER_MODES.WEBHOOK_ONLY;
  }
}

// Create global config instance
const explorerServerConfig = new ExplorerServerConfig();

module.exports = {
  ExplorerServerConfig,
  explorerServerConfig,
  EXPLORER_MODES
};
