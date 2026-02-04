/**
 * 跨平台进程终止工具
 * 
 * 提供统一的跨平台进程终止能力：
 * - Windows: 使用 taskkill /F /T /PID 终止进程树
 * - Unix/Mac: 先发送 SIGTERM，超时后发送 SIGKILL
 * 
 * 创建时间: 2026-02-04
 */

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * 平台类型
 */
const PLATFORM = {
  WINDOWS: 'win32',
  MACOS: 'darwin',
  LINUX: 'linux'
};

/**
 * 当前平台
 */
const currentPlatform = process.platform;

/**
 * 是否为 Windows 平台
 */
const isWindows = currentPlatform === PLATFORM.WINDOWS;

/**
 * 检查进程是否存活
 * @param {number} pid 进程 ID
 * @returns {boolean} 是否存活
 */
function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') {
    return false;
  }

  try {
    // 发送信号 0 检查进程是否存在（不实际发送信号）
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH: 进程不存在
    // EPERM: 没有权限（但进程存在）
    if (error.code === 'EPERM') {
      return true;
    }
    return false;
  }
}

/**
 * 休眠函数
 * @param {number} ms 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Windows 平台终止进程
 * 
 * 重要：在 Windows 上，避免使用 taskkill /T 参数！
 * /T 会终止整个进程树，可能意外终止父进程（如 dsc daemon）
 * 
 * @param {number} pid 进程 ID
 * @param {Object} options 选项
 * @returns {Promise<boolean>} 是否成功
 */
async function terminateWindows(pid, options = {}) {
  const { force = false } = options;
  // 注意：忽略 tree 参数，在 Windows 上不使用 /T 来避免终止父进程
  
  console.log(`[ProcessKiller] terminateWindows called: PID=${pid}, force=${force}, currentPID=${process.pid}, parentPID=${process.ppid}`);
  
  try {
    // 安全检查：不能终止自己或父进程
    if (pid === process.pid) {
      console.error(`[ProcessKiller] BLOCKED: Attempted to kill current process (PID: ${pid})`);
      return false;
    }
    if (pid === process.ppid) {
      console.error(`[ProcessKiller] BLOCKED: Attempted to kill parent process (PID: ${pid})`);
      return false;
    }
    
    // 检查进程是否存在
    if (!isProcessAlive(pid)) {
      console.log(`[ProcessKiller] Process ${pid} is not alive, returning true`);
      return true;
    }
    
    // 方法1：使用 taskkill 命令（不带 /T 参数！）
    // 这是最安全的方式，只终止指定的进程，不影响父进程
    const forceFlag = force ? '/F ' : '';
    const command = `taskkill ${forceFlag}/PID ${pid}`;
    
    console.log(`[ProcessKiller] Executing: ${command}`);
    
    try {
      const result = await execAsync(command, {
        windowsHide: true,
        timeout: 5000
      });
      console.log(`[ProcessKiller] taskkill result:`, result.stdout || 'success');
      
      // 等待进程退出
      await sleep(200);
      
      if (!isProcessAlive(pid)) {
        console.log(`[ProcessKiller] Process ${pid} terminated successfully`);
        return true;
      }
    } catch (e) {
      console.log(`[ProcessKiller] taskkill error:`, e.message);
      // taskkill 可能返回错误但进程已被终止
      if (!isProcessAlive(pid)) {
        return true;
      }
    }
    
    // 方法2：如果 taskkill 失败，尝试强制终止
    if (isProcessAlive(pid)) {
      console.log(`[ProcessKiller] Process still alive, trying force kill`);
      try {
        await execAsync(`taskkill /F /PID ${pid}`, {
          windowsHide: true,
          timeout: 5000
        });
        
        await sleep(200);
      } catch (e) {
        console.log(`[ProcessKiller] Force kill error:`, e.message);
      }
    }
    
    // 最终检查
    const finalResult = !isProcessAlive(pid);
    console.log(`[ProcessKiller] Final result for PID ${pid}: ${finalResult}`);
    return finalResult;
    
  } catch (error) {
    // 如果进程已经不存在，也算成功
    if (!isProcessAlive(pid)) {
      return true;
    }
    
    console.error(`[ProcessKiller] Windows terminate failed for PID ${pid}:`, error.message);
    return false;
  }
}

/**
 * Unix/Mac 平台终止进程
 * @param {number} pid 进程 ID
 * @param {string} signal 信号
 * @returns {Promise<boolean>} 是否成功
 */
async function terminateUnix(pid, signal = 'SIGTERM') {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error) {
    // ESRCH: 进程不存在（已经终止）
    if (error.code === 'ESRCH') {
      return true;
    }
    
    console.error(`[ProcessKiller] Unix terminate failed for PID ${pid}:`, error.message);
    return false;
  }
}

/**
 * 终止进程树（Unix/Mac）
 * 通过查找子进程并逐一终止
 * @param {number} pid 父进程 ID
 * @param {string} signal 信号
 * @returns {Promise<boolean>} 是否成功
 */
