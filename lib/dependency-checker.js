/**
 * 依赖检查模块
 * 
 * 检测必要的运行环境依赖：
 * - Node.js（系统安装）
 * - happy-coder（本地依赖）
 * - claude-code（全局安装）
 * 
 * 创建时间: 2026-01-09
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ============================================================================
// Node.js 检测
// ============================================================================

/**
 * 检测系统安装的 Node.js
 * @returns {Object} Node.js 状态信息
 */
function checkNodeJs() {
    const result = {
        installed: false,
        version: null,
        path: null,
        npm: {
            installed: false,
            version: null,
            path: null
        },
        electronBuiltin: {
            version: process.versions.node,
            electronVersion: process.versions.electron
        }
    };

    // 检测 node
    try {
        const nodeVersion = execSync('node --version', { 
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true
        }).trim();
        result.version = nodeVersion.replace(/^v/, '');
        result.installed = true;

        // 尝试获取 node 路径
        try {
            const isWindows = process.platform === 'win32';
            const whichCmd = isWindows ? 'where node' : 'which node';
            const nodePath = execSync(whichCmd, { 
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true
            }).trim().split('\n')[0];
            result.path = nodePath;
        } catch (e) {
            // 无法获取路径，但 node 存在
        }
    } catch (e) {
        // Node.js 未安装或不在 PATH 中
    }

    // 检测 npm
    try {
        const npmVersion = execSync('npm --version', { 
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true
        }).trim();
        result.npm.version = npmVersion;
        result.npm.installed = true;

        // 尝试获取 npm 路径
        try {
            const isWindows = process.platform === 'win32';
            const whichCmd = isWindows ? 'where npm' : 'which npm';
            const npmPath = execSync(whichCmd, { 
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true
            }).trim().split('\n')[0];
            result.npm.path = npmPath;
        } catch (e) {
            // 无法获取路径
        }
    } catch (e) {
        // npm 未安装或不在 PATH 中
    }

    return result;
}

// ============================================================================
// happy-coder 检测
// ============================================================================

/**
 * 获取项目根目录
 * @returns {string} 项目根目录路径
 */
function getProjectRoot() {
    // 尝试使用 Electron app.getAppPath()（如果可用）
    try {
        const { app } = require('electron');
        if (app && app.isReady && app.isReady()) {
            const appPath = app.getAppPath();
            // 在开发环境：appPath 是项目根目录
            // 在打包环境：appPath 是 app.asar 路径，但我们需要项目根目录
            // 对于 lib 模块，我们需要从 app.asar/lib 回到 app.asar
            if (!app.isPackaged) {
                return appPath;
            } else {
                // 打包环境：appPath 是 app.asar，但 lib 在 app.asar/lib
                // 所以从 lib 目录向上找是正确的
                return path.join(__dirname, '..');
            }
        }
    } catch (e) {
        // Electron app 不可用，使用 __dirname
    }
    
    // 从当前文件位置向上找（lib -> 项目根目录）
    return path.join(__dirname, '..');
}

/**
 * 检测 happy-coder 本地安装
 * @returns {Object} happy-coder 状态信息
 */
function checkHappyCoder() {
    const projectRoot = getProjectRoot();
    const result = {
        installed: false,
        version: null,
        path: null,
        source: null, // 'node_modules' | 'lib'
        daemon: {
            running: false,
            pid: null,
            port: null
        }
    };

    // 检查 node_modules/happy-coder
    const nodeModulesPath = path.join(projectRoot, 'node_modules', 'happy-coder');
    const libPath = path.join(projectRoot, 'lib', 'happy-cli');

    // 优先检查 node_modules
    if (fs.existsSync(nodeModulesPath)) {
        result.installed = true;
        result.path = nodeModulesPath;
        result.source = 'node_modules';
        
        // 读取版本
        try {
            const pkgPath = path.join(nodeModulesPath, 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                result.version = pkg.version;
            }
        } catch (e) {
            // 无法读取版本
        }
    } else if (fs.existsSync(libPath)) {
        // 检查 lib/happy-cli
        const binPath = path.join(libPath, 'bin', 'happy.mjs');
        if (fs.existsSync(binPath)) {
            result.installed = true;
            result.path = libPath;
            result.source = 'lib';
            
            // 读取版本
            try {
                const pkgPath = path.join(libPath, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    result.version = pkg.version;
                }
            } catch (e) {
                // 无法读取版本
            }
        }
    }

    // 检查 daemon 状态
    try {
        const happyHomeDir = path.join(os.homedir(), '.happy');
        const stateFilePath = path.join(happyHomeDir, 'daemon.state.json');
        
        if (fs.existsSync(stateFilePath)) {
            const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
            if (state.pid) {
                // 检查进程是否运行
                try {
                    process.kill(state.pid, 0);
                    result.daemon.running = true;
                    result.daemon.pid = state.pid;
                    result.daemon.port = state.httpPort;
                } catch (e) {
                    // 进程不存在
                }
            }
        }
    } catch (e) {
        // 无法读取 daemon 状态
    }

    return result;
}

