#!/usr/bin/env node

/**
 * save_memory.js - Save Conversation Memory
 * 
 * Usage:
 *   node save_memory.js [options]
 * 
 * Options:
 *   --summary-file <path>    Read title and summary from file (recommended)
 *   --topic <topic>          Specify memory title (optional, overrides file title)
 *   --keywords <keywords>    Specify keywords (comma-separated)
 *   --summary <summary>      Specify summary text directly (requires --topic)
 *   --help                   Show help message
 * 
 * Summary file format:
 *   First line: # Title
 *   Following lines: Summary text
 * 
 * Features:
 *   1. Read current session info
 *   2. Read title and summary (from file or command line)
 *   3. Call Memory API to save conversation
 *   4. Output save result
 * 
 * Notes:
 *   - Requires DeepSeek Cowork app to be running
 *   - Requires connected HappyClient session
 *   - Summary file first line must be title (starting with #)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { getApiUrl, readCurrentSession, ensureDataDir } = require('./paths');

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    topic: null,
    keywords: null,
    summary: null,
    summaryFile: null,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--topic' && args[i + 1]) {
      options.topic = args[++i];
    } else if (arg === '--keywords' && args[i + 1]) {
      options.keywords = args[++i].split(',').map(k => k.trim());
    } else if (arg === '--summary' && args[i + 1]) {
      options.summary = args[++i];
    } else if (arg === '--summary-file' && args[i + 1]) {
      options.summaryFile = args[++i];
    }
  }
  
  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Save Conversation Memory Script

Usage:
  node save_memory.js [options]

Options:
  --summary-file <path>    Read title and summary from file (recommended)
  --topic <topic>          Specify memory title (optional, overrides file title)
  --keywords <keywords>    Specify keywords, comma-separated (optional, auto-extracted)
  --summary <summary>      Specify summary text directly (requires --topic)
  --help, -h               Show this help message

Summary file format (--summary-file):
  First line must be title, format: "# Title Content"
  Following lines are summary text

  Example file content:
  ┌────────────────────────────────────
  │ # Project Refactoring Discussion
  │ 
  │ This conversation discussed project 
  │ architecture refactoring plan,
  │ including:
  │ - Database layer optimization
  │ - API interface redesign
  │ - Frontend component splitting
  └────────────────────────────────────

Examples:
  node save_memory.js --summary-file ./temp/summary.md
  node save_memory.js --topic "Custom Title" --summary-file ./temp/summary.md

Recommended workflow:
  1. Analyze conversation, write title and summary
  2. Write content to file (e.g., .claude/data/conversation-memory/temp/summary.md)
  3. Use --summary-file parameter to save
  4. Delete temp file after successful save

Notes:
  - Requires DeepSeek Cowork app to be running
  - Requires connected HappyClient session
  - Summary file first line must be title (starting with #)
  - Only saves new messages since last save
`);
}

/**
 * Send HTTP POST request
 * @param {string} url Request URL
 * @param {Object} data Request data
 * @returns {Promise<Object>} Response data
 */
