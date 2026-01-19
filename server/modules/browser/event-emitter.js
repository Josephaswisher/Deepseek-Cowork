/**
 * Browser Control Server Event Emitter
 * 
 * Used to decouple browserControlServer from direct external system dependencies
 * Implements loose coupling architecture through event publish-subscribe pattern
 */

const { EventEmitter } = require('events');
const Logger = require('./logger');

/**
 * Browser Event Emitter Class
 * Responsible for managing and distributing browser-related events
 */
class BrowserEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.eventHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Emit browser event
   * @param {string} eventType - Event type
   * @param {Object} eventData - Event data
   * @param {Object} metadata - Metadata (optional)
   */
  emitBrowserEvent(eventType, eventData, metadata = {}) {
    try {
      const event = {
        type: eventType,
        data: eventData,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'browser_control_server',
          ...metadata
        }
      };

      this.addToHistory(event);

      this.emit('browser_event', event);
      this.emit(`browser_event:${eventType}`, event);

      Logger.debug(`Emitting browser event: ${eventType}`);
    } catch (error) {
      Logger.error(`Failed to emit browser event: ${error.message}`);
    }
  }

  /**
   * Add event to history
   * @param {Object} event - Event object
   */
  addToHistory(event) {
    this.eventHistory.push(event);
    
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event history
   * @param {number} limit - Limit count (optional)
   * @param {string} eventType - Event type filter (optional)
   * @returns {Array} Event history
   */
  getEventHistory(limit = 100, eventType = null) {
    let history = this.eventHistory;
    
    if (eventType) {
      history = history.filter(event => event.type === eventType);
    }
    
    return history.slice(-limit);
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
    Logger.info('Browser event history cleared');
  }

  /**
   * Get current listener statistics
   * @returns {Object} Listener statistics
   */
  getListenerStats() {
    const events = this.eventNames();
    const stats = {};
    
    events.forEach(eventName => {
      stats[eventName] = this.listenerCount(eventName);
    });
    
    return {
      totalEvents: events.length,
      totalListeners: Object.values(stats).reduce((sum, count) => sum + count, 0),
      eventStats: stats
    };
  }
}

// Create global singleton instance
const browserEventEmitter = new BrowserEventEmitter();

module.exports = {
  BrowserEventEmitter,
  browserEventEmitter
};
