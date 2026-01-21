# Original Conversation Template

This template is used to save complete original conversation content as a trace layer.

## Template Content

```markdown
# Original Conversation Record

## Conversation Info

- **Start Time**: {YYYY-MM-DD HH:MM:SS}
- **End Time**: {YYYY-MM-DD HH:MM:SS}
- **Conversation Rounds**: {N} rounds

---

## Conversation Content

### User [{HH:MM:SS}]

{User's first message}

---

### Claude [{HH:MM:SS}]

{Claude's first response}

---

### User [{HH:MM:SS}]

{User's second message}

---

### Claude [{HH:MM:SS}]

{Claude's second response}

---

(Continue recording all conversation rounds...)
```

## Field Instructions

### Conversation Info

- **Start Time**: Time of first message in conversation
- **End Time**: Time of last message in conversation
- **Conversation Rounds**: Total number of user messages

### Conversation Content

1. **Preserve complete content**: Don't omit or summarize, preserve complete original conversation content
2. **Label speakers**: Use `### User` and `### Claude` to distinguish
3. **Label timestamps**: Include timestamps in square brackets if available
4. **Use separators**: Separate each conversation round with `---` for readability

### Special Content Handling

#### Code Blocks

Preserve original code block format:

```markdown
### Claude [{HH:MM:SS}]

Here's an example code:

\`\`\`javascript
function hello() {
  console.log("Hello, World!");
}
\`\`\`
```

#### Long Content

If a message is particularly long (like large code blocks), preserve it completely, don't truncate.

#### Image/File References

If conversation involves images or files, record their path or description:

```markdown
### User [{HH:MM:SS}]

[Attachment: screenshot.png - System architecture diagram]

Please help me analyze this architecture...
```

## Why Original Conversation is Needed

1. **Traceability**: Summaries may miss details, original conversation is the most accurate record
2. **Context**: Understand the background and discussion process of decisions
3. **Search**: Can search for specific content in original conversation
4. **Learning**: Review previous discussion approaches and thought processes