// ============================================================================
// claude-code 检测（复用 happy-cli 的检测逻辑）
// ============================================================================

/**
 * 安全解析符号链接
 * @param {string} filePath 文件路径
 * @returns {string|null} 解析后的路径或 null
 */
function resolvePathSafe(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return fs.realpathSync(filePath);
    } catch (e) {
        return filePath;
    }
}

/**
 * 查找 npm 全局安装的 Claude Code
 * @returns {string|null} CLI 路径或 null
 */
function findNpmGlobalCliPath() {
    try {
        const globalRoot = execSync('npm root -g', { 
            encoding: 'utf8',
            timeout: 10000,
            windowsHide: true
        }).trim();
        const globalCliPath = path.join(globalRoot, '@anthropic-ai', 'claude-code', 'cli.js');
        if (fs.existsSync(globalCliPath)) {
            return globalCliPath;
        }
    } catch (e) {
        // npm root -g failed
    }
    return null;
}

/**
 * 查找 Homebrew 安装的 Claude Code
 * @returns {string|null} CLI 路径或 null
 */
function findHomebrewCliPath() {
    if (process.platform !== 'darwin' && process.platform !== 'linux') {
        return null;
    }
    
    let brewPrefix = null;
    try {
        brewPrefix = execSync('brew --prefix 2>/dev/null', { 
            encoding: 'utf8',
            timeout: 5000
        }).trim();
    } catch (e) {
        // brew not available
    }
    
    const possiblePrefixes = [];
    if (brewPrefix) {
        possiblePrefixes.push(brewPrefix);
    }
    
    if (process.platform === 'darwin') {
        possiblePrefixes.push('/opt/homebrew', '/usr/local');
    } else if (process.platform === 'linux') {
        const homeDir = os.homedir();
        possiblePrefixes.push('/home/linuxbrew/.linuxbrew', path.join(homeDir, '.linuxbrew'));
    }
    
    for (const prefix of possiblePrefixes) {
        if (!fs.existsSync(prefix)) continue;
        
        // 检查 bin 目录
        const binPath = path.join(prefix, 'bin', 'claude');
        const resolvedBinPath = resolvePathSafe(binPath);
        if (resolvedBinPath) return resolvedBinPath;
    }
    
    return null;
}

/**
 * 查找原生安装器安装的 Claude Code
 * @returns {string|null} CLI 路径或 null
 */
function findNativeInstallerCliPath() {
    const homeDir = os.homedir();
    
    // Windows 位置
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
        
        // %LOCALAPPDATA%\Claude\
        const windowsClaudePath = path.join(localAppData, 'Claude');
        if (fs.existsSync(windowsClaudePath)) {
            const exePath = path.join(windowsClaudePath, 'claude.exe');
            if (fs.existsSync(exePath)) {
                return exePath;
            }
            const cliPath = path.join(windowsClaudePath, 'cli.js');
            if (fs.existsSync(cliPath)) {
                return cliPath;
            }
        }
        
        // %USERPROFILE%\.claude\
        const dotClaudePath = path.join(homeDir, '.claude');
        if (fs.existsSync(dotClaudePath)) {
            const exePath = path.join(dotClaudePath, 'claude.exe');
            if (fs.existsSync(exePath)) {
                return exePath;
            }
        }
    }
    
    // macOS/Linux: ~/.local/bin/claude
    const localBinPath = path.join(homeDir, '.local', 'bin', 'claude');
    const resolvedLocalBinPath = resolvePathSafe(localBinPath);
    if (resolvedLocalBinPath) return resolvedLocalBinPath;
    
    // ~/.claude/local/
    const nativeBasePath = path.join(homeDir, '.claude', 'local');
    if (fs.existsSync(nativeBasePath)) {
        const cliPath = path.join(nativeBasePath, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
        if (fs.existsSync(cliPath)) {
            return cliPath;
        }
    }
    
    return null;
}

/**
 * 从 package.json 获取版本
 * @param {string} cliPath CLI 路径
 * @returns {string|null} 版本号或 null
 */
