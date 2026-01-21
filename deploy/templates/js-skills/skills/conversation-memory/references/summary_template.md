# Summary Template

This template is used to generate the summary.md file for each conversation memory.

## Template Content

```markdown
# Conversation Memory: {Topic Title}

## Metadata

- **Time**: {YYYY-MM-DD HH:MM}
- **Duration**: ~{N} minutes
- **Conversation Rounds**: {N} rounds
- **Keywords**: {keyword1}, {keyword2}, {keyword3}

## Topic Summary

{1-2 paragraphs summarizing the topic and background of this conversation}

## Key Decisions

1. {Decision 1}
2. {Decision 2}
3. ...

## Important Conclusions

- {Conclusion 1}
- {Conclusion 2}
- ...

## TODO Items

- [ ] {TODO 1}
- [ ] {TODO 2}
- ...

(Remove this section if there are no TODO items)

## Related Files

- `{file path 1}` - {brief description}
- `{file path 2}` - {brief description}
- ...

(Remove this section if there are no related files)

## Source

For full original conversation, see [conversation.md](conversation.md)
```

## Field Instructions

### Topic Title

Use brief words to describe the conversation topic, for example:
- "Memory System Design"
- "Kaichi Workflow Refactor"
- "API Interface Optimization"

### Keywords

**This is the most important field**, determining whether the memory can be correctly recalled.

Requirements:
- Extract 3-8 keywords
- Include core terms related to the topic
- Facilitate subsequent search and matching

Example:
```
skills, memory, recall, index, progressive loading
```

### Metadata

- **Time**: Conversation start time
- **Duration**: Estimated conversation duration
- **Conversation Rounds**: Number of user messages

### Topic Summary

Use natural language to describe the core content of the conversation, for quick understanding of what was discussed.

### Key Decisions

List important decisions made during the conversation, start with verbs:
- "Adopted xxx solution"
- "Decided to use xxx"
- "Chose xxx over yyy"

### Important Conclusions

List conclusions or outcomes from the conversation:
- Design solutions
- Answers to questions
- Reached consensus

### TODO Items

If follow-up tasks were mentioned during the conversation, record them here.

### Related Files

List code files, documentation, configurations, etc. involved in the conversation.

## Differences from Old Version

Differences between new summary.md and old SKILL.md:

| Item | Old SKILL.md | New summary.md |
|------|--------------|----------------|
| YAML frontmatter | Yes | **No** |
| As standalone skill | Yes | **No** |
| Auto-loaded | Metadata loaded | **Not auto-loaded** |
| Indexing method | Skills mechanism | **Main skill index table** |

The new version manages memories through the main skill's index table, rather than making each memory a standalone skill.
