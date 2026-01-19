/**
 * Simple logging module for Browser Control Server
 */

// Log level enum
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Default log level
let currentLogLevel = LOG_LEVELS.INFO;

/**
 * Set log level
 * @param {string} level - Log level ('DEBUG', 'INFO', 'WARN', 'ERROR')
 */
function setLogLevel(level) {
  const upperLevel = level?.toUpperCase();
  if (LOG_LEVELS.hasOwnProperty(upperLevel)) {
    currentLogLevel = LOG_LEVELS[upperLevel];
  }
}

/**
 * Check if specified level log should be output
 * @param {number} level - Log level value
 * @returns {boolean} Whether to output
 */
function shouldLog(level) {
  return level >= currentLogLevel;
}

/**
 * Format timestamp
 */
function formatTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

const Logger = {
  info: (message, ...args) => {
    if (shouldLog(LOG_LEVELS.INFO)) {
      const timestamp = formatTimestamp();
      console.log(`[${timestamp}] [BrowserControl] INFO: ${message}`, ...args);
    }
  },
  
  warning: (message, ...args) => {
    if (shouldLog(LOG_LEVELS.WARN)) {
      const timestamp = formatTimestamp();
      console.warn(`[${timestamp}] [BrowserControl] WARNING: ${message}`, ...args);
    }
  },
  
  warn: (message, ...args) => {
    if (shouldLog(LOG_LEVELS.WARN)) {
      const timestamp = formatTimestamp();
      console.warn(`[${timestamp}] [BrowserControl] WARNING: ${message}`, ...args);
    }
  },
  
  error: (message, ...args) => {
    if (shouldLog(LOG_LEVELS.ERROR)) {
      const timestamp = formatTimestamp();
      console.error(`[${timestamp}] [BrowserControl] ERROR: ${message}`, ...args);
    }
  },
  
  debug: (message, ...args) => {
    if (shouldLog(LOG_LEVELS.DEBUG)) {
      const timestamp = formatTimestamp();
      console.log(`[${timestamp}] [BrowserControl] DEBUG: ${message}`, ...args);
    }
  },
  
  setLogLevel
};

module.exports = Logger;