function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 30000
    };
    
    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(result.error || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    
    req.on('error', (e) => {
      if (e.code === 'ECONNREFUSED') {
        reject(new Error('Cannot connect to DeepSeek Cowork service, please ensure app is running'));
      } else {
        reject(e);
      }
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();
  
  // Show help
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  console.log('Saving conversation memory...\n');
  
  // 1. Read current session info
  const sessionInfo = readCurrentSession();
  
  if (!sessionInfo || !sessionInfo.sessionId) {
    console.error('Error: Cannot get current session info');
    console.error('Please ensure:');
    console.error('  1. DeepSeek Cowork app is running');
    console.error('  2. Connected to HappyClient session');
    process.exit(1);
  }
  
  console.log(`Current Session: ${sessionInfo.sessionId.substring(0, 8)}...`);
  if (sessionInfo.conversationId) {
    console.log(`Current Conversation: ${sessionInfo.conversationId}`);
  }
  
  // 2. Ensure data directory exists
  try {
    ensureDataDir();
  } catch (e) {
    // Ignore error, API will handle
  }
  
  // 3. Process summary content (prefer reading from file)
  let summaryContent = options.summary;
  let topicFromFile = null;
  
  if (options.summaryFile) {
    // Read summary from file
    const summaryFilePath = path.isAbsolute(options.summaryFile) 
      ? options.summaryFile 
      : path.resolve(process.cwd(), options.summaryFile);
    
    if (!fs.existsSync(summaryFilePath)) {
      console.error(`Error: Summary file not found: ${summaryFilePath}`);
      process.exit(1);
    }
    
    try {
      const fileContent = fs.readFileSync(summaryFilePath, 'utf8').trim();
      
      // Parse summary file format: first line is title (# Title), rest is summary
      const lines = fileContent.split('\n');
      const firstLine = lines[0].trim();
      
      // Check if first line is title format (starts with #)
      if (firstLine.startsWith('# ')) {
        topicFromFile = firstLine.substring(2).trim();
        // Summary content is everything after title
        summaryContent = lines.slice(1).join('\n').trim();
        console.log(`Read summary from file: ${summaryFilePath}`);
        console.log(`Title: ${topicFromFile}`);
        console.log(`Summary length: ${summaryContent.length} chars`);
      } else {
        console.error('Error: Summary file format incorrect');
        console.error('First line must be title, format: # Title Content');
        console.error('Example:');
        console.error('  # Project Refactoring Discussion');
        console.error('  ');
        console.error('  This conversation discussed...');
        process.exit(1);
      }
    } catch (e) {
      console.error(`Error: Failed to read summary file: ${e.message}`);
      process.exit(1);
    }
  }
  
  // Check if summary provided
  if (!summaryContent) {
    console.error('Error: Summary content required');
    console.error('Please use one of the following:');
    console.error('  --summary-file <path>  Read summary from file (recommended)');
    console.error('  --summary <content>    Specify summary text directly (requires --topic)');
    console.error('\nSummary file format:');
    console.error('  # Title');
    console.error('  ');
    console.error('  Summary text content...');
    console.error('\nUse --help for more info');
    process.exit(1);
  }
  
  // 4. Build request data
  const requestData = {
    sessionId: sessionInfo.sessionId,
    aiSummary: summaryContent
  };
  
  // Include conversationId (if available)
  if (sessionInfo.conversationId) {
    requestData.conversationId = sessionInfo.conversationId;
  }
  
  // Title priority: command line > file title
  if (options.topic) {
    requestData.topic = options.topic;
  } else if (topicFromFile) {
    requestData.topic = topicFromFile;
  }
  
  if (options.keywords) {
    requestData.keywords = options.keywords;
  }
  
  // 5. Call API to save
  try {
    const apiUrl = getApiUrl('/save');
    console.log(`Calling API: ${apiUrl}`);
    
    const result = await httpPost(apiUrl, requestData);
    
    if (result.success) {
      console.log('\n✓ Memory saved successfully!');
      console.log(`  Memory name: ${result.memoryName}`);
      console.log(`  Topic: ${result.topic || '(auto-generated)'}`);
      console.log(`  Message count: ${result.messageCount}`);
      if (result.conversationId) {
        console.log(`  Conversation ID: ${result.conversationId}`);
      }
      
      // Show save location
      console.log('\nMemory files saved to:');
      console.log(`  .claude/data/conversation-memory/memories/active/${result.memoryName}/`);
    } else {
      console.error('\n✗ Save failed:', result.error);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n✗ Save failed:', error.message);
    
    if (error.message.includes('Cannot connect')) {
      console.error('\nTip: Please ensure DeepSeek Cowork app is running');
    }
    
    process.exit(1);
  }
}

// Run
main().catch(err => {
  console.error('Unknown error:', err);
  process.exit(1);
});
