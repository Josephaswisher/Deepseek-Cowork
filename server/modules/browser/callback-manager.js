/**
 * Callback Manager Module
 * 
 * Manages HTTP callback requests and responses
 */

const axios = require('axios');
const Logger = require('./logger');

class CallbackManager {
  /**
   * Constructor
   * @param {Object} database Database instance
   */
  constructor(database) {
    this.database = database;
    this.logger = Logger;
  }

  /**
   * Register callback URL
   * @param {string} requestId Request ID
   * @param {string} callbackUrl Callback URL
   * @returns {Promise<boolean>} Success/failure
   */
  async registerCallback(requestId, callbackUrl) {
    try {
      if (!requestId) {
        this.logger.error('Missing required parameter when registering callback');
        return false;
      }

      if (callbackUrl === "_internal" || !callbackUrl) {
        callbackUrl = "_internal";
      }

      await this.database.run(
        'INSERT OR REPLACE INTO callbacks (request_id, callback_url) VALUES (?, ?)',
        [requestId, callbackUrl]
      );
      
      this.logger.info(`Registered callback [${requestId}]: ${callbackUrl}`);
      return true;
    } catch (err) {
      this.logger.error(`Error registering callback URL: ${err.message}`);
      return false;
    }
  }

  /**
   * Send response to registered callback URL
   * @param {string} requestId Request ID
   * @param {Object} data Response data
   * @returns {Promise<boolean>} Success/failure
   */
  async postToCallback(requestId, data) {
    try {
      if (!requestId) {
        this.logger.error('Missing request ID when sending callback');
        return false;
      }

      // Save response data to database
      await this.saveCallbackResponse(requestId, data);

      // Get callback URL from database
      const callbackInfo = await this.database.get(
        'SELECT callback_url FROM callbacks WHERE request_id = ?',
        [requestId]
      );

      // For internal callbacks, only save response
      if (!callbackInfo || callbackInfo.callback_url === "_internal") {
        this.logger.info(`Internal callback for request ID ${requestId}, response saved`);
        return true;
      }

      // If callback URL exists, send HTTP POST request
      const callbackUrl = callbackInfo.callback_url;
      if (callbackUrl) {
        try {
          const response = await axios.post(callbackUrl, data, {
            headers: { 'Content-Type': 'application/json' }
          });
          
          this.logger.info(`Callback [${requestId}] sent to ${callbackUrl}, status: ${response.status}`);
          return response.status >= 200 && response.status < 300;
        } catch (err) {
          this.logger.error(`Error sending callback request [${requestId}]: ${err.message}`);
          return false;
        }
      }

      return true;
    } catch (err) {
      this.logger.error(`Error processing callback: ${err.message}`);
      return false;
    }
  }

  /**
   * Save callback response
   * @param {string} requestId Request ID
   * @param {Object} data Response data
   * @returns {Promise<boolean>} Success/failure
   */
  async saveCallbackResponse(requestId, data) {
    try {
      const responseData = JSON.stringify(data);
      
      await this.database.run(
        'INSERT OR REPLACE INTO callback_responses (request_id, response_data) VALUES (?, ?)',
        [requestId, responseData]
      );
      
      this.logger.info(`Saved callback response [${requestId}]`);
      return true;
    } catch (err) {
      this.logger.error(`Error saving callback response: ${err.message}`);
      return false;
    }
  }

  /**
   * Get callback URL
   * @param {string} requestId Request ID
   * @returns {Promise<string|null>} Callback URL
   */
  async getCallbackUrl(requestId) {
    try {
      const row = await this.database.get(
        'SELECT callback_url FROM callbacks WHERE request_id = ?',
        [requestId]
      );

      return row ? row.callback_url : null;
    } catch (err) {
      this.logger.error(`Error getting callback URL: ${err.message}`);
      return null;
    }
  }

  /**
   * Get callback response
   * @param {string} requestId Request ID
   * @returns {Promise<Object|null>} Response data
   */
  async getCallbackResponse(requestId) {
    try {
      const row = await this.database.get(
        'SELECT response_data FROM callback_responses WHERE request_id = ?',
        [requestId]
      );

      if (row && row.response_data) {
        try {
          return JSON.parse(row.response_data);
        } catch (err) {
          this.logger.error(`Error parsing callback response data: ${err.message}`);
          return null;
        }
      }
      
      return null;
    } catch (err) {
      this.logger.error(`Error getting callback response: ${err.message}`);
      return null;
    }
  }

  /**
   * Cleanup expired callback records
   * @returns {Promise<number>} Number of records cleaned up
   */
  async cleanupExpiredCallbacks() {
    try {
      const result = await this.database.run(
        'DELETE FROM callbacks WHERE expires_at < CURRENT_TIMESTAMP'
      );
      
      this.logger.info(`Cleaned up ${result.changes} expired callback records`);
      return result.changes;
    } catch (err) {
      this.logger.error(`Error cleaning up expired callback records: ${err.message}`);
      return 0;
    }
  }
}

module.exports = CallbackManager;
