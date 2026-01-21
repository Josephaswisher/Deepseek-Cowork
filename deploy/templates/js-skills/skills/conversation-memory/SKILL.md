---
name: conversation-memory
description: >
  Conversation memory management. Triggered when the user says "save memory", "remember this conversation", "save it", "save conversation", "find previous discussion", "view history", "show previous memories".
---

# Conversation Memory Skill

Save conversation context as recallable memory files, enabling persistence and automatic recall of conversations.

## Active Memories

See `../../data/conversation-memory/memories/index.md` for the active memory collection.

> Note: Memory data is stored in the `.claude/data/conversation-memory/` directory, separate from the skill code.

## Trigger Scenarios

### Save Memory

Triggered when the user says:

- "Save memory"
- "Remember this conversation"
- "Save it"
- "Save conversation"
- "Save context"

#### Save Process (Important)

When saving a memory, **you must first generate the title and summary**, then call the save command:

**Step 1: Generate Title and Summary**

Analyze the current conversation and generate complete summary content:

- **Title**: Concise topic of the conversation (will be displayed in the index)
- **Summary**: Complete conversation summary, should include:
  - Conversation background and main issues
  - Core content discussed
  - Key decisions and conclusions
  - Important technical details or code changes

**Step 2: Write Summary File**

Write the title and summary to a temporary file, **format requirements**:

```markdown
# Title Content

Complete summary text (including main content, key decisions, important conclusions, etc.)
```

File path: `.claude/data/conversation-memory/temp/summary.md`

**Summary File Example:**

```markdown
# Memory Index Timing Issue Fix

This conversation discussed the timing issue where memory index content was blank during save.

## Main Content

1. Analyzed the root cause: placeholder summary written first, then index rebuilt
2. Determined the improvement plan: generate summary first, then save in one step
3. Modified related code: save_memory.js, MemoryService, MemoryManager

## Key Decisions

- Use --summary-file to pass summary, avoiding command-line escaping issues
- First line of summary file serves as title, subsequent content as complete summary
- Summary is required to ensure index content is always complete

## Important Conclusions

- Changed save memory flow to "generate summary first, then save"
- Index automatically rebuilds, new memories appear at the top
```

**Step 3: Call Save Command**

```bash
node scripts/save_memory.js --summary-file ../../data/conversation-memory/temp/summary.md
```

> **Notes**:
> - First line of summary file must be the title (starting with `# `)
> - Title will be displayed in the index, formatted as `[mem-xxx] Title`
> - Temporary summary file can be deleted after successful save

### View History

Triggered when the user says:

- "View previous conversation"
- "Find last discussion"
- "Restore memory mem-xxx"
- "Show history"

### Saved Content

System saves to `.claude/data/conversation-memory/memories/active/mem-{timestamp}/`:

```text
mem-{timestamp}/
├── summary.md      # Conversation summary (title + metadata + full summary)
├── conversation.md # Complete original conversation record (readable format)
└── messages.json   # Raw message data (for viewing history)
```

**summary.md Structure:**

```markdown
# Conversation Memory: Title

## Metadata

- **Time**: 2026-01-18 19:00:00
- **Duration**: ~5 minutes
- **Conversation Rounds**: 10 rounds
- **Keywords**: keyword1, keyword2
- **conversationId**: conv-xxx
- **sessionId**: xxx...

## Summary

(User-provided complete summary content, including main content, key decisions, important conclusions, etc.)

## Source

For full original conversation, see [conversation.md](conversation.md)
```

**Index Structure (index.md):**

Index file contains directory and all memory summaries, with newest memories at the top:

```markdown
# Conversation Memory Index

## Directory

- [mem-20260118-190000] Memory Index Timing Issue Fix
- [mem-20260118-180000] Project Architecture Discussion

---

## mem-20260118-190000

(Complete summary.md content)
```

## Recall Mechanism

### Active Search

When user says "find previous discussion about xxx":

```bash
node scripts/activate_memory.js --search <keyword>
```

### View History Process

When user requests to view history:

**List viewable memories:**

```bash
node scripts/restore_memory.js --list       # List active memories
node scripts/restore_memory.js --list-all   # Include archived memories
```

The list shows each memory's conversationId (if available), with fragment count noted for multiple fragments from the same conversation.

**View specific memory fragment:**

```bash
node scripts/restore_memory.js <memory-id>
```

**View complete conversation:**

The same conversation round may be saved multiple times as multiple memory fragments. Use the `--conversation` option to merge and view:

```bash
node scripts/restore_memory.js --conversation <conversation-id>
```

Example:

```bash
node scripts/restore_memory.js --conversation conv-20260118-160000
```

## Activation Mechanism

When an archived memory is recalled, it needs to be activated:

```bash
node scripts/activate_memory.js <memory-name>
```

Activation operation (requires app running):

- Moves memory from `memories/archive/` back to `memories/active/`

## Archive Mechanism

### Automatic Archive Rules

- Memories inactive for more than 14 days will be archived
- Keep active/ count <= 20
- When total tokens exceed limit, archive oldest memories

### Execute Archive

```bash
node scripts/archive_old_memories.js
```

After archiving, the index is automatically updated via backend API.

## Storage Locations

Skill code and data are stored separately:

```text
.claude/
├── skills/conversation-memory/    # Skill code (this directory)
│   ├── SKILL.md                   # This file (skill definition)
│   ├── scripts/                   # Management scripts (require app running)
│   │   ├── paths.js               # Path resolution utility
│   │   ├── save_memory.js         # Save memory (requires summary)
│   │   ├── activate_memory.js     # Activate/search memory
│   │   ├── restore_memory.js      # View history
│   │   ├── archive_old_memories.js # Archive memories
│   │   └── update_index.js        # Update index (calls backend API)
│   └── references/                # Template files
│       ├── summary_template.md
│       └── conversation_template.md
│
└── data/conversation-memory/      # Data directory (separate from skill)
    ├── temp/                      # Temporary file directory (for summary)
    │   └── summary.md             # Temporary summary file
    └── memories/                  # Memory storage
        ├── index.md               # Active memory summary collection
        ├── active/                # Active memories
        │   └── mem-xxx/
        │       ├── summary.md
        │       ├── conversation.md
        │       └── messages.json
        └── archive/               # Archived memories
```

## Notes

- **Title and summary are required**: First line of summary file must be title (starting with `# `), title will be displayed in index
- **Index auto-updates**: Index automatically rebuilds after successful save, new memories at the top
- **Scripts require app**: Scripts in `scripts/` directory require DeepSeek Cowork app to be running
- **View compatibility**: Only newly saved memories (containing `messages.json`) support viewing complete messages
- **Temporary files**: Temporary `temp/summary.md` file can be deleted after successful save
