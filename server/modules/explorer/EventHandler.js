/**
 * Event Handler class
 * For receiving Socket events and executing various operations
 * 
 * Adapted from: modules/explorer/eventHandler.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Logger = require('./logger');

/**
 * Event Handler class
 * For receiving Socket events and executing various operations
 */
class EventHandler {
    constructor(config, watchDirs) {
        this.config = config;
        this.watchDirs = watchDirs;
        this.eventQueue = [];
        this.isProcessing = false;
        this.handlers = new Map();
        
        // Event emitter (set externally)
        this.eventEmitter = null;
        
        // Initialize default event handlers
        this.initializeDefaultHandlers();
        
        Logger.info('EventHandler initialized');
    }

    /**
     * Set event emitter
     * @param {EventEmitter} emitter - Event emitter instance
     */
    setEventEmitter(emitter) {
        this.eventEmitter = emitter;
    }

    /**
     * Initialize default event handlers
     */
    initializeDefaultHandlers() {
        // File operation handlers
        this.registerHandler('file:create', this.handleFileCreate.bind(this));
        this.registerHandler('file:delete', this.handleFileDelete.bind(this));
        this.registerHandler('file:copy', this.handleFileCopy.bind(this));
        this.registerHandler('file:move', this.handleFileMove.bind(this));
        
        // Directory operation handlers
        this.registerHandler('dir:create', this.handleDirCreate.bind(this));
        this.registerHandler('dir:delete', this.handleDirDelete.bind(this));
        
        // Command execution handlers
        this.registerHandler('command:execute', this.handleCommandExecute.bind(this));
        this.registerHandler('script:run', this.handleScriptRun.bind(this));
        
        // Custom action handlers
        this.registerHandler('custom:action', this.handleCustomAction.bind(this));
        
        // Batch operation handlers
        this.registerHandler('batch:operations', this.handleBatchOperations.bind(this));
    }

    /**
     * Register event handler
     * @param {string} eventType - Event type
     * @param {Function} handler - Handler function
     */
    registerHandler(eventType, handler) {
        this.handlers.set(eventType, handler);
        Logger.debug(`Event handler registered: ${eventType}`);
    }

    /**
     * Remove event handler
     * @param {string} eventType - Event type
     */
    unregisterHandler(eventType) {
        this.handlers.delete(eventType);
        Logger.debug(`Event handler removed: ${eventType}`);
    }

