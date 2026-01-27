/**
 * deploy 命令 - 部署技能到工作目录
 * 
 * 创建时间: 2026-01-28
 */

import chalk from 'chalk';
import path from 'path';
import { SkillsDeployer } from '../lib/deployer/index.mjs';

/**
 * 显示帮助信息
 */
function showHelp() {
    console.log(`
${chalk.bold('Deploy Command - Deploy skills to work directories')}

${chalk.cyan('Usage:')}
  deepseek-cowork deploy [action] [options]

${chalk.cyan('Actions:')}
  deploy    Deploy CLAUDE.md and skills to work directories (default)
  update    Update references docs
  backup    Backup current config
  reset     Reset config (backup first, then redeploy)
  status    Check deployment status

${chalk.cyan('Options:')}
  --target <name>    Specify target work directory by name
  --lang <en|zh>     Specify language (default: en)
  --from <path>      Deploy custom skill from specified path
  --no-backup        Skip backup when resetting

${chalk.cyan('Examples:')}
  # Deploy to all work directories (English)
  deepseek-cowork deploy

  # Deploy to all work directories (Chinese)
  deepseek-cowork deploy --lang zh

  # Deploy to specific work directory
  deepseek-cowork deploy --target my-project

  # Check deployment status
  deepseek-cowork deploy status

  # Deploy custom skill from path
  deepseek-cowork deploy --from ./my-custom-skill --target my-project

  # Update references docs
  deepseek-cowork deploy update

  # Reset with backup
  deepseek-cowork deploy reset

  # Reset without backup
  deepseek-cowork deploy reset --no-backup
`);
}

/**
 * deploy 命令处理函数
 * @param {string} action - 操作类型
 * @param {Object} options - 命令选项
 */
export async function deployCommand(action, options = {}) {
    // 如果 action 是对象，说明没有传入 action，options 是第一个参数
    if (typeof action === 'object') {
        options = action;
        action = 'deploy';
    }
    
    // 默认 action
    action = action || 'deploy';
    
    // 解析选项
    const targetName = options.target || null;
    const lang = (options.lang || 'en').toLowerCase();
    const customPath = options.from || null;
    const noBackup = options.noBackup || false;
    
    // 规范化语言代码
    const normalizedLang = (lang === 'zh' || lang === 'cn' || lang === 'chinese') ? 'zh' : 'en';
    
    // 处理帮助
    if (action === 'help' || action === '--help' || action === '-h') {
        showHelp();
        return;
    }

    try {
        // 处理自定义路径
        let resolvedCustomPath = null;
        if (customPath) {
            resolvedCustomPath = path.resolve(process.cwd(), customPath);
        }
        
        // 创建 deployer 实例
        const deployer = new SkillsDeployer(normalizedLang, resolvedCustomPath);
        
        switch (action) {
            case 'deploy':
                await deployer.deploy(targetName);
                break;
            case 'update':
                await deployer.update(targetName);
                break;
            case 'backup':
                await deployer.backup(targetName);
                break;
            case 'reset':
                await deployer.reset(targetName, noBackup);
                break;
            case 'status':
                await deployer.status(targetName);
                break;
            default:
                console.log(chalk.red(`Unknown action: ${action}`));
                console.log('');
                showHelp();
                process.exit(1);
        }
    } catch (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        if (options.debug) {
            console.error(error);
        }
        process.exit(1);
    }
}

export default deployCommand;
