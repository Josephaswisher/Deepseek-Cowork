#!/usr/bin/env node

/**
 * Browser Control Manager Deployer
 * 
 * Features:
 * - Deploy CLAUDE.md and .claude/skills/browser-control to work directories
 * - Support deploy/update/backup/reset/status operations
 * - Support multi-language deployment (--lang en/zh)
 * 
 * Usage:
 * node deploy [command] [--target name] [--lang en|zh]
 * 
 * Commands:
 *   deploy   Deploy config to work directories
 *   update   Update references docs
 *   backup   Backup current config
 *   reset    Reset config
 *   status   Check config status
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Path constants
const DEPLOY_DIR = __dirname;
const BCM_ROOT = path.dirname(DEPLOY_DIR);
const TEMPLATES_DIR = path.join(DEPLOY_DIR, 'templates');
const SERVER_DOCS_DIR = path.join(BCM_ROOT, 'server', 'docs');
const HAPPY_CONFIG_PATH = path.join(BCM_ROOT, '..', 'happy-service', 'happy-config.json');

// Skill directory names
const SKILL_NAME = 'browser-control';
const SKILL_PATH = `.claude/skills/${SKILL_NAME}`;
const BACKUP_DIR = '.bcm-backups';

// conversation-memory skill config
const CONVERSATION_MEMORY_SKILL_NAME = 'conversation-memory';
const CONVERSATION_MEMORY_SKILL_PATH = `.claude/skills/${CONVERSATION_MEMORY_SKILL_NAME}`;
const CONVERSATION_MEMORY_DATA_PATH = `.claude/data/${CONVERSATION_MEMORY_SKILL_NAME}`;

// i18n messages
const MESSAGES = {
    en: {
        loadedWorkDirs: (count) => `Loaded ${count} work directory config(s)`,
        configNotFound: (path) => `Config file not found: ${path}`,
        readConfigFailed: (err) => `Failed to read config file: ${err}`,
        workDirNotFound: (name) => `Work directory not found: ${name}`,
        noDeployableDirs: 'No deployable work directories',
        deployingTo: (name, path) => `Deploying to: ${name} (${path})`,
        workDirNotExist: (path) => `Work directory does not exist, creating: ${path}`,
        claudeExists: 'CLAUDE.md already exists, skipping',
        claudeCreated: 'Created CLAUDE.md',
        skillExists: (path) => `Skill directory already exists: ${path}, skipping templates`,
        skillDeployed: (path) => `Deployed skill: ${path}`,
        syncedDocs: (count) => `Synced ${count} document(s) to references/`,
        docsSourceNotFound: (path) => `Docs source directory not found: ${path}`,
        dataCreated: (path) => `Created data directory: ${path}`,
        deployComplete: (name) => `Deploy complete: ${name}`,
        updating: (name, path) => `Updating: ${name} (${path})`,
        skillDirNotExist: (path) => `Skill directory does not exist, please run deploy first: ${path}`,
        updateComplete: (name) => `Update complete: ${name}`,
        backingUp: (name, path) => `Backing up: ${name} (${path})`,
        nothingToBackup: 'Nothing to backup',
        backedUpTo: (path) => `Backed up to: ${path}`,
        resetting: (name, path) => `Resetting: ${name} (${path})`,
        deleted: (path) => `Deleted: ${path}`,
        resetComplete: (name) => `Reset complete: ${name}`,
        configSource: (path) => `Config source: ${path}`,
        docsSource: (path) => `Docs source: ${path}`,
        filesCount: (count) => `(${count} files)`,
        refsMissing: (files) => `references missing: ${files}`,
        usingLanguage: (lang) => `Using language: ${lang}`,
        memoryIndexTitle: 'Active Memory Index',
        memoryIndexNote: 'This file is auto-updated, recording all active memory summaries.',
        memoryIndexTable: 'Index Table',
        memoryIndexNoMemory: '(No active memories)',
        memoryIndexKeywords: 'Keywords Summary',
        memoryIndexNoKeywords: '(No valid keywords)',
        memoryIndexUsage: 'Usage Instructions',
        memoryIndexUsage1: '1. Find related memory from index table',
        memoryIndexUsage2: '2. Read `active/{memoryId}/summary.md` for details',
        memoryIndexUsage3: '3. Read `active/{memoryId}/conversation.md` for original conversation'
    },
    zh: {
        loadedWorkDirs: (count) => `加载了 ${count} 个工作目录配置`,
        configNotFound: (path) => `配置文件不存在: ${path}`,
        readConfigFailed: (err) => `读取配置文件失败: ${err}`,
        workDirNotFound: (name) => `未找到工作目录: ${name}`,
        noDeployableDirs: '没有可部署的工作目录',
        deployingTo: (name, path) => `部署到: ${name} (${path})`,
        workDirNotExist: (path) => `工作目录不存在，创建: ${path}`,
        claudeExists: 'CLAUDE.md 已存在，跳过',
        claudeCreated: '已创建 CLAUDE.md',
        skillExists: (path) => `技能目录已存在: ${path}，跳过模板文件`,
        skillDeployed: (path) => `已部署技能: ${path}`,
        syncedDocs: (count) => `已同步 ${count} 个文档到 references/`,
        docsSourceNotFound: (path) => `文档源目录不存在: ${path}`,
        dataCreated: (path) => `已创建数据目录: ${path}`,
        deployComplete: (name) => `部署完成: ${name}`,
        updating: (name, path) => `更新: ${name} (${path})`,
        skillDirNotExist: (path) => `技能目录不存在，请先执行 deploy: ${path}`,
        updateComplete: (name) => `更新完成: ${name}`,
        backingUp: (name, path) => `备份: ${name} (${path})`,
        nothingToBackup: '没有可备份的内容',
        backedUpTo: (path) => `已备份到: ${path}`,
        resetting: (name, path) => `重置: ${name} (${path})`,
        deleted: (path) => `已删除: ${path}`,
        resetComplete: (name) => `重置完成: ${name}`,
        configSource: (path) => `配置源: ${path}`,
        docsSource: (path) => `文档源: ${path}`,
        filesCount: (count) => `(${count} 个文件)`,
        refsMissing: (files) => `references 缺失: ${files}`,
        usingLanguage: (lang) => `使用语言: ${lang}`,
        memoryIndexTitle: '活跃记忆索引',
        memoryIndexNote: '此文件由脚本自动更新，记录所有活跃记忆的摘要信息。',
        memoryIndexTable: '索引表',
        memoryIndexNoMemory: '（暂无活跃记忆）',
        memoryIndexKeywords: '关键词汇总',
        memoryIndexNoKeywords: '（暂无有效关键词）',
        memoryIndexUsage: '使用说明',
        memoryIndexUsage1: '1. 根据索引表找到相关记忆',
        memoryIndexUsage2: '2. 读取对应记忆的 `active/{记忆ID}/summary.md` 了解详情',
        memoryIndexUsage3: '3. 如需原始对话，读取 `active/{记忆ID}/conversation.md`'
    }
};

class BrowserControlDeployer {
    constructor(lang = 'en') {
        this.lang = lang;
        this.msg = MESSAGES[lang] || MESSAGES.en;
        this.workDirs = this.loadWorkDirs();
        this.log('info', this.msg.loadedWorkDirs(this.workDirs.length));
    }

    /**
     * Get source directory based on language
     * en: templates/js-skills/
     * zh: templates/i18n/zh/js-skills/
     */
    getSourceDir() {
        if (this.lang === 'zh') {
            return path.join(TEMPLATES_DIR, 'i18n', 'zh', 'js-skills');
        }
        return path.join(TEMPLATES_DIR, 'js-skills');
    }

    /**
     * Load work directories config
     */
    loadWorkDirs() {
        if (!fs.existsSync(HAPPY_CONFIG_PATH)) {
            this.log('warn', this.msg.configNotFound(HAPPY_CONFIG_PATH));
            return [];
        }

        try {
            const config = JSON.parse(fs.readFileSync(HAPPY_CONFIG_PATH, 'utf8'));
            return (config.workDirs || []).map(dir => ({
                name: dir.name,
                path: path.resolve(path.dirname(HAPPY_CONFIG_PATH), dir.path)
            }));
        } catch (err) {
            this.log('error', this.msg.readConfigFailed(err.message));
            return [];
        }
    }

    /**
     * Log output
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
     * Get target work directories
     */
    getTargetDirs(targetName) {
        if (targetName) {
            const target = this.workDirs.find(d => d.name === targetName);
            if (!target) {
                throw new Error(this.msg.workDirNotFound(targetName));
            }
            return [target];
        }
        return this.workDirs;
    }

    /**
     * Initialize conversation-memory data directory
     */
    initConversationMemoryData(workDir) {
        const dataDir = path.join(workDir, CONVERSATION_MEMORY_DATA_PATH);
        const memoriesDir = path.join(dataDir, 'memories');
        const activeDir = path.join(memoriesDir, 'active');
        const archiveDir = path.join(memoriesDir, 'archive');
        const indexFile = path.join(memoriesDir, 'index.md');

        // Create directory structure
        for (const dir of [memoriesDir, activeDir, archiveDir]) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // Create initial index.md
        if (!fs.existsSync(indexFile)) {
            const m = this.msg;
            const initialContent = `# ${m.memoryIndexTitle}

> ${m.memoryIndexNote}

## ${m.memoryIndexTable}

<!-- INDEX_START -->
| Memory ID | Topic | Keywords | Time |
|-----------|-------|----------|------|
| ${m.memoryIndexNoMemory} | - | - | - |
<!-- INDEX_END -->

## ${m.memoryIndexKeywords}

<!-- KEYWORDS_START -->
${m.memoryIndexNoKeywords}
<!-- KEYWORDS_END -->

## ${m.memoryIndexUsage}

${m.memoryIndexUsage1}
${m.memoryIndexUsage2}
${m.memoryIndexUsage3}
`;
            fs.writeFileSync(indexFile, initialContent, 'utf8');
            this.log('success', this.msg.dataCreated(`${CONVERSATION_MEMORY_DATA_PATH}/memories/`));
            return true;
        }
        
        return false;
    }

    /**
     * Recursively copy directory
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
     * Deploy to work directories
     */
    async deploy(targetName) {
        const targets = this.getTargetDirs(targetName);
        
        if (targets.length === 0) {
            this.log('error', this.msg.noDeployableDirs);
            return;
        }

        const sourceDir = this.getSourceDir();
        this.log('info', this.msg.usingLanguage(this.lang));

        for (const target of targets) {
            this.log('info', this.msg.deployingTo(target.name, target.path));

            if (!fs.existsSync(target.path)) {
                this.log('warn', this.msg.workDirNotExist(target.path));
                fs.mkdirSync(target.path, { recursive: true });
            }

            // 1. Deploy CLAUDE.md
            const claudeMdDest = path.join(target.path, 'CLAUDE.md');
            const claudeMdSrc = path.join(sourceDir, 'CLAUDE.md');
            
            if (fs.existsSync(claudeMdDest)) {
                this.log('info', this.msg.claudeExists);
            } else {
                fs.copyFileSync(claudeMdSrc, claudeMdDest);
                this.log('success', this.msg.claudeCreated);
            }

            // 2. Deploy .claude/skills/browser-control
            const skillDest = path.join(target.path, SKILL_PATH);
            const skillSrc = path.join(sourceDir, 'skills', SKILL_NAME);

            if (fs.existsSync(skillDest)) {
                this.log('info', this.msg.skillExists(SKILL_PATH));
            } else {
                this.copyDirRecursive(skillSrc, skillDest);
                this.log('success', this.msg.skillDeployed(SKILL_PATH));
            }

            // 3. Sync server/docs to references
            await this.syncReferences(target.path);

            // 4. Deploy conversation-memory skill
            const convMemSkillDest = path.join(target.path, CONVERSATION_MEMORY_SKILL_PATH);
            const convMemSkillSrc = path.join(sourceDir, 'skills', CONVERSATION_MEMORY_SKILL_NAME);

            if (fs.existsSync(convMemSkillSrc)) {
                if (fs.existsSync(convMemSkillDest)) {
                    this.log('info', this.msg.skillExists(CONVERSATION_MEMORY_SKILL_PATH));
                } else {
                    this.copyDirRecursive(convMemSkillSrc, convMemSkillDest);
                    this.log('success', this.msg.skillDeployed(CONVERSATION_MEMORY_SKILL_PATH));
                }

                // 5. Initialize conversation-memory data directory
                this.initConversationMemoryData(target.path);
            }

            this.log('success', this.msg.deployComplete(target.name));
        }
    }

    /**
     * Sync references docs
     */
    async syncReferences(workDir) {
        const refDest = path.join(workDir, SKILL_PATH, 'references');
        
        if (!fs.existsSync(refDest)) {
            fs.mkdirSync(refDest, { recursive: true });
        }

        if (!fs.existsSync(SERVER_DOCS_DIR)) {
            this.log('warn', this.msg.docsSourceNotFound(SERVER_DOCS_DIR));
            return;
        }

        const docs = fs.readdirSync(SERVER_DOCS_DIR).filter(f => f.endsWith('.md'));
        let syncCount = 0;

        for (const doc of docs) {
            // Skip CONTRIBUTING.md
            if (doc === 'CONTRIBUTING.md') {
                continue;
            }

            const srcPath = path.join(SERVER_DOCS_DIR, doc);
            const destPath = path.join(refDest, doc);

            fs.copyFileSync(srcPath, destPath);
            syncCount++;
        }

        this.log('success', this.msg.syncedDocs(syncCount));
    }

    /**
     * Update references (sync docs only)
     */
    async update(targetName) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            this.log('info', this.msg.updating(target.name, target.path));

            const skillDir = path.join(target.path, SKILL_PATH);
            if (!fs.existsSync(skillDir)) {
                this.log('warn', this.msg.skillDirNotExist(skillDir));
                continue;
            }

            await this.syncReferences(target.path);
            this.log('success', this.msg.updateComplete(target.name));
        }
    }

    /**
     * Backup current config
     */
    async backup(targetName) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            this.log('info', this.msg.backingUp(target.name, target.path));

            const skillDir = path.join(target.path, SKILL_PATH);
            const claudeMd = path.join(target.path, 'CLAUDE.md');

            if (!fs.existsSync(skillDir) && !fs.existsSync(claudeMd)) {
                this.log('warn', this.msg.nothingToBackup);
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

            // Backup CLAUDE.md
            if (fs.existsSync(claudeMd)) {
                fs.copyFileSync(claudeMd, path.join(backupPath, 'CLAUDE.md'));
            }

            // Backup skill directory
            if (fs.existsSync(skillDir)) {
                this.copyDirRecursive(skillDir, path.join(backupPath, SKILL_NAME));
            }

            this.log('success', this.msg.backedUpTo(backupPath));
        }
    }

    /**
     * Reset config
     */
    async reset(targetName, skipBackup = false) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            this.log('info', this.msg.resetting(target.name, target.path));

            // Backup first
            if (!skipBackup) {
                await this.backup(target.name);
            }

            // Delete skill directory
            const skillDir = path.join(target.path, SKILL_PATH);
            if (fs.existsSync(skillDir)) {
                fs.rmSync(skillDir, { recursive: true, force: true });
                this.log('info', this.msg.deleted(SKILL_PATH));
            }

            // Redeploy
            await this.deploy(target.name);

            this.log('success', this.msg.resetComplete(target.name));
        }
    }

    /**
     * Check config status
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
                    extra = ` ${this.msg.filesCount(files.length)}`;
                }

                console.log(`   ${icon} ${check.name}${extra}`);
            }

            // Check references vs source docs
            if (fs.existsSync(refDir) && fs.existsSync(SERVER_DOCS_DIR)) {
                const srcDocs = fs.readdirSync(SERVER_DOCS_DIR).filter(f => f.endsWith('.md') && f !== 'CONTRIBUTING.md');
                const refDocs = fs.readdirSync(refDir).filter(f => f.endsWith('.md'));
                
                const missing = srcDocs.filter(d => !refDocs.includes(d));
                if (missing.length > 0) {
                    console.log(`   ⚠️ ${this.msg.refsMissing(missing.join(', '))}`);
                }
            }

            console.log('');
        }

        console.log(this.msg.configSource(this.getSourceDir()));
        console.log(this.msg.docsSource(SERVER_DOCS_DIR));
        console.log('');
    }
}

// CLI entry
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'status';
    
    // Parse --target parameter
    let targetName = null;
    const targetIndex = args.indexOf('--target');
    if (targetIndex !== -1 && args[targetIndex + 1]) {
        targetName = args[targetIndex + 1];
    }

    // Parse --lang parameter (default: en)
    let lang = 'en';
    const langIndex = args.indexOf('--lang');
    if (langIndex !== -1 && args[langIndex + 1]) {
        const langArg = args[langIndex + 1].toLowerCase();
        if (langArg === 'zh' || langArg === 'cn' || langArg === 'chinese') {
            lang = 'zh';
        }
    }

    const deployer = new BrowserControlDeployer(lang);

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
Browser Control Manager Deployer

Usage: node deploy [command] [options]

Commands:
  deploy              Deploy config to work directories
  update              Update references docs
  backup              Backup current config
  reset               Reset config (backup first, then redeploy)
  status              Check config status (default)
  help                Show help message

Options:
  --target <name>     Specify target work directory (by name)
  --lang <en|zh>      Specify language (default: en)
  --no-backup         Skip backup when resetting

Examples:
  node deploy deploy                    # Deploy to all work directories (English)
  node deploy deploy --lang zh          # Deploy to all work directories (Chinese)
  node deploy deploy --target main      # Deploy to 'main' work directory
  node deploy update                    # Update all work directories' references
  node deploy status                    # Check deployment status
  node deploy reset --no-backup         # Reset (without backup)
`);
}

// If run directly
if (require.main === module) {
    main();
}

module.exports = { BrowserControlDeployer };