async function terminateUnixTree(pid, signal = 'SIGTERM') {
  try {
    // 获取子进程列表
    const command = currentPlatform === PLATFORM.MACOS
      ? `pgrep -P ${pid}`
      : `pgrep --parent ${pid}`;
    
    try {
      const { stdout } = await execAsync(command, { timeout: 3000 });
      const childPids = stdout.trim().split('\n').filter(p => p).map(p => parseInt(p, 10));
      
      // 递归终止子进程
      for (const childPid of childPids) {
        if (childPid && !isNaN(childPid)) {
          await terminateUnixTree(childPid, signal);
        }
      }
    } catch (e) {
      // pgrep 没找到子进程时会报错，忽略
    }
    
    // 终止父进程
    return await terminateUnix(pid, signal);
  } catch (error) {
    console.error(`[ProcessKiller] Unix tree terminate failed for PID ${pid}:`, error.message);
    return false;
  }
}

/**
 * 优雅终止进程（带超时重试）
 * @param {number} pid 进程 ID
 * @param {Object} options 选项
 * @param {number} options.gracefulTimeout 优雅退出超时时间（毫秒），默认 2000
 * @param {boolean} options.force 是否强制终止，默认 false
 * @param {boolean} options.tree 是否终止进程树，默认 true
 * @returns {Promise<{success: boolean, forced: boolean}>} 结果
 */
async function terminate(pid, options = {}) {
  const {
    gracefulTimeout = 2000,
    force = false,
    tree = true
  } = options;
  
  // 验证 PID
  if (!pid || typeof pid !== 'number' || pid <= 0) {
    console.warn(`[ProcessKiller] Invalid PID: ${pid}`);
    return { success: false, forced: false };
  }
  
  // 检查进程是否存在
  if (!isProcessAlive(pid)) {
    return { success: true, forced: false };
  }
  
  let result = { success: false, forced: false };
  
  if (isWindows) {
    // Windows 平台
    if (force) {
      // 直接强制终止
      result.success = await terminateWindows(pid, { force: true, tree });
      result.forced = true;
    } else {
      // 先尝试正常终止（不带 /F）
      await terminateWindows(pid, { force: false, tree });
      
      // 等待进程退出
      const checkInterval = 100;
      const maxChecks = Math.ceil(gracefulTimeout / checkInterval);
      
      for (let i = 0; i < maxChecks; i++) {
        await sleep(checkInterval);
        if (!isProcessAlive(pid)) {
          result.success = true;
          return result;
        }
      }
      
      // 超时后强制终止
      result.success = await terminateWindows(pid, { force: true, tree });
      result.forced = true;
    }
  } else {
    // Unix/Mac 平台
    if (force) {
      // 直接发送 SIGKILL
      result.success = tree 
        ? await terminateUnixTree(pid, 'SIGKILL')
        : await terminateUnix(pid, 'SIGKILL');
      result.forced = true;
    } else {
      // 先发送 SIGTERM
      const termResult = tree
        ? await terminateUnixTree(pid, 'SIGTERM')
        : await terminateUnix(pid, 'SIGTERM');
      
      if (!termResult) {
        return { success: false, forced: false };
      }
      
      // 等待进程优雅退出
      const checkInterval = 100;
      const maxChecks = Math.ceil(gracefulTimeout / checkInterval);
      
      for (let i = 0; i < maxChecks; i++) {
        await sleep(checkInterval);
        if (!isProcessAlive(pid)) {
          result.success = true;
          return result;
        }
      }
      
      // 超时后发送 SIGKILL
      result.success = tree
        ? await terminateUnixTree(pid, 'SIGKILL')
        : await terminateUnix(pid, 'SIGKILL');
      result.forced = true;
    }
  }
  
  // 最终确认进程已终止
  await sleep(100);
  if (isProcessAlive(pid)) {
    result.success = false;
  }
  
  return result;
}

/**
 * 批量终止进程
 * @param {number[]} pids 进程 ID 列表
 * @param {Object} options 选项
 * @returns {Promise<{total: number, succeeded: number, failed: number}>} 结果统计
 */
async function terminateAll(pids, options = {}) {
  const results = await Promise.allSettled(
    pids.map(pid => terminate(pid, options))
  );
  
  const succeeded = results.filter(
    r => r.status === 'fulfilled' && r.value.success
  ).length;
  
  return {
    total: pids.length,
    succeeded,
    failed: pids.length - succeeded
  };
}

/**
 * 获取平台信息
 * @returns {Object} 平台信息
 */
function getPlatformInfo() {
  return {
    platform: currentPlatform,
    isWindows,
    isMacOS: currentPlatform === PLATFORM.MACOS,
    isLinux: currentPlatform === PLATFORM.LINUX
  };
}

module.exports = {
  // 核心功能
  terminate,
  terminateAll,
  isProcessAlive,
  
  // 平台特定功能
  terminateWindows,
  terminateUnix,
  terminateUnixTree,
  
  // 工具函数
  sleep,
  getPlatformInfo,
  
  // 常量
  PLATFORM,
  isWindows
};
