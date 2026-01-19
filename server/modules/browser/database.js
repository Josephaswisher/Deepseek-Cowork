/**
 * Database module for browser control service
 */

const sqlite3 = require('sqlite3').verbose();
const Logger = require('./logger');
const path = require('path');

class Database {
  constructor(dbName = 'browser_data.db') {
    this.dbName = dbName;
    this.db = null;
    this.checkpointInterval = null;
  }

  /**
   * Initialize database connection
   * @returns {Promise<void>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbName, (err) => {
        if (err) {
          Logger.error(`Database connection error: ${err.message}`);
          reject(err);
        } else {
          Logger.info(`Connected to database: ${this.dbName}`);
          this.configureDatabase().then(resolve).catch(reject);
        }
      });
    });
  }

  /**
   * Configure database performance parameters
   * @returns {Promise<void>}
   */
  async configureDatabase() {
    try {
      // Enable WAL mode
      await this.run('PRAGMA journal_mode = WAL');
      Logger.info('WAL mode enabled');

      // Set sync mode to NORMAL (balance performance and safety)
      await this.run('PRAGMA synchronous = NORMAL');
      
      // Set cache size (in pages, default page size 4KB, setting to 20MB here)
      await this.run('PRAGMA cache_size = -20000');
      
      // Set temp storage to memory
      await this.run('PRAGMA temp_store = MEMORY');
      
      // Set mmap size (256MB)
      await this.run('PRAGMA mmap_size = 268435456');
      
      // Enable foreign key constraints
      await this.run('PRAGMA foreign_keys = ON');
      
      // Set busy timeout (5 seconds)
      await this.run('PRAGMA busy_timeout = 5000');
      
      // Set WAL auto checkpoint (every 1000 pages)
      await this.run('PRAGMA wal_autocheckpoint = 1000');

      Logger.info('Database performance configuration complete');
      
      // Start periodic checkpoint (every 30 minutes)
      this.startPeriodicCheckpoint();
    } catch (err) {
      Logger.error(`Database configuration error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Start periodic WAL checkpoint
   * @param {number} intervalMinutes Checkpoint interval (minutes)
   */
  startPeriodicCheckpoint(intervalMinutes = 30) {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
    }
    
    this.checkpointInterval = setInterval(async () => {
      try {
        await this.checkpoint('PASSIVE');
        Logger.info('Periodic WAL checkpoint completed');
      } catch (err) {
        Logger.error(`Periodic WAL checkpoint error: ${err.message}`);
      }
    }, intervalMinutes * 60 * 1000);
    
    Logger.info(`Started periodic WAL checkpoint, interval: ${intervalMinutes} minutes`);
  }

  /**
   * Stop periodic WAL checkpoint
   */
  stopPeriodicCheckpoint() {
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
      Logger.info('Stopped periodic WAL checkpoint');
    }
  }

  /**
   * Initialize database table structure
   * @returns {Promise<void>}
   */
  async initDb() {
    if (!this.db) {
      await this.connect();
    }

    const queries = [
      // Create tabs table
      `CREATE TABLE IF NOT EXISTS tabs (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT DEFAULT '',
        is_active BOOLEAN DEFAULT FALSE,
        window_id TEXT,
        index_in_window INTEGER,
        favicon_url TEXT,
        status TEXT DEFAULT 'complete',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_status CHECK (status IN ('loading', 'complete', 'error')),
        CONSTRAINT valid_url CHECK (url != ''),
        CONSTRAINT unique_window_index UNIQUE (window_id, index_in_window)
      )`,

      // Create independent cookies table (not associated with tab_id)
      `CREATE TABLE IF NOT EXISTS cookies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value TEXT,
        domain TEXT NOT NULL,
        path TEXT DEFAULT '/',
        secure BOOLEAN DEFAULT FALSE,
        http_only BOOLEAN DEFAULT FALSE,
        same_site TEXT DEFAULT 'no_restriction',
        expiration_date INTEGER,
        session BOOLEAN DEFAULT FALSE,
        store_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT valid_same_site CHECK (same_site IN ('strict', 'lax', 'none', 'no_restriction', 'unspecified')),
        CONSTRAINT unique_cookie UNIQUE (name, domain, path)
      )`,

      // Create HTML content table
      `CREATE TABLE IF NOT EXISTS html_content (
        tab_id TEXT PRIMARY KEY,
        full_html TEXT,
        chunk_count INTEGER,
        received_chunks INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tab_id) REFERENCES tabs (id) ON DELETE CASCADE
      )`,

      // Create HTML chunks table
      `CREATE TABLE IF NOT EXISTS html_chunks (
        tab_id TEXT,
        chunk_index INTEGER,
        chunk_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tab_id, chunk_index),
        FOREIGN KEY (tab_id) REFERENCES html_content (tab_id) ON DELETE CASCADE
      )`,

      // Create callbacks table
      `CREATE TABLE IF NOT EXISTS callbacks (
        request_id TEXT PRIMARY KEY,
        callback_url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP DEFAULT (DATETIME(CURRENT_TIMESTAMP, '+1 hour'))
      )`,

      // Create callback responses table
      `CREATE TABLE IF NOT EXISTS callback_responses (
        request_id TEXT PRIMARY KEY,
        response_data TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,

      // Create WebSocket clients table
      `CREATE TABLE IF NOT EXISTS websocket_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT UNIQUE NOT NULL,
        address TEXT NOT NULL,
        client_type TEXT DEFAULT 'extension',
        connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        disconnected_at TIMESTAMP
      )`,

      // Create indexes to improve query performance
      `CREATE INDEX IF NOT EXISTS idx_tabs_window ON tabs(window_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tabs_active ON tabs(is_active)`,
      `CREATE INDEX IF NOT EXISTS idx_callbacks_expires ON callbacks(expires_at)`,
      `CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies(domain)`,
      `CREATE INDEX IF NOT EXISTS idx_cookies_name ON cookies(name)`,

      // Create trigger to auto-update html_content updated_at
      `CREATE TRIGGER IF NOT EXISTS update_html_content_timestamp 
       AFTER UPDATE ON html_content
       BEGIN
         UPDATE html_content SET updated_at = CURRENT_TIMESTAMP 
         WHERE tab_id = NEW.tab_id;
       END`,

      // Create trigger to auto-update tabs updated_at
      `CREATE TRIGGER IF NOT EXISTS update_tabs_timestamp 
       AFTER UPDATE ON tabs
       BEGIN
         UPDATE tabs SET updated_at = CURRENT_TIMESTAMP 
         WHERE id = NEW.id;
       END`,

      // Create trigger to auto-update cookies updated_at
      `CREATE TRIGGER IF NOT EXISTS update_cookies_timestamp 
       AFTER UPDATE ON cookies
       BEGIN
         UPDATE cookies SET updated_at = CURRENT_TIMESTAMP 
         WHERE id = NEW.id;
       END`
    ];