function getClaudeVersion(cliPath) {
    try {
        // 对于 .js 文件，查找同目录的 package.json
        if (cliPath.endsWith('.js') || cliPath.endsWith('.cjs')) {
            const pkgPath = path.join(path.dirname(cliPath), 'package.json');
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                return pkg.version;
            }
        }
        
        // 对于可执行文件，尝试运行 --version
        try {
            const version = execSync(`"${cliPath}" --version`, {
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true
            }).trim();
            // 提取版本号
            const match = version.match(/(\d+\.\d+\.\d+)/);
            if (match) return match[1];
        } catch (e) {
            // 无法获取版本
        }
    } catch (e) {
        // 无法读取版本
    }
    return null;
}

/**
 * 检测 claude-code 全局安装
 * @returns {Object} claude-code 状态信息
 */
function checkClaudeCode() {
    const result = {
        installed: false,
        version: null,
        path: null,
        source: null // 'npm' | 'Homebrew' | 'native' | null
    };

    // 按优先级检查
    const npmPath = findNpmGlobalCliPath();
    if (npmPath) {
        result.installed = true;
        result.path = npmPath;
        result.source = 'npm';
        result.version = getClaudeVersion(npmPath);
        return result;
    }

    const homebrewPath = findHomebrewCliPath();
    if (homebrewPath) {
        result.installed = true;
        result.path = homebrewPath;
        result.source = 'Homebrew';
        result.version = getClaudeVersion(homebrewPath);
        return result;
    }

    const nativePath = findNativeInstallerCliPath();
    if (nativePath) {
        result.installed = true;
        result.path = nativePath;
        result.source = 'native';
        result.version = getClaudeVersion(nativePath);
        return result;
    }

    return result;
}

// ============================================================================
// 综合检测
// ============================================================================

/**
 * 检测所有依赖
 * @returns {Object} 所有依赖状态
 */
function checkAllDependencies() {
    return {
        nodejs: checkNodeJs(),
        happyCoder: checkHappyCoder(),
        claudeCode: checkClaudeCode()
    };
}

// ============================================================================
// 安装辅助
// ============================================================================

/**
 * 安装 happy-coder（运行 npm install）
 * @returns {Promise<Object>} 安装结果
 */
