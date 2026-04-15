import type { Annotation, Document, Workspace } from '@/types';

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

/**
 * Build the system message for the document-level chat panel (right sidebar).
 * Full document is always in context; no brevity constraints.
 */
export function buildChatSystemMessage(
  documentContent: string,
  annotations: Annotation[],
): string {
  let msg = `你是一个学习助手，正在帮助用户理解和完成以下文档中的内容。

原则：
1. **以文档全文为主要上下文**，回答时优先依据文档内容。
2. **详略得当**：用户需要详细解释时充分展开，不要人为截断；简单问题简短回答。
3. **直接定位问题**：如果用户说"不会"或"卡住了"，请结合文档中的题目/内容，逐步引导解答。
4. **代码/公式清晰**：代码用对应语言的代码块，公式用 LaTeX。
5. **保持连贯**：参考本次对话历史，不重复已解释过的内容。

以下是用户正在阅读的文档全文：

---

${documentContent}`;

  if (annotations.length > 0) {
    msg += '\n\n---\n\n用户已有的批注（供参考）：\n';
    for (const ann of annotations) {
      msg += `\n- 原文: "${ann.selectedText.slice(0, 100)}${ann.selectedText.length > 100 ? '...' : ''}"`;
      if (ann.comment) msg += `\n  用户笔记: ${ann.comment}`;
      if (ann.llmResponse) msg += `\n  AI批注: ${ann.llmResponse.slice(0, 200)}${ann.llmResponse.length > 200 ? '...' : ''}`;
    }
  }

  return msg;
}

/**
 * Build the system message for a workspace-level AI session.
 * Includes: workspace structure, full markdown content, PDF extracted text,
 * and all annotations across workspace documents.
 */
export function buildWorkspaceSystemMessage(
  workspace: Workspace,
  docs: Document[],
  annotationsByDoc: Record<string, Annotation[]>,
): string {
  const MAX_TOTAL_MD_CHARS = 60_000;
  const MAX_PDF_CHARS_PER_DOC = 8_000;

  const mdDocs = docs.filter((d) => d.type === 'markdown');
  const pdfDocs = docs.filter((d) => d.type === 'pdf');

  const totalMdChars = mdDocs.reduce((sum, d) => sum + (d.content || '').length, 0);
  const charsPerMd =
    totalMdChars > MAX_TOTAL_MD_CHARS && mdDocs.length > 0
      ? Math.floor(MAX_TOTAL_MD_CHARS / mdDocs.length)
      : Infinity;

  // Header
  let msg = `你是一个知识管理助手，正在帮助用户处理工作区「${workspace.name}」中的文档集合。

工作区共包含 ${docs.length} 个文档：
${docs.map((d, i) => `${i + 1}. 【${d.type === 'pdf' ? 'PDF' : 'Markdown'}】${d.title}`).join('\n')}

**使用方式：**
- 在消息中用 @文档名 引用特定文档的完整内容（我会自动注入全文到上下文）
- 要求生成综述/笔记时，请直接输出 Markdown 格式，可在回答界面点击"保存为文档"
- 可以跨文档提问、比较异同、整理知识`;

  // Append markdown doc content
  if (mdDocs.length > 0) {
    msg += '\n\n---\n\n## 工作区 Markdown 文档内容\n';
    for (const doc of mdDocs) {
      const content = (doc.content || '').slice(0, charsPerMd);
      const truncated = content.length < (doc.content || '').length;
      msg += `\n\n### 📄 ${doc.title}\n\n${content}${truncated ? '\n\n_（内容过长已截断）_' : ''}`;
    }
  }

  // Append PDF extracted text (if pre-extracted)
  const pdfsWithText = pdfDocs.filter((d) => d.extractedText);
  if (pdfsWithText.length > 0) {
    msg += '\n\n---\n\n## 工作区 PDF 提取文本\n';
    for (const doc of pdfsWithText) {
      const content = (doc.extractedText || '').slice(0, MAX_PDF_CHARS_PER_DOC);
      msg += `\n\n### 📑 ${doc.title}\n\n${content}`;
    }
  }

  // Append all annotations grouped by document
  const allAnnotations = docs.flatMap((d) => annotationsByDoc[d.id] ?? []);
  if (allAnnotations.length > 0) {
    msg += '\n\n---\n\n## 用户批注摘要\n';
    for (const doc of docs) {
      const anns = annotationsByDoc[doc.id] ?? [];
      if (anns.length === 0) continue;
      msg += `\n\n**${doc.title}** (${anns.length} 条批注):`;
      for (const ann of anns) {
        const text = ann.selectedText.slice(0, 120);
        msg += `\n- 原文: "${text}${ann.selectedText.length > 120 ? '…' : ''}"`;
        if (ann.comment) msg += `\n  笔记: ${ann.comment}`;
        if (ann.llmResponse) msg += `\n  AI: ${ann.llmResponse.slice(0, 200)}`;
      }
    }
  }

  return msg;
}

/**
 * Parse @mentions from a user message and return the referenced documents.
 * Matching is case-insensitive substring match on document title.
 */
export function parseAtMentions(text: string, docs: Document[]): Document[] {
  const matches = text.match(/@([\w\u4e00-\u9fff][\w\u4e00-\u9fff\s.\-:()（）]*)/g) ?? [];
  const mentioned: Document[] = [];
  for (const match of matches) {
    const query = match.slice(1).trim().toLowerCase();
    const doc = docs.find((d) => d.title.toLowerCase().includes(query));
    if (doc && !mentioned.includes(doc)) mentioned.push(doc);
  }
  return mentioned;
}

/**
 * Build the hidden context block for a @mentioned document.
 */
export function buildMentionContext(doc: Document): string {
  const content = doc.content || doc.extractedText || '（无可用文本，请先打开该文档以提取内容）';
  return `\n\n--- 被引用文档「${doc.title}」全文 ---\n${content.slice(0, 25_000)}\n--- 文档结束 ---`;
}
