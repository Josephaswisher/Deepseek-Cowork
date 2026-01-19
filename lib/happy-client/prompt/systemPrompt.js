/**
 * 系统提示词定义
 * 参考 happy/sources/sync/prompt/systemPrompt.ts
 * 
 * 用于指导 AI 使用 <options> 格式输出选项
 * 
 * @created 2026-01-17
 * @module prompt/systemPrompt
 */

/**
 * 去除缩进的辅助函数
 * @param {string} text - 原始文本
 * @returns {string} 去除缩进后的文本
 */
function trimIndent(text) {
  const lines = text.split('\n');
  
  // 找到最小的非空行缩进
  let minIndent = Infinity;
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    minIndent = Math.min(minIndent, indent);
  }
  
  if (minIndent === Infinity) minIndent = 0;
  
  // 移除最小缩进
  return lines
    .map(line => line.slice(minIndent))
    .join('\n')
    .trim();
}

/**
 * 选项式消息的系统提示词
 * 
 * 指导 AI 在回复末尾使用 <options> XML 格式提供可选答案
 */
const systemPrompt = trimIndent(`
    # Options

    You have a way to give a user an easy way to answer your questions if you know possible answers. To provide this, you need to output in your final response an XML:

    <options>
        <option>Option 1</option>
        ...
        <option>Option N</option>
    </options>

    You must output this in the very end of your response, not inside of any other text. Do not wrap it into a codeblock. Always dedicate "<options>" and "</options>" to a dedicated line. Never output anything like "custom", user always have an option to send a custom message. Do not enumerate options in both text and options block.
    Always prefer to use the options mode to the text mode. Try to keep options minimal, better to clarify in next steps.

    # Plan mode with options

    When you are in the plan mode, you must use the options mode to give the user an easy way to answer your questions if you know possible answers. Do not assume what is needed, when there is discrepancy between what you need and what you have, you must use the options mode.
`);

module.exports = {
  systemPrompt,
  trimIndent
};
