import type { Annotation } from '@/types';

/**
 * Annotation marker format in Markdown files:
 * <!-- marginlens:annotation {"selectedText":"...","comment":"...","llmResponse":"...","color":"..."} -->
 *
 * These HTML comments are invisible in standard Markdown renderers (GitHub, VS Code, Typora, etc.)
 * but are parsed back into annotations when imported into MarginLens.
 */

const ANNOTATION_REGEX = /<!-- marginlens:annotation (.*?) -->/g;

interface SerializedAnnotation {
  selectedText: string;
  comment: string;
  llmResponse?: string;
  color: string;
}

/**
 * Serialize annotations into the Markdown content as HTML comments,
 * placed right after the text they annotate.
 */
export function serializeAnnotationsToMarkdown(
  content: string,
  annotations: Annotation[],
): string {
  // First, strip any existing marginlens annotations to avoid duplicates
  let result = content.replace(/\n*<!-- marginlens:annotation .*? -->\n*/g, '\n');

  // Sort annotations by position in content (later first so insertions don't shift offsets)
  const sorted = [...annotations]
    .map((ann) => ({
      ann,
      idx: result.indexOf(ann.selectedText),
    }))
    .filter((a) => a.idx !== -1)
    .sort((a, b) => b.idx - a.idx);

  for (const { ann, idx } of sorted) {
    const insertPos = idx + ann.selectedText.length;
    // Find end of current line
    const lineEnd = result.indexOf('\n', insertPos);
    const pos = lineEnd === -1 ? result.length : lineEnd;

    const data: SerializedAnnotation = {
      selectedText: ann.selectedText,
      comment: ann.comment,
      color: ann.color,
    };
    if (ann.llmResponse) {
      data.llmResponse = ann.llmResponse;
    }

    const marker = `\n<!-- marginlens:annotation ${JSON.stringify(data)} -->`;
    result = result.slice(0, pos) + marker + result.slice(pos);
  }

  // Handle annotations whose text was not found in the content (orphans)
  const orphans = annotations.filter((ann) => content.indexOf(ann.selectedText) === -1);
  if (orphans.length > 0) {
    result += '\n\n<!-- marginlens:orphan-annotations -->\n';
    for (const ann of orphans) {
      const data: SerializedAnnotation = {
        selectedText: ann.selectedText,
        comment: ann.comment,
        color: ann.color,
      };
      if (ann.llmResponse) {
        data.llmResponse = ann.llmResponse;
      }
      result += `<!-- marginlens:annotation ${JSON.stringify(data)} -->\n`;
    }
  }

  return result;
}

/**
 * Parse annotation markers from Markdown content.
 * Returns the clean content (without markers) and parsed annotations.
 */
export function parseAnnotationsFromMarkdown(
  rawContent: string,
): { content: string; annotations: SerializedAnnotation[] } {
  const annotations: SerializedAnnotation[] = [];

  // Extract all annotation markers
  let match;
  while ((match = ANNOTATION_REGEX.exec(rawContent)) !== null) {
    try {
      const data = JSON.parse(match[1]) as SerializedAnnotation;
      if (data.selectedText) {
        annotations.push(data);
      }
    } catch {
      // Skip malformed annotations
    }
  }

  // Remove annotation markers and orphan section from content
  const content = rawContent
    .replace(/\n*<!-- marginlens:annotation .*? -->/g, '')
    .replace(/\n*<!-- marginlens:orphan-annotations -->\n*/g, '')
    .trim();

  return { content, annotations };
}
