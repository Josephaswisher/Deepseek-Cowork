/**
 * Skills Deployer
 * 部署 CLAUDE.md 和 skills 到工作目录
 * 
 * 创建时间: 2026-01-28
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { getMessages } from './messages.mjs';
import {
    SKILLS_DIR,
    SERVER_DOCS_DIR,
    HAPPY_CONFIG_PATH,
    SKILL_NAME,
    SKILL_PATH,
    BACKUP_DIR,
    CONVERSATION_MEMORY_SKILL_NAME,
    CONVERSATION_MEMORY_SKILL_PATH,
    CONVERSATION_MEMORY_DATA_PATH,
    getSkillsSourceDir
} from './paths.mjs';

export class SkillsDeployer {
    /**
     * @param {string} lang - 语言代码 ('en' | 'zh')
     * @param {string} customSourceDir - 自定义源目录路径（可选，用于 --from 参数）
     */
    constructor(lang = 'en', customSourceDir = null) {
        this.lang = lang;
        this.msg = getMessages(lang);
        this.customSourceDir = customSourceDir;
        this.workDirs = this.loadWorkDirs();
        this.spinner = null;
    }

    /**
     * 获取源目录（优先使用自定义路径）
     */
    getSourceDir() {
        if (this.customSourceDir) {
            return this.customSourceDir;
        }
        return getSkillsSourceDir(this.lang);
    }

    /**
     * 加载工作目录配置
     */
    loadWorkDirs() {
        if (!fs.existsSync(HAPPY_CONFIG_PATH)) {
            console.log(chalk.yellow(`${this.msg.configNotFound(HAPPY_CONFIG_PATH)}`));
            return [];
        }

        try {
            const config = JSON.parse(fs.readFileSync(HAPPY_CONFIG_PATH, 'utf8'));
            const dirs = (config.workDirs || []).map(dir => ({
                name: dir.name,
                path: path.resolve(path.dirname(HAPPY_CONFIG_PATH), dir.path)
            }));
            console.log(chalk.dim(this.msg.loadedWorkDirs(dirs.length)));
            return dirs;
        } catch (err) {
            console.log(chalk.red(this.msg.readConfigFailed(err.message)));
            return [];
        }
    }

    /**
     * 日志输出
     */
    log(level, message) {
        const styles = {
            info: chalk.blue,
            success: chalk.green,
            warn: chalk.yellow,
            error: chalk.red
        };
        const style = styles[level] || chalk.white;
        console.log(style(message));
    }

    /**
     * 获取目标工作目录
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
     * 初始化 conversation-memory 数据目录
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
     * @param {string} targetName - 目标工作目录名称（可选）
     */
    async deploy(targetName) {
        const targets = this.getTargetDirs(targetName);
        
        if (targets.length === 0) {
            this.log('error', this.msg.noDeployableDirs);
            return;
        }

        const sourceDir = this.getSourceDir();
        
        // 检查自定义源目录是否存在
        if (this.customSourceDir && !fs.existsSync(this.customSourceDir)) {
            this.log('error', this.msg.customSourceNotFound(this.customSourceDir));
            return;
        }

        if (this.customSourceDir) {
            this.log('info', this.msg.deployingFromCustom(this.customSourceDir));
        } else {
            this.log('info', this.msg.usingLanguage(this.lang));
        }

        for (const target of targets) {
            const spinner = ora(this.msg.deployingTo(target.name, target.path)).start();

            try {
                if (!fs.existsSync(target.path)) {
                    spinner.text = this.msg.workDirNotExist(target.path);
                    fs.mkdirSync(target.path, { recursive: true });
                }

                // 如果是自定义路径部署，直接部署整个目录为一个技能
                if (this.customSourceDir) {
                    await this.deployCustomSkill(target.path, sourceDir);
                } else {
                    // 标准部署流程
                    await this.deployStandard(target, sourceDir);
                }

                spinner.succeed(this.msg.deployComplete(target.name));
            } catch (error) {
                spinner.fail(`Deploy failed: ${error.message}`);
            }
        }
    }

    /**
     * 标准部署流程（内置技能）
     */
    async deployStandard(target, sourceDir) {
        // 1. 部署 CLAUDE.md
        const claudeMdDest = path.join(target.path, 'CLAUDE.md');
        const claudeMdSrc = path.join(sourceDir, 'CLAUDE.md');
        
        if (fs.existsSync(claudeMdDest)) {
            this.log('info', this.msg.claudeExists);
        } else if (fs.existsSync(claudeMdSrc)) {
            fs.copyFileSync(claudeMdSrc, claudeMdDest);
            this.log('success', this.msg.claudeCreated);
        }

        // 2. 部署 .claude/skills/browser-control
        const skillDest = path.join(target.path, SKILL_PATH);
        const skillSrc = path.join(sourceDir, 'skills', SKILL_NAME);

        if (fs.existsSync(skillDest)) {
            this.log('info', this.msg.skillExists(SKILL_PATH));
        } else if (fs.existsSync(skillSrc)) {
            this.copyDirRecursive(skillSrc, skillDest);
            this.log('success', this.msg.skillDeployed(SKILL_PATH));
        }

        // 3. 同步 server/docs 到 references
        await this.syncReferences(target.path);

        // 4. 部署 conversation-memory skill
        const convMemSkillDest = path.join(target.path, CONVERSATION_MEMORY_SKILL_PATH);
        const convMemSkillSrc = path.join(sourceDir, 'skills', CONVERSATION_MEMORY_SKILL_NAME);

        if (fs.existsSync(convMemSkillSrc)) {
            if (fs.existsSync(convMemSkillDest)) {
                this.log('info', this.msg.skillExists(CONVERSATION_MEMORY_SKILL_PATH));
            } else {
                this.copyDirRecursive(convMemSkillSrc, convMemSkillDest);
                this.log('success', this.msg.skillDeployed(CONVERSATION_MEMORY_SKILL_PATH));
            }

            // 5. 初始化 conversation-memory 数据目录
            this.initConversationMemoryData(target.path);
        }
    }

    /**
     * 从自定义路径部署技能
     */
    async deployCustomSkill(workDir, customPath) {
        // 获取技能名称（使用目录名）
        const skillName = path.basename(customPath);
        const skillDest = path.join(workDir, `.claude/skills/${skillName}`);

        if (fs.existsSync(skillDest)) {
            this.log('info', this.msg.skillExists(`.claude/skills/${skillName}`));
        } else {
            this.copyDirRecursive(customPath, skillDest);
            this.log('success', this.msg.customSkillDeployed(skillName));
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
            this.log('warn', this.msg.docsSourceNotFound(SERVER_DOCS_DIR));
            return;
        }

        const docs = fs.readdirSync(SERVER_DOCS_DIR).filter(f => f.endsWith('.md'));
        let syncCount = 0;

        for (const doc of docs) {
            // 跳过 CONTRIBUTING.md
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
     * 更新 references（仅同步文档）
     */
    async update(targetName) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            const spinner = ora(this.msg.updating(target.name, target.path)).start();

            try {
                const skillDir = path.join(target.path, SKILL_PATH);
                if (!fs.existsSync(skillDir)) {
                    spinner.warn(this.msg.skillDirNotExist(skillDir));
                    continue;
                }

                await this.syncReferences(target.path);
                spinner.succeed(this.msg.updateComplete(target.name));
            } catch (error) {
                spinner.fail(`Update failed: ${error.message}`);
            }
        }
    }

    /**
     * 备份当前配置
     */
    async backup(targetName) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            const spinner = ora(this.msg.backingUp(target.name, target.path)).start();

            try {
                const skillDir = path.join(target.path, SKILL_PATH);
                const claudeMd = path.join(target.path, 'CLAUDE.md');

                if (!fs.existsSync(skillDir) && !fs.existsSync(claudeMd)) {
                    spinner.warn(this.msg.nothingToBackup);
                    continue;
                }

                const backupDir = path.join(target.path, BACKUP_DIR);
                if (!fs.existsSync(backupDir)) {
                    fs.mkdirSync(backupDir, { recursive: true });
                }

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupName = `skills-backup-${timestamp}`;
                const backupPath = path.join(backupDir, backupName);

                fs.mkdirSync(backupPath, { recursive: true });

                // 备份 CLAUDE.md
                if (fs.existsSync(claudeMd)) {
                    fs.copyFileSync(claudeMd, path.join(backupPath, 'CLAUDE.md'));
                }

                // 备份 skill 目录
                if (fs.existsSync(skillDir)) {
                    this.copyDirRecursive(skillDir, path.join(backupPath, SKILL_NAME));
                }

                spinner.succeed(this.msg.backedUpTo(backupPath));
            } catch (error) {
                spinner.fail(`Backup failed: ${error.message}`);
            }
        }
    }

    /**
     * 重置配置
     */
    async reset(targetName, skipBackup = false) {
        const targets = this.getTargetDirs(targetName);

        for (const target of targets) {
            const spinner = ora(this.msg.resetting(target.name, target.path)).start();

            try {
                // 先备份
                if (!skipBackup) {
                    spinner.stop();
                    await this.backup(target.name);
                    spinner.start(this.msg.resetting(target.name, target.path));
                }

                // 删除 skill 目录
                const skillDir = path.join(target.path, SKILL_PATH);
                if (fs.existsSync(skillDir)) {
                    fs.rmSync(skillDir, { recursive: true, force: true });
                    this.log('info', this.msg.deleted(SKILL_PATH));
                }

                // 重新部署
                spinner.stop();
                await this.deploy(target.name);

                console.log(chalk.green(this.msg.resetComplete(target.name)));
            } catch (error) {
                spinner.fail(`Reset failed: ${error.message}`);
            }
        }
    }

    /**
     * 检查配置状态
     */
    async status(targetName) {
        const targets = this.getTargetDirs(targetName);

        console.log('\n' + chalk.bold('=== Skills Deployment Status ===') + '\n');

        for (const target of targets) {
            console.log(chalk.cyan(`📁 ${target.name}: ${target.path}`));

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
                const icon = exists ? chalk.green('✓') : chalk.red('✗');
                let extra = '';

                if (exists && check.type === 'dir') {
                    const files = fs.readdirSync(check.path);
                    extra = chalk.dim(` ${this.msg.filesCount(files.length)}`);
                }

                console.log(`   ${icon} ${check.name}${extra}`);
            }

            // 检查 references 与源文档的差异
            if (fs.existsSync(refDir) && fs.existsSync(SERVER_DOCS_DIR)) {
                const srcDocs = fs.readdirSync(SERVER_DOCS_DIR).filter(f => f.endsWith('.md') && f !== 'CONTRIBUTING.md');
                const refDocs = fs.readdirSync(refDir).filter(f => f.endsWith('.md'));
                
                const missing = srcDocs.filter(d => !refDocs.includes(d));
                if (missing.length > 0) {
                    console.log(chalk.yellow(`   ⚠ ${this.msg.refsMissing(missing.join(', '))}`));
                }
            }

            console.log('');
        }

        console.log(chalk.dim(this.msg.configSource(this.getSourceDir())));
        console.log(chalk.dim(this.msg.docsSource(SERVER_DOCS_DIR)));
        console.log('');
    }
}

export default SkillsDeployer;
