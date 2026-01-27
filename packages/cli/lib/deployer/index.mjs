/**
 * Deployer 模块统一导出
 * 
 * 创建时间: 2026-01-28
 */

// 导出 Deployer 类
export { SkillsDeployer } from './SkillsDeployer.mjs';
export { ServerModuleDeployer } from './ServerModuleDeployer.mjs';

// 导出路径工具
export {
    PROJECT_ROOT,
    DEPLOY_DIR,
    SKILLS_DIR,
    USER_SERVER_MODULES_DIR,
    SERVER_DOCS_DIR,
    HAPPY_CONFIG_PATH,
    APP_NAME,
    USER_MODULES_DIR_NAME,
    USER_MODULES_CONFIG_NAME,
    SKILL_NAME,
    SKILL_PATH,
    BACKUP_DIR,
    CONVERSATION_MEMORY_SKILL_NAME,
    CONVERSATION_MEMORY_SKILL_PATH,
    CONVERSATION_MEMORY_DATA_PATH,
    getUserDataDir,
    getSkillsSourceDir
} from './paths.mjs';

// 导出消息
export { MESSAGES, getMessages } from './messages.mjs';

// 默认导出
export default {
    SkillsDeployer: (await import('./SkillsDeployer.mjs')).SkillsDeployer,
    ServerModuleDeployer: (await import('./ServerModuleDeployer.mjs')).ServerModuleDeployer
};