    try {
      await this.runTransaction(queries);
      Logger.info('Database initialized successfully');
      
      // Check and create potentially missing tables (for backward compatibility)
      await this.checkAndCreateMissingTables();
    } catch (err) {
      Logger.error(`Database initialization error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Execute single SQL query
   * @param {string} query SQL query statement
   * @param {Array} params Query parameters
   * @returns {Promise<Object>} Query result
   */
  run(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(query, params, function(err) {
        if (err) {
          Logger.error(`Database execute error: ${err.message}`);
          reject(err);
        } else {
          // Convert lastID to string to avoid int32 serialization issues
          // SQLite3 lastID is 64-bit, but some serializers (like msgpack) 
          // may treat it as int32, causing errors for values > 2^31-1
          const lastID = this.lastID != null ? String(this.lastID) : null;
          resolve({ lastID, changes: this.changes });
        }
      });
    });
  }

  /**
   * Execute query and get single row result
   * @param {string} query SQL query statement
   * @param {Array} params Query parameters
   * @returns {Promise<Object>} Query result
   */
  get(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(query, params, (err, row) => {
        if (err) {
          Logger.error(`Database get error: ${err.message}`);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Execute query and get all rows
   * @param {string} query SQL query statement
   * @param {Array} params Query parameters
   * @returns {Promise<Array>} Query result
   */
  all(query, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          Logger.error(`Database query error: ${err.message}`);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Execute transaction
   * @param {Array<string>} queries Array of queries to execute
   * @param {Array<Array>} paramsArray Array of parameter arrays (optional)
   * @returns {Promise<void>}
   */
  async runTransaction(queries, paramsArray = []) {
    return new Promise((resolve, reject) => {
      if (!queries || queries.length === 0) {
        resolve();
        return;
      }

      this.db.serialize(() => {
        let hasError = false;
        let errorMessage = '';
        
        // Begin transaction
        this.db.run('BEGIN TRANSACTION', (err) => {
          if (err) {
            Logger.error(`Begin transaction error: ${err.message}`);
            reject(err);
            return;
          }
          
          // Execute all queries
          let completedQueries = 0;
          const totalQueries = queries.length;
          
          const executeQuery = (index) => {
            if (index >= totalQueries) {
              // All queries completed, commit transaction
              if (hasError) {
                this.db.run('ROLLBACK', (rollbackErr) => {
                  if (rollbackErr) {
                    Logger.error(`Transaction rollback error: ${rollbackErr.message}`);
                  } else {
                    Logger.info('Transaction rolled back');
                  }
                  reject(new Error(errorMessage));
                });
              } else {
                this.db.run('COMMIT', (commitErr) => {
                  if (commitErr) {
                    Logger.error(`Transaction commit error: ${commitErr.message}`);
                    reject(commitErr);
                  } else {
                    Logger.debug(`Transaction completed successfully, executed ${totalQueries} queries`);
                    resolve();
                  }
                });
              }
              return;
            }
            
            const query = queries[index];
            const params = paramsArray[index] || [];
            
            this.db.run(query, params, function(err) {
              if (err) {
                hasError = true;
                errorMessage = `Query ${index + 1}/${totalQueries} execution error: ${err.message}`;
                Logger.error(`${errorMessage}`, { query, params, error: err });
              } else {
                Logger.debug(`Query ${index + 1}/${totalQueries} executed successfully`, { query, params });
              }
              
              completedQueries++;
              executeQuery(index + 1);
            });
          };
          
          // Start executing first query
          executeQuery(0);
        });
      });
    });
  }

  /**
   * Manually execute WAL checkpoint
   * @param {string} mode Checkpoint mode: 'PASSIVE' (default), 'FULL', 'RESTART', 'TRUNCATE'
   * @returns {Promise<void>}
   */
  async checkpoint(mode = 'PASSIVE') {
    try {
      await this.run(`PRAGMA wal_checkpoint(${mode})`);
      Logger.info(`WAL checkpoint completed (${mode} mode)`);
    } catch (err) {
      Logger.error(`WAL checkpoint execution error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get WAL mode status info
   * @returns {Promise<Object>} WAL status info
   */
  async getWalInfo() {
    try {
      const journalMode = await this.get('PRAGMA journal_mode');
      const walInfo = await this.get('PRAGMA wal_checkpoint');
      
      return {
        journalMode: journalMode?.journal_mode || 'unknown',
        walInfo: walInfo || null
      };
    } catch (err) {
      Logger.error(`Get WAL info error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Close database connection
   * @returns {Promise<void>}
   */
  close() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        // Stop periodic checkpoint
        this.stopPeriodicCheckpoint();
        
        // Execute WAL checkpoint before closing to ensure all data is written to main database file
        this.db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
          if (err) {
            Logger.warn(`WAL checkpoint warning: ${err.message}`);
          } else {
            Logger.info('WAL checkpoint completed');
          }
          
          // Close database connection
          this.db.close((err) => {
            if (err) {
              Logger.error(`Close database error: ${err.message}`);
              reject(err);
            } else {
              Logger.info('Database connection closed');
              this.db = null;
              resolve();
            }
          });
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Check and create missing tables (for database upgrade)
   * @returns {Promise<void>}
   */
  async checkAndCreateMissingTables() {
    try {
      // Check if cookies table exists
      const cookiesExists = await this.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cookies'"
      );

      if (!cookiesExists) {
        Logger.info('Missing cookies table detected, creating...');
        
        const createCookiesQueries = [
          // Create independent cookies table
          `CREATE TABLE IF NOT EXISTS cookies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            value TEXT,
            domain TEXT NOT NULL,
            path TEXT DEFAULT '/',
            secure BOOLEAN DEFAULT FALSE,
            http_only BOOLEAN DEFAULT FALSE,
            same_site TEXT DEFAULT 'no_restriction',
            expiration_date INTEGER,
            session BOOLEAN DEFAULT FALSE,
            store_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT valid_same_site CHECK (same_site IN ('strict', 'lax', 'none', 'no_restriction', 'unspecified')),
            CONSTRAINT unique_cookie UNIQUE (name, domain, path)
          )`,

          // Create indexes
          `CREATE INDEX IF NOT EXISTS idx_cookies_domain ON cookies(domain)`,
          `CREATE INDEX IF NOT EXISTS idx_cookies_name ON cookies(name)`,

          // Create trigger
          `CREATE TRIGGER IF NOT EXISTS update_cookies_timestamp 
           AFTER UPDATE ON cookies
           BEGIN
             UPDATE cookies SET updated_at = CURRENT_TIMESTAMP 
             WHERE id = NEW.id;
           END`
        ];

        await this.runTransaction(createCookiesQueries);
        Logger.info('Cookies table and related indexes/triggers created successfully');
      }

      // Handle data migration from tab_cookies to cookies
      await this.migrateCookiesTable();

      // Check if websocket_clients table has client_type column
      const clientTypeColumnExists = await this.get(
        `SELECT name FROM PRAGMA_TABLE_INFO('websocket_clients') WHERE name='client_type'`
      );

      if (!clientTypeColumnExists) {
        Logger.info('Detected websocket_clients table missing client_type column, adding...');
        await this.run(`ALTER TABLE websocket_clients ADD COLUMN client_type TEXT DEFAULT 'extension'`);
        Logger.info('client_type column added to websocket_clients table successfully');
      }

      Logger.info('Database table check completed');
    } catch (err) {
      Logger.error(`Error checking/creating missing tables: ${err.message}`);
      throw err;
    }
  }

  /**
   * Migrate cookies table structure (from tab_cookies to cookies)
   * @returns {Promise<void>}
   */
  async migrateCookiesTable() {
    try {
      // Check if old tab_cookies table exists
      const tabCookiesExists = await this.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tab_cookies'"
      );

      if (tabCookiesExists) {
        Logger.info('Detected old tab_cookies table, starting data migration to cookies table...');
        
        // Check if cookies table exists
        const cookiesExists = await this.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='cookies'"
        );

        if (cookiesExists) {
          // Migrate data (remove tab_id field, keep other fields)
          const migrationQuery = `
            INSERT OR IGNORE INTO cookies (
              name, value, domain, path, secure, http_only, same_site, 
              expiration_date, session, store_id, created_at, updated_at
            )
            SELECT DISTINCT 
              name, value, domain, path, secure, http_only, same_site, 
              expiration_date, session, store_id, created_at, updated_at
            FROM tab_cookies
          `;
          
          await this.run(migrationQuery);
          
          // Get number of migrated records
          const migratedCount = await this.get('SELECT changes() as count');
          Logger.info(`Successfully migrated ${migratedCount?.count || 0} cookie records`);
          
          // Delete old table
          await this.run('DROP TABLE tab_cookies');
          Logger.info('Old tab_cookies table deleted');
        }
      }
    } catch (err) {
      Logger.error(`Cookies table migration failed: ${err.message}`);
      // Don't throw error as this is not a fatal issue
    }
  }
}

module.exports = Database;