async function installHappyCoder() {
    const { spawn } = require('child_process');
    const projectRoot = getProjectRoot();
    
    return new Promise((resolve) => {
        console.log('[DependencyChecker] Installing happy-coder...');
        
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const installProcess = spawn(npmCmd, ['install'], {
            cwd: projectRoot,
            stdio: 'pipe',
            shell: process.platform === 'win32',
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        installProcess.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        installProcess.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        installProcess.on('close', (code) => {
            if (code === 0) {
                console.log('[DependencyChecker] happy-coder installed successfully');
                resolve({ 
                    success: true, 
                    message: 'Installation successful',
                    status: checkHappyCoder()
                });
            } else {
                console.error('[DependencyChecker] happy-coder installation failed:', stderr);
                resolve({ 
                    success: false, 
                    error: stderr || 'Installation failed',
                    code 
                });
            }
        });

        installProcess.on('error', (error) => {
            console.error('[DependencyChecker] Install process error:', error.message);
            resolve({ 
                success: false, 
                error: error.message 
            });
        });
    });
}

/**
 * 获取安装指南
 * @param {string} component 组件名称 ('nodejs' | 'claudeCode')
 * @returns {Object} 安装指南信息
 */
function getInstallGuide(component) {
    const guides = {
        nodejs: {
            title: 'Node.js 安装指南',
            description: 'Node.js 是运行某些功能所必需的运行环境。',
            methods: [
                {
                    name: '官网下载（推荐）',
                    platform: 'all',
                    url: 'https://nodejs.org/',
                    command: null
                },
                {
                    name: 'Homebrew (macOS)',
                    platform: 'darwin',
                    url: null,
                    command: 'brew install node'
                },
                {
                    name: 'winget (Windows)',
                    platform: 'win32',
                    url: null,
                    command: 'winget install OpenJS.NodeJS.LTS'
                },
                {
                    name: 'apt (Ubuntu/Debian)',
                    platform: 'linux',
                    url: null,
                    command: 'sudo apt update && sudo apt install nodejs npm'
                }
            ]
        },
        claudeCode: {
            title: 'Claude Code 安装指南',
            description: 'Claude Code 是 Anthropic 官方的 AI 编程助手 CLI。',
            methods: [
                {
                    name: 'npm 全局安装（推荐）',
                    platform: 'all',
                    url: null,
                    command: 'npm install -g @anthropic-ai/claude-code'
                },
                {
                    name: 'Homebrew (macOS)',
                    platform: 'darwin',
                    url: null,
                    command: 'brew install claude-code'
                },
                {
                    name: '原生安装器 (macOS/Linux)',
                    platform: 'darwin,linux',
                    url: null,
                    command: 'curl -fsSL https://claude.ai/install.sh | bash'
                },
                {
                    name: '原生安装器 (Windows PowerShell)',
                    platform: 'win32',
                    url: null,
                    command: 'irm https://claude.ai/install.ps1 | iex'
                }
            ]
        }
    };

    const guide = guides[component];
    if (!guide) {
        return null;
    }

    // 过滤适用于当前平台的安装方法
    const currentPlatform = process.platform;
    guide.methods = guide.methods.filter(m => 
        m.platform === 'all' || m.platform.includes(currentPlatform)
    );

    return guide;
}

// ============================================================================
// 设置向导支持
// ============================================================================

/**
 * 获取设置向导所需的配置项列表
 * @param {Object} secureSettings - 安全设置模块实例（用于检查 API Key）
 * @returns {Object} 配置需求状态
 */
function getSetupRequirements(secureSettings) {
    const result = {
        ready: true,
        critical: [],
        recommended: [],
        platform: process.platform
    };

    // 检测 Claude Code（关键依赖）
    const claudeCodeStatus = checkClaudeCode();
    const claudeCodeItem = {
        id: 'claudeCode',
        name: 'Claude Code',
        status: claudeCodeStatus.installed ? 'installed' : 'missing',
        version: claudeCodeStatus.version,
        path: claudeCodeStatus.path,
        source: claudeCodeStatus.source,
        guide: getInstallGuide('claudeCode')
    };
    result.critical.push(claudeCodeItem);
    if (!claudeCodeStatus.installed) {
        result.ready = false;
    }

    // 检测 API Key（关键依赖）
    const hasApiKey = secureSettings ? secureSettings.hasSecret('claude.authToken') : false;
    const apiKeyItem = {
        id: 'apiKey',
        name: 'API Key',
        status: hasApiKey ? 'configured' : 'missing',
        description: hasApiKey ? '已配置' : '需要配置 DeepSeek 或 Anthropic API Key'
    };
    result.critical.push(apiKeyItem);
    if (!hasApiKey) {
        result.ready = false;
    }

    // 检测 Node.js（推荐依赖）
    const nodejsStatus = checkNodeJs();
    const nodejsItem = {
        id: 'nodejs',
        name: 'Node.js',
        status: nodejsStatus.installed ? 'installed' : 'missing',
        version: nodejsStatus.version,
        path: nodejsStatus.path,
        npm: nodejsStatus.npm,
        electronBuiltin: nodejsStatus.electronBuiltin,
        guide: getInstallGuide('nodejs')
    };
    result.recommended.push(nodejsItem);
    // Node.js 缺失不阻止 ready，因为 Electron 内置了 Node.js

    // 检测 JS-EYES（推荐依赖 - 浏览器插件无法自动检测）
    const jsEyesItem = {
        id: 'jsEyes',
        name: 'JS-EYES',
        status: 'optional',  // 浏览器插件无法自动检测
        description: '浏览器自动化扩展（可选）',
        guide: {
            title: 'JS-EYES 浏览器扩展',
            description: '用于控制浏览器标签页、执行脚本、提取数据',
            methods: [{
                name: 'GitHub 下载',
                platform: 'all',
                url: 'https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo/js-eyes'
            }]
        }
    };
    result.recommended.push(jsEyesItem);
    // JS-EYES 是可选依赖，不影响 ready 状态

    return result;
}

/**
 * 快速判断环境是否就绪（不返回详细信息）
 * @param {Object} secureSettings - 安全设置模块实例
 * @returns {boolean} 环境是否就绪
 */
function isEnvironmentReady(secureSettings) {
    // 检测 Claude Code
    const claudeCodeStatus = checkClaudeCode();
    if (!claudeCodeStatus.installed) {
        return false;
    }

    // 检测 API Key
    const hasApiKey = secureSettings ? secureSettings.hasSecret('claude.authToken') : false;
    if (!hasApiKey) {
        return false;
    }

    return true;
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
    // 单项检测
    checkNodeJs,
    checkHappyCoder,
    checkClaudeCode,
    
    // 综合检测
    checkAllDependencies,
    
    // 设置向导支持
    getSetupRequirements,
    isEnvironmentReady,
    
    // 安装辅助
    installHappyCoder,
    getInstallGuide,
    
    // 工具函数
    getProjectRoot
};
