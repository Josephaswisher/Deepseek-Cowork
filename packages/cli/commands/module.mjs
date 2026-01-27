/**
 * module 命令 - 管理服务器模块
 * 
 * 创建时间: 2026-01-28
 */

import chalk from 'chalk';
import path from 'path';
import { ServerModuleDeployer } from '../lib/deployer/index.mjs';

/**
 * 显示帮助信息
 */
function showHelp() {
    console.log(`
${chalk.bold('Module Command - Manage server modules')}

${chalk.cyan('Usage:')}
  deepseek-cowork module [action] [name] [options]

${chalk.cyan('Actions:')}
  list              List available server modules (default)
  deploy <name>     Deploy specified module to user data directory
  remove <name>     Remove deployed module
  status            Check deployed modules status

${chalk.cyan('Options:')}
  --lang <en|zh>    Specify language (default: en)
  --from <path>     Deploy custom module from specified path

${chalk.cyan('Examples:')}
  # List available modules
  deepseek-cowork module
  deepseek-cowork module list

  # Deploy a built-in module
  deepseek-cowork module deploy demo-module

  # Deploy with Chinese messages
  deepseek-cowork module deploy demo-module --lang zh

  # Deploy custom module from path
  deepseek-cowork module deploy my-module --from ./my-module-source

  # Check deployed modules status
  deepseek-cowork module status

  # Remove deployed module
  deepseek-cowork module remove demo-module
`);
}

/**
 * module 命令处理函数
 * @param {string} action - 操作类型
 * @param {string} name - 模块名称
 * @param {Object} options - 命令选项
 */
export async function moduleCommand(action, name, options = {}) {
    // 处理参数：如果 action 是对象，说明没有传入 action
    if (typeof action === 'object') {
        options = action;
        action = 'list';
        name = null;
    } else if (typeof name === 'object') {
        options = name;
        name = null;
    }
    
    // 默认 action
    action = action || 'list';
    
    // 解析选项
    const lang = (options.lang || 'en').toLowerCase();
    const customPath = options.from || null;
    
    // 规范化语言代码
    const normalizedLang = (lang === 'zh' || lang === 'cn' || lang === 'chinese') ? 'zh' : 'en';
    
    // 处理帮助
    if (action === 'help' || action === '--help' || action === '-h') {
        showHelp();
        return;
    }

    try {
        // 创建 deployer 实例
        const deployer = new ServerModuleDeployer(normalizedLang);
        
        switch (action) {
            case 'list':
                deployer.listModules();
                break;
                
            case 'deploy':
                if (!name && !customPath) {
                    console.log(chalk.red('Error: Please specify module name or use --from <path>'));
                    console.log('');
                    showHelp();
                    process.exit(1);
                }
                
                if (customPath) {
                    // 从自定义路径部署
                    const resolvedPath = path.resolve(process.cwd(), customPath);
                    await deployer.deployFromPath(resolvedPath, name);
                } else {
                    // 从内置模板部署
                    await deployer.deployModule(name);
                }
                break;
                
            case 'remove':
                if (!name) {
                    console.log(chalk.red('Error: Please specify module name to remove'));
                    console.log('');
                    showHelp();
                    process.exit(1);
                }
                await deployer.removeModule(name);
                break;
                
            case 'status':
                deployer.moduleStatus();
                break;
                
            default:
                // 如果 action 不是预定义的操作，可能是模块名称（用于简化语法）
                // 例如: deepseek-cowork module demo-module
                // 等同于: deepseek-cowork module deploy demo-module
                if (action && !['list', 'deploy', 'remove', 'status'].includes(action)) {
                    // 尝试作为模块名处理
                    if (customPath) {
                        const resolvedPath = path.resolve(process.cwd(), customPath);
                        await deployer.deployFromPath(resolvedPath, action);
                    } else {
                        await deployer.deployModule(action);
                    }
                } else {
                    console.log(chalk.red(`Unknown action: ${action}`));
                    console.log('');
                    showHelp();
                    process.exit(1);
                }
        }
    } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        if (options.debug) {
            console.error(error);
        }
        process.exit(1);
    }
}

export default moduleCommand;