    /**
     * Handle single event
     * @param {Object} eventData - Event data
     * @returns {Promise<Object>} Processing result
     */
    async handleEvent(eventData) {
        const { eventType, eventId, payload } = eventData;
        
        Logger.info(`Received event: ${eventType} (ID: ${eventId})`);
        
        // Check if corresponding handler exists
        if (!this.handlers.has(eventType)) {
            throw new Error(`Handler not found for event type ${eventType}`);
        }

        // Send event processing start notification
        this.emitEvent('event:started', {
            eventId,
            eventType,
            timestamp: new Date().toISOString()
        });

        try {
            // Execute event handler
            const handler = this.handlers.get(eventType);
            const result = await handler(payload);

            // Send event completion notification
            this.emitEvent('event:completed', {
                eventId,
                eventType,
                result,
                timestamp: new Date().toISOString()
            });

            return result;
        } catch (error) {
            // Send event failure notification
            this.emitEvent('event:failed', {
                eventId,
                eventType,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            throw error;
        }
    }

    /**
     * Handle batch events
     * @param {Array} events - Events array
     * @returns {Promise<Array>} Processing results array
     */
    async handleBatchEvents(events) {
        const results = [];
        
        for (const event of events) {
            try {
                const result = await this.handleEvent(event);
                results.push({ eventId: event.eventId, success: true, result });
            } catch (error) {
                results.push({ eventId: event.eventId, success: false, error: error.message });
            }
        }

        this.emitEvent('events:batch:completed', {
            results,
            timestamp: new Date().toISOString()
        });

        return results;
    }

    /**
     * Emit event
     * @param {string} eventName - Event name
     * @param {Object} data - Event data
     */
    emitEvent(eventName, data) {
        if (this.eventEmitter) {
            this.eventEmitter.emit(eventName, data);
        }
    }

    // ========== Default event handler implementations ==========

    /**
     * Handle file create event
     */
    async handleFileCreate(payload) {
        const { dir, filePath, content = '' } = payload;
        const watchDir = this.watchDirs.find(d => d.path === dir || d.name === dir);
        
        if (!watchDir) {
            throw new Error(`Watch directory not found: ${dir}`);
        }

        const fullPath = path.join(watchDir.fullPath, filePath);
        const dirPath = path.dirname(fullPath);

        // Ensure directory exists
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // Create file
        fs.writeFileSync(fullPath, content, 'utf8');
        
        Logger.info(`File created: ${fullPath}`);
        return { success: true, path: fullPath };
    }

    /**
     * Handle file delete event
     */
    async handleFileDelete(payload) {
        const { dir, filePath } = payload;
        const watchDir = this.watchDirs.find(d => d.path === dir || d.name === dir);
        
        if (!watchDir) {
            throw new Error(`Watch directory not found: ${dir}`);
        }

        const fullPath = path.join(watchDir.fullPath, filePath);
        
        if (!fs.existsSync(fullPath)) {
            throw new Error(`File does not exist: ${fullPath}`);
        }

        fs.unlinkSync(fullPath);
        
        Logger.info(`File deleted: ${fullPath}`);
        return { success: true, path: fullPath };
    }

    /**
     * Handle file copy event
     */
    async handleFileCopy(payload) {
        const { sourceDir, sourcePath, targetDir, targetPath } = payload;
        
        const sourceWatchDir = this.watchDirs.find(d => d.path === sourceDir || d.name === sourceDir);
        const targetWatchDir = this.watchDirs.find(d => d.path === targetDir || d.name === targetDir);
        
        if (!sourceWatchDir || !targetWatchDir) {
            throw new Error('Source or target directory not found');
        }

        const sourceFullPath = path.join(sourceWatchDir.fullPath, sourcePath);
        const targetFullPath = path.join(targetWatchDir.fullPath, targetPath);
        
        if (!fs.existsSync(sourceFullPath)) {
            throw new Error(`Source file does not exist: ${sourceFullPath}`);
        }

        // Ensure target directory exists
        const targetDirPath = path.dirname(targetFullPath);
        if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true });
        }

        fs.copyFileSync(sourceFullPath, targetFullPath);
        
