#!/usr/bin/env node

/**
 * Browser Control Manager 部署器
 * 
 * 功能：
 * - 部署 CLAUDE.md 和 .claude/skills/browser-control 到工作目录
 * - 支持 deploy/update/backup/reset/status 操作
 * 
 * 用法：
 * node deploy [command] [--target name]
 * 
 * Commands:
 *   deploy   部署配置到工作目录
 *   update   更新 references 文档
 *   backup   备份当前配置
 *   reset    重置配置
 *   status   检查配置状态
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 路径常量
const DEPLOY_DIR = __dirname;
const BCM_ROOT = path.dirname(DEPLOY_DIR);
const TEMPLATES_DIR = path.join(DEPLOY_DIR, 'templates');
const SERVER_DOCS_DIR = path.join(BCM_ROOT, 'server', 'docs');
const HAPPY_CONFIG_PATH = path.join(BCM_ROOT, '..', 'happy-service', 'happy-config.json');

// 技能目录名
const SKILL_NAME = 'browser-control';
const SKILL_PATH = `.claude/skills/${SKILL_NAME}`;
const BACKUP_DIR = '.bcm-backups';

// conversation-memory 技能配置
const CONVERSATION_MEMORY_SKILL_NAME = 'conversation-memory';
const CONVERSATION_MEMORY_SKILL_PATH = `.claude/skills/${CONVERSATION_MEMORY_SKILL_NAME}`;
const CONVERSATION_MEMORY_DATA_PATH = `.claude/data/${CONVERSATION_MEMORY_SKILL_NAME}`;

class BrowserControlDeployer {
    constructor() {
        this.workDirs = this.loadWorkDirs();
        this.log('info', `加载了 ${this.workDirs.length} 个工作目录配置`);
    }

    /**
     * 加载工作目录配置
     */
    loadWorkDirs() {
        if (!fs.existsSync(HAPPY_CONFIG_PATH)) {
            this.log('warn', `配置文件不存在: ${HAPPY_CONFIG_PATH}`);
            return [];
        }

        try {
            const config = JSON.parse(fs.readFileSync(HAPPY_CONFIG_PATH, 'utf8'));
            return (config.workDirs || []).map(dir => ({
                name: dir.name,
                path: path.resolve(path.dirname(HAPPY_CONFIG_PATH), dir.path)
            }));
        } catch (err) {
            this.log('error', `读取配置文件失败: ${err.message}`);
            return [];
        }
    }

    /**
     * 日志输出
     */
    log(level, message, data = null) {
        const prefix = {
            info: '📋',
            success: '✅',
            warn: '⚠️',
            error: '❌'
        }[level] || '📋';

        console.log(`${prefix} ${message}`);
        if (data) {
            console.log('   ', data);
        }
    }

    /**
     * 获取目标工作目录
     */
    getTargetDirs(targetName) {
        if (targetName) {
            const target = this.workDirs.find(d => d.name === targetName);
            if (!target) {
                throw new Error(`未找到工作目录: ${targetName}`);
            }
            return [target];
        }
        return this.workDirs;
    }

    /**
     * 初始化 conversation-memory 数据目录
     * 在 .claude/data/conversation-memory/memories/ 下创建目录结构和初始 index.md
     */
    initConversationMemoryData(workDir) {
        const dataDir = path.join(workDir, CONVERSATION_MEMORY_DATA_PATH);
        const memoriesDir = path.join(dataDir, 'memories');
        const activeDir = path.join(memoriesDir, 'active');
        const archiveDir = path.join(memoriesDir, 'archive');
        const indexFile = path.join(memoriesDir, 'index.md');

        // 创建目录结构
        for (const dir of [memoriesDir, activeDir, archiveDir]) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // 创建初始 index.md
        if (!fs.existsSync(indexFile)) {
            const initialContent = `# 活跃记忆索引

> 此文件由脚本自动更新，记录所有活跃记忆的摘要信息。

## 索引表

<!-- INDEX_START -->
| 记忆ID | 主题 | 关键词 | 时间 |
|--------|------|--------|------|
| （暂无活跃记忆） | - | - | - |
<!-- INDEX_END -->

## 关键词汇总

<!-- KEYWORDS_START -->
（暂无有效关键词）
<!-- KEYWORDS_END -->

## 使用说明

1. 根据索引表找到相关记忆
2. 读取对应记忆的 \`active/{记忆ID}/summary.md\` 了解详情
3. 如需原始对话，读取 \`active/{记忆ID}/conversation.md\`
`;
            fs.writeFileSync(indexFile, initialContent, 'utf8');
            this.log('success', `已创建数据目录: ${CONVERSATION_MEMORY_DATA_PATH}/memories/`);
            return true;
        }
        
        return false;
    }

    /**
     * 递归复制目录
     */
    copyDirRecursive(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }

        const entries = fs.readdirSync(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                this.copyDirRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    /**
     * 部署到工作目录
     */
    async deploy(targetName) {
        const targets = this.getTargetDirs(targetName);
        
        if (targets.length === 0) {
            this.log('error', '没有可部署的工作目录');
            return;
        }

        for (const target of targets) {
            this.log('info', `部署到: ${target.name} (${target.path})`);

            if (!fs.existsSync(target.path)) {
                this.log('warn', `工作目录不存在，创建: ${target.path}`);
                fs.mkdirSync(target.path, { recursive: true });
            }

            // 1. 部署 CLAUDE.md
            const claudeMdDest = path.join(target.path, 'CLAUDE.md');
            const claudeMdSrc = path.join(TEMPLATES_DIR, 'CLAUDE.md');
            
            if (fs.existsSync(claudeMdDest)) {
                this.log('info', 'CLAUDE.md 已存在，跳过');
            } else {
                fs.copyFileSync(claudeMdSrc, claudeMdDest);
                this.log('success', '已创建 CLAUDE.md');
            }

            // 2. 部署 .claude/skills/browser-control
            const skillDest = path.join(target.path, SKILL_PATH);
            const skillSrc = path.join(TEMPLATES_DIR, 'skills', SKILL_NAME);

            if (fs.existsSync(skillDest)) {
                this.log('info', `技能目录已存在: ${SKILL_PATH}，跳过模板文件`);
            } else {
                this.copyDirRecursive(skillSrc, skillDest);
                this.log('success', `已部署技能: ${SKILL_PATH}`);
            }

            // 3. 同步 server/docs 到 references
            await this.syncReferences(target.path);

            // 4. 部署 conversation-memory 技能
            const convMemSkillDest = path.join(target.path, CONVERSATION_MEMORY_SKILL_PATH);
            const convMemSkillSrc = path.join(TEMPLATES_DIR, 'skills', CONVERSATION_MEMORY_SKILL_NAME);

            if (fs.existsSync(convMemSkillSrc)) {
                if (fs.existsSync(convMemSkillDest)) {
                    this.log('info', `技能目录已存在: ${CONVERSATION_MEMORY_SKILL_PATH}，跳过模板文件`);
                } else {
                    this.copyDirRecursive(convMemSkillSrc, convMemSkillDest);
                    this.log('success', `已部署技能: ${CONVERSATION_MEMORY_SKILL_PATH}`);
                }

                // 5. 初始化 conversation-memory 数据目录
                this.initConversationMemoryData(target.path);
            }

            this.log('success', `部署完成: ${target.name}`);
        }
    }

    /**
     * 同步 references 文档
     */
    async syncReferences(workDir) {
        const refDest = path.join(workDir, SKILL_PATH, 'references');
        
        if (!fs.existsSync(refDest)) {
            fs.mkdirSync(refDest, { recursive: true });
        }

        if (!fs.existsSync(SERVER_DOCS_DIR)) {
            this.log('warn', `文档源目录不存在: ${SERVER_DOCS_DIR}`);
            return;
        }

        const docs = fs.readdirSync(SERVER_DOCS_DIR).filter(f => f.endsWith('.md'));
        let syncCount = 0;

        for (const doc of docs) {
            // 跳过 CONTRIBUTING.md，不需要部署到工作目录
            if (doc === 'CONTRIBUTING.md') {
                continue;
            }

            const srcPath = path.join(SERVER_DOCS_DIR, doc);
            const destPath = path.join(refDest, doc);

            fs.copyFileSync(srcPath, destPath);
            syncCount++;
        }

        this.log('success', `已同步 ${syncCount} 个文档到 references/`);
    }

    /**
     * 更新 references（仅同步文档）
     */
    async update(targetName) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            this.log('info', `更新: ${target.name} (${target.path})`);

            const skillDir = path.join(target.path, SKILL_PATH);
            if (!fs.existsSync(skillDir)) {
                this.log('warn', `技能目录不存在，请先执行 deploy: ${skillDir}`);
                continue;
            }

            await this.syncReferences(target.path);
            this.log('success', `更新完成: ${target.name}`);
        }
    }

    /**
     * 备份当前配置
     */
    async backup(targetName) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            this.log('info', `备份: ${target.name} (${target.path})`);

            const skillDir = path.join(target.path, SKILL_PATH);
            const claudeMd = path.join(target.path, 'CLAUDE.md');

            if (!fs.existsSync(skillDir) && !fs.existsSync(claudeMd)) {
                this.log('warn', '没有可备份的内容');
                continue;
            }

            const backupDir = path.join(target.path, BACKUP_DIR);
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupName = `bcm-backup-${timestamp}`;
            const backupPath = path.join(backupDir, backupName);

            fs.mkdirSync(backupPath, { recursive: true });

            // 备份 CLAUDE.md
            if (fs.existsSync(claudeMd)) {
                fs.copyFileSync(claudeMd, path.join(backupPath, 'CLAUDE.md'));
            }

            // 备份技能目录
            if (fs.existsSync(skillDir)) {
                this.copyDirRecursive(skillDir, path.join(backupPath, SKILL_NAME));
            }

            this.log('success', `已备份到: ${backupPath}`);
        }
    }

    /**
     * 重置配置
     */
    async reset(targetName, skipBackup = false) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            this.log('info', `重置: ${target.name} (${target.path})`);

            // 先备份
            if (!skipBackup) {
                await this.backup(target.name);
            }

            // 删除技能目录
            const skillDir = path.join(target.path, SKILL_PATH);
            if (fs.existsSync(skillDir)) {
                fs.rmSync(skillDir, { recursive: true, force: true });
                this.log('info', `已删除: ${SKILL_PATH}`);
            }

            // 删除 CLAUDE.md（可选，这里保留）
            // const claudeMd = path.join(target.path, 'CLAUDE.md');
            // if (fs.existsSync(claudeMd)) {
            //     fs.unlinkSync(claudeMd);
            // }

            // 重新部署
            await this.deploy(target.name);

            this.log('success', `重置完成: ${target.name}`);
        }
    }

    /**
     * 检查配置状态
     */
    async status(targetName) {
        const targets = this.getTargetDirs(targetName);

        console.log('\n=== Browser Control Deployment Status ===\n');

        for (const target of targets) {
            console.log(`📁 ${target.name}: ${target.path}`);

            const claudeMd = path.join(target.path, 'CLAUDE.md');
            const skillDir = path.join(target.path, SKILL_PATH);
            const skillMd = path.join(skillDir, 'SKILL.md');
            const refDir = path.join(skillDir, 'references');
            const scriptsDir = path.join(skillDir, 'scripts');

            const checks = [
                { name: 'CLAUDE.md', path: claudeMd, type: 'file' },
                { name: 'SKILL.md', path: skillMd, type: 'file' },
                { name: 'references/', path: refDir, type: 'dir' },
                { name: 'scripts/', path: scriptsDir, type: 'dir' }
            ];

            for (const check of checks) {
                const exists = fs.existsSync(check.path);
                const icon = exists ? '✅' : '❌';
                let extra = '';

                if (exists && check.type === 'dir') {
                    const files = fs.readdirSync(check.path);
                    extra = ` (${files.length} 个文件)`;
                }

                console.log(`   ${icon} ${check.name}${extra}`);
            }

            // 检查 references 与源文档的差异
            if (fs.existsSync(refDir) && fs.existsSync(SERVER_DOCS_DIR)) {
                const srcDocs = fs.readdirSync(SERVER_DOCS_DIR).filter(f => f.endsWith('.md') && f !== 'CONTRIBUTING.md');
                const refDocs = fs.readdirSync(refDir).filter(f => f.endsWith('.md'));
                
                const missing = srcDocs.filter(d => !refDocs.includes(d));
                if (missing.length > 0) {
                    console.log(`   ⚠️ references missing: ${missing.join(', ')}`);
                }
            }

            console.log('');
        }

        console.log(`配置源: ${TEMPLATES_DIR}`);
        console.log(`文档源: ${SERVER_DOCS_DIR}`);
        console.log('');
    }
}

