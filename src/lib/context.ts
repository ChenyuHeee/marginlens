import type { Annotation } from '@/types';

/**
 * Build the system message with document content, annotations, and
 * instructions for concise annotation-friendly responses.
 */
export function buildSystemMessage(
  documentContent: string,
  annotations: Annotation[],
): string {
  let msg = `你是一个学术阅读助手。你的回答将作为学习批注嵌入到文档中，因此必须遵循以下原则：

1. **简洁精炼**：每次回答控制在 3-5 句话以内，除非用户明确要求详细展开。
2. **要点优先**：用简短的要点列表（bullet points）而非长段落。
3. **术语精准**：保留关键术语的原文（英文），必要时附中文解释。
4. **公式清晰**：数学公式用 LaTeX 格式，分步骤给出关键推导。
5. **避免废话**：不要重复用户选中的原文，不要加"总结一下"等过渡语。

以下是用户正在阅读的文档全文：

---

${documentContent}`;

  if (annotations.length > 0) {
    msg += '\n\n---\n\n以下是用户已有的批注，请参考这些批注来保持回答的连贯性和一致性：\n';
    for (const ann of annotations) {
      msg += `\n- 原文: "${ann.selectedText.slice(0, 100)}${ann.selectedText.length > 100 ? '...' : ''}"`;
      if (ann.comment) {
        msg += `\n  用户笔记: ${ann.comment}`;
      }
      if (ann.llmResponse) {
        msg += `\n  AI批注: ${ann.llmResponse.slice(0, 200)}${ann.llmResponse.length > 200 ? '...' : ''}`;
      }
    }
  }

  return msg;
}