        Logger.info(`File copied: ${sourceFullPath} -> ${targetFullPath}`);
        return { success: true, source: sourceFullPath, target: targetFullPath };
    }

    /**
     * Handle file move event
     */
    async handleFileMove(payload) {
        const { sourceDir, sourcePath, targetDir, targetPath } = payload;
        
        // First copy file
        await this.handleFileCopy(payload);
        
        // Then delete source file
        await this.handleFileDelete({ dir: sourceDir, filePath: sourcePath });
        
        Logger.info(`File moved: ${sourcePath} -> ${targetPath}`);
        return { success: true, source: sourcePath, target: targetPath };
    }

    /**
     * Handle directory create event
     */
    async handleDirCreate(payload) {
        const { dir, dirPath } = payload;
        const watchDir = this.watchDirs.find(d => d.path === dir || d.name === dir);
        
        if (!watchDir) {
            throw new Error(`Watch directory not found: ${dir}`);
        }

        const fullPath = path.join(watchDir.fullPath, dirPath);
        
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        
        Logger.info(`Directory created: ${fullPath}`);
        return { success: true, path: fullPath };
    }

    /**
     * Handle directory delete event
     */
    async handleDirDelete(payload) {
        const { dir, dirPath, recursive = false } = payload;
        const watchDir = this.watchDirs.find(d => d.path === dir || d.name === dir);
        
        if (!watchDir) {
            throw new Error(`Watch directory not found: ${dir}`);
        }

        const fullPath = path.join(watchDir.fullPath, dirPath);
        
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Directory does not exist: ${fullPath}`);
        }

        if (recursive) {
            fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
            fs.rmdirSync(fullPath);
        }
        
        Logger.info(`Directory deleted: ${fullPath}`);
        return { success: true, path: fullPath };
    }

    /**
     * Handle command execute event
     */
    async handleCommandExecute(payload) {
        const { command, args = [], options = {} } = payload;
        
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                cwd: options.cwd || process.cwd(),
                env: { ...process.env, ...options.env },
                shell: true,
                ...options
            });

            let stdout = '';
            let stderr = '';

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
                this.emitEvent('command:output', {
                    type: 'stdout',
                    data: data.toString(),
                    timestamp: new Date().toISOString()
                });
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
                this.emitEvent('command:output', {
                    type: 'stderr',
                    data: data.toString(),
                    timestamp: new Date().toISOString()
                });
            });

            child.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, stdout, stderr, exitCode: code });
                } else {
                    reject(new Error(`Command execution failed, exit code: ${code}\n${stderr}`));
                }
            });

            child.on('error', (error) => {
                reject(error);
            });
        });
    }

    /**
     * Handle script run event
     */
    async handleScriptRun(payload) {
        const { scriptPath, args = [], interpreter = 'node' } = payload;
        
        return this.handleCommandExecute({
            command: interpreter,
            args: [scriptPath, ...args],
            options: payload.options || {}
        });
    }

    /**
     * Handle custom action event
     */
    async handleCustomAction(payload) {
        const { actionType, actionData } = payload;
        
        Logger.info(`Executing custom action: ${actionType}`, actionData);
        
        // Execute different custom actions based on actionType
        switch (actionType) {
            case 'backup':
                return this.handleBackupAction(actionData);
            case 'sync':
                return this.handleSyncAction(actionData);
            case 'transform':
                return this.handleTransformAction(actionData);
            default:
                throw new Error(`Unknown custom action type: ${actionType}`);
        }
    }

    /**
     * Handle batch operations event
     */
    async handleBatchOperations(payload) {
        const { operations } = payload;
        const results = [];
        
        for (const operation of operations) {
            try {
                const result = await this.handleEvent(operation);
                results.push({ success: true, result });
            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }
        
        return { batchResults: results };
    }

    // ========== Custom action examples ==========

    async handleBackupAction(actionData) {
        Logger.info('Executing backup action:', actionData);
        return { success: true, message: 'Backup complete' };
    }

    async handleSyncAction(actionData) {
        Logger.info('Executing sync action:', actionData);
        return { success: true, message: 'Sync complete' };
    }

    async handleTransformAction(actionData) {
        Logger.info('Executing transform action:', actionData);
        return { success: true, message: 'Transform complete' };
    }

    /**
     * Handle webhook event
     * @param {Object} eventData - Webhook event data
     */
    handleWebhookEvent(eventData) {
        try {
            Logger.info('EventHandler received webhook event:', eventData);
            
            // Execute different processing based on event type
            switch (eventData.type) {
                case 'add':
                    this.handleWebhookFileAdd(eventData);
                    break;
                case 'change':
                    this.handleWebhookFileChange(eventData);
                    break;
                case 'unlink':
                    this.handleWebhookFileDelete(eventData);
                    break;
                case 'addDir':
                    this.handleWebhookDirAdd(eventData);
                    break;
                case 'unlinkDir':
                    this.handleWebhookDirDelete(eventData);
                    break;
                default:
                    Logger.debug(`Unhandled webhook event type: ${eventData.type}`);
            }
            
            return { success: true, processed: true };
        } catch (error) {
            Logger.error('Error processing webhook event:', error);
            return { success: false, error: error.message };
        }
    }

    handleWebhookFileAdd(eventData) {
        Logger.info(`File added: ${eventData.path} (source: webhook)`);
        this.emitEvent('webhook:file_added', eventData);
    }

    handleWebhookFileChange(eventData) {
        Logger.info(`File modified: ${eventData.path} (source: webhook)`);
        this.emitEvent('webhook:file_changed', eventData);
    }

    handleWebhookFileDelete(eventData) {
        Logger.info(`File deleted: ${eventData.path} (source: webhook)`);
        this.emitEvent('webhook:file_deleted', eventData);
    }

    handleWebhookDirAdd(eventData) {
        Logger.info(`Directory added: ${eventData.path} (source: webhook)`);
        this.emitEvent('webhook:dir_added', eventData);
    }

    handleWebhookDirDelete(eventData) {
        Logger.info(`Directory deleted: ${eventData.path} (source: webhook)`);
        this.emitEvent('webhook:dir_deleted', eventData);
    }

    /**
     * Get queue status
     * @returns {Object} Queue status
     */
    getQueueStatus() {
        return {
            queueLength: this.eventQueue.length,
            isProcessing: this.isProcessing,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = EventHandler;
