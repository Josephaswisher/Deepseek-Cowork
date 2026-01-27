/**
 * Deploy 模块 i18n 消息
 * 
 * 创建时间: 2026-01-28
 */

export const MESSAGES = {
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
        memoryIndexUsage3: '3. Read `active/{memoryId}/conversation.md` for original conversation',
        // Server module messages
        moduleListTitle: 'Available Server Modules',
        moduleNotFound: (name) => `Module not found: ${name}`,
        moduleSourceNotFound: (path) => `Module source directory not found: ${path}`,
        moduleAlreadyDeployed: (name) => `Module already deployed: ${name}`,
        moduleDeploying: (name) => `Deploying module: ${name}`,
        moduleDeployComplete: (name) => `Module deployed successfully: ${name}`,
        moduleConfigUpdated: 'Module config updated',
        moduleRemoved: (name) => `Module removed: ${name}`,
        moduleNotDeployed: (name) => `Module not deployed: ${name}`,
        moduleStatusTitle: 'Deployed Server Modules',
        noModulesDeployed: 'No modules deployed',
        userDataDir: (path) => `User data directory: ${path}`,
        restartHint: 'Please restart the service to load the new module',
        // Hot reload messages
        hotLoadAttempting: (name) => `Attempting hot reload: ${name}`,
        hotLoadSuccess: (name) => `Hot reload successful: ${name}`,
        hotLoadFailed: (name, err) => `Hot reload failed (${name}): ${err}`,
        hotLoadSkipped: 'Service not running, hot reload skipped',
        // Custom deploy messages
        customSourceNotFound: (path) => `Custom source directory not found: ${path}`,
        deployingFromCustom: (path) => `Deploying from custom path: ${path}`,
        customSkillDeployed: (name) => `Custom skill deployed: ${name}`
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
        memoryIndexUsage3: '3. 如需原始对话，读取 `active/{记忆ID}/conversation.md`',
        // Server module messages
        moduleListTitle: '可用服务器模块',
        moduleNotFound: (name) => `模块不存在: ${name}`,
        moduleSourceNotFound: (path) => `模块源目录不存在: ${path}`,
        moduleAlreadyDeployed: (name) => `模块已部署: ${name}`,
        moduleDeploying: (name) => `正在部署模块: ${name}`,
        moduleDeployComplete: (name) => `模块部署成功: ${name}`,
        moduleConfigUpdated: '模块配置已更新',
        moduleRemoved: (name) => `模块已移除: ${name}`,
        moduleNotDeployed: (name) => `模块未部署: ${name}`,
        moduleStatusTitle: '已部署的服务器模块',
        noModulesDeployed: '暂无已部署的模块',
        userDataDir: (path) => `用户数据目录: ${path}`,
        restartHint: '请重启服务以加载新模块',
        // Hot reload messages
        hotLoadAttempting: (name) => `正在尝试热加载: ${name}`,
        hotLoadSuccess: (name) => `热加载成功: ${name}`,
        hotLoadFailed: (name, err) => `热加载失败 (${name}): ${err}`,
        hotLoadSkipped: '服务未运行，跳过热加载',
        // Custom deploy messages
        customSourceNotFound: (path) => `自定义源目录不存在: ${path}`,
        deployingFromCustom: (path) => `从自定义路径部署: ${path}`,
        customSkillDeployed: (name) => `自定义技能已部署: ${name}`
    }
};

/**
 * 获取消息对象
 * @param {string} lang - 语言代码 ('en' | 'zh')
 * @returns {Object} 消息对象
 */
export function getMessages(lang = 'en') {
    return MESSAGES[lang] || MESSAGES.en;
}

export default MESSAGES;