// CLI 入口
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'status';
    
    // 解析 --target 参数
    let targetName = null;
    const targetIndex = args.indexOf('--target');
    if (targetIndex !== -1 && args[targetIndex + 1]) {
        targetName = args[targetIndex + 1];
    }

    const deployer = new BrowserControlDeployer();

    try {
        switch (command) {
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
                const skipBackup = args.includes('--no-backup');
                await deployer.reset(targetName, skipBackup);
                break;
            case 'status':
                await deployer.status(targetName);
                break;
            case 'help':
            case '--help':
            case '-h':
                showHelp();
                break;
            default:
                console.log(`Unknown command: ${command}\n`);
                showHelp();
                process.exit(1);
        }
    } catch (err) {
        console.error(`\n❌ Error: ${err.message}\n`);
        process.exit(1);
    }
}

function showHelp() {
    console.log(`
Browser Control Manager 部署器

用法: node deploy [command] [options]

Commands:
  deploy              部署配置到工作目录
  update              更新 references 文档
  backup              备份当前配置
  reset               重置配置（先备份再重新部署）
  status              检查配置状态（默认）
  help                显示帮助信息

Options:
  --target <name>     指定目标工作目录（按 name）
  --no-backup         reset 时跳过备份

Examples:
  node deploy deploy              # 部署到所有工作目录
  node deploy deploy --target main  # 部署到 main 工作目录
  node deploy update              # 更新所有工作目录的 references
  node deploy status              # 查看部署状态
  node deploy reset --no-backup   # 重置（不备份）
`);
}

// 如果直接运行此脚本
if (require.main === module) {
    main();
}

module.exports = { BrowserControlDeployer };
