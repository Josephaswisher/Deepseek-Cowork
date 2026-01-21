---
name: conversation-memory-zh
description: >
  对话记忆管理。当用户说"保存记忆"、"记住这次对话"、"存一下"、"保存对话"、"找找之前的讨论"、"查看历史对话"、"显示之前的记忆"时触发。
---

# 对话记忆技能

将对话上下文保存为可召回的记忆文件，实现对话的持久化和自动召回。

## 活跃记忆

查看 `../../data/conversation-memory/memories/index.md` 获取活跃记忆合集。

> 注意：记忆数据存储在 `.claude/data/conversation-memory/` 目录下，与技能代码分离。

## 触发场景

### 保存记忆

当用户说以下话语时触发保存：

- "保存记忆"
- "记住这次对话"
- "存一下"
- "保存对话"
- "保存上下文"

#### 保存流程（重要）

保存记忆时，**必须先生成标题和摘要**，然后再调用保存命令：

**步骤 1：生成标题和摘要**

分析当前对话，生成完整的摘要内容：

- **标题**：简洁的对话主题（将显示在索引目录中）
- **摘要**：完整的对话总结，应包含：
  - 对话背景和主要问题
  - 讨论的核心内容
  - 关键决策和结论
  - 重要的技术细节或代码变更

**步骤 2：写入摘要文件**

将标题和摘要写入临时文件，**格式要求**：

```markdown
# 标题内容

完整的摘要正文（包含主要内容、关键决策、重要结论等）
```

文件路径：`.claude/data/conversation-memory/temp/summary.md`

**摘要文件示例：**

```markdown
# 记忆索引时序问题修复

本次对话讨论了记忆保存时索引内容为空白的时序问题。

## 主要内容

1. 分析了问题根因：保存时先写入占位摘要再重建索引
2. 确定了改进方案：先生成摘要后一次性保存
3. 修改了相关代码：save_memory.js、MemoryService、MemoryManager

## 关键决策

- 采用 --summary-file 方式传入摘要，避免命令行转义问题
- 摘要文件第一行作为标题，后续内容作为完整摘要
- 摘要必填，确保索引内容始终完整

## 重要结论

- 保存记忆流程改为"先生成摘要后保存"
- 索引自动重建，新记忆在最上面
```

**步骤 3：调用保存命令**

```bash
node scripts/save_memory.js --summary-file ../../data/conversation-memory/temp/summary.md
```

> **注意**：
> - 摘要文件第一行必须是标题（`# ` 开头）
> - 标题会显示在索引目录中，格式为 `[mem-xxx] 标题`
> - 保存成功后可删除临时摘要文件

### 查看历史对话

当用户说以下话语时触发查看历史记忆：

- "查看之前的对话"
- "找找上次的讨论"
- "恢复记忆 mem-xxx"
- "显示历史对话"

### 保存的内容

系统保存到 `.claude/data/conversation-memory/memories/active/mem-{timestamp}/`：

```text
mem-{timestamp}/
├── summary.md      # 对话摘要（标题 + 元信息 + 完整摘要）
├── conversation.md # 完整的原始对话记录（可读格式）
└── messages.json   # 原始消息数据（用于查看历史对话）
```

**summary.md 结构：**

```markdown
# 对话记忆：标题

## 元信息

- **时间**：2026-01-18 19:00:00
- **持续**：约 5 分钟
- **对话轮次**：10 轮
- **关键词**：关键词1, 关键词2
- **conversationId**：conv-xxx
- **sessionId**：xxx...

## 摘要

（用户提供的完整摘要内容，包含主要内容、关键决策、重要结论等）

## 溯源

如需查看完整原始对话，请参阅 [conversation.md](conversation.md)
```

**索引结构（index.md）：**

索引文件包含目录和所有记忆摘要，新的记忆在最上面：

```markdown
# 对话记忆索引

## 目录

- [mem-20260118-190000] 记忆索引时序问题修复
- [mem-20260118-180000] 项目架构讨论

---

## mem-20260118-190000

（完整的 summary.md 内容）
```

## 召回机制

### 主动搜索

用户说"找找之前关于xxx的讨论"时：

```bash
node scripts/activate_memory.js --search <keyword>
```

### 查看历史流程

当用户请求查看历史对话时：

**列出可查看的记忆：**

```bash
node scripts/restore_memory.js --list       # 列出活跃记忆
node scripts/restore_memory.js --list-all   # 包含归档记忆
```

列表会显示每个记忆的 conversationId（如果有），同一对话的多个片段会标注片段数量。

**查看指定记忆片段：**

```bash
node scripts/restore_memory.js <memory-id>
```

**查看完整对话：**

同一轮对话可能被多次保存产生多个记忆片段，使用 `--conversation` 选项可以合并查看：

```bash
node scripts/restore_memory.js --conversation <conversation-id>
```

示例：

```bash
node scripts/restore_memory.js --conversation conv-20260118-160000
```

## 激活机制

当归档记忆被召回时，需要激活：

```bash
node scripts/activate_memory.js <memory-name>
```

激活操作（需要应用运行）：

- 将记忆从 `memories/archive/` 移回 `memories/active/`

## 归档机制

### 自动归档规则

- 超过 14 天未激活的记忆会被归档
- 保持 active/ 数量 <= 20 个
- 总 token 超过限制时，归档最旧的记忆

### 执行归档

```bash
node scripts/archive_old_memories.js
```

归档后通过后端 API 自动更新索引。

## 存储位置

技能代码和数据分离存储：

```text
.claude/
├── skills/conversation-memory/    # 技能代码（本目录）
│   ├── SKILL.md                   # 本文件（技能定义）
│   ├── scripts/                   # 管理脚本（需要应用运行）
│   │   ├── paths.js               # 路径解析工具
│   │   ├── save_memory.js         # 保存记忆（需要提供摘要）
│   │   ├── activate_memory.js     # 激活/搜索记忆
│   │   ├── restore_memory.js      # 查看历史对话
│   │   ├── archive_old_memories.js # 归档记忆
│   │   └── update_index.js        # 更新索引（调用后端 API）
│   └── references/                # 模板文件
│       ├── summary_template.md
│       └── conversation_template.md
│
└── data/conversation-memory/      # 数据目录（与技能分离）
    ├── temp/                      # 临时文件目录（保存摘要用）
    │   └── summary.md             # 临时摘要文件
    └── memories/                  # 记忆存储
        ├── index.md               # 活跃记忆摘要合集
        ├── active/                # 活跃记忆
        │   └── mem-xxx/
        │       ├── summary.md
        │       ├── conversation.md
        │       └── messages.json
        └── archive/               # 归档记忆
```

## 注意事项

- **标题和摘要必填**：摘要文件第一行必须是标题（`# ` 开头），标题会显示在索引目录中
- **索引自动更新**：保存成功后索引会自动重建，新记忆在最上面
- **脚本依赖应用**：`scripts/` 目录的脚本需要 DeepSeek Cowork 应用运行
- **查看兼容性**：只有新保存的记忆（包含 `messages.json`）支持查看完整消息
- **临时文件**：保存成功后可删除 `temp/summary.md` 临时文件
