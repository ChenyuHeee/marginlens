/**
 * Teaching site module templates.
 *
 * The LLM agents only emit structured JSON conforming to `TeachingModule` —
 * the front-end is responsible for rendering each module type. This makes
 * the output predictable, reviewable, and trivially exportable.
 */

export type ModuleSize = 'sm' | 'md' | 'lg' | 'full';
export type ModuleAccent = 'blue' | 'purple' | 'green' | 'amber' | 'rose' | 'gray';

interface BaseModule {
  /** Stable id assigned by pipeline (used as React key + reviewer references) */
  id: string;
  /** Visual prominence */
  size?: ModuleSize;
  accent?: ModuleAccent;
  /** Optional anchor id for ToC navigation */
  anchor?: string;
}

export interface HeroModule extends BaseModule {
  type: 'hero';
  title: string;
  subtitle?: string;
  /** One-paragraph teaser (markdown) */
  summary?: string;
  /** Optional reading-time / difficulty / tag chips */
  chips?: string[];
}

export interface SectionModule extends BaseModule {
  type: 'section';
  title: string;
  /** 1=h2, 2=h3, ... */
  level?: number;
  /** Markdown content */
  content: string;
}

export interface KeyPointsModule extends BaseModule {
  type: 'keypoints';
  title?: string;
  items: string[];
  /**
   * 'one-by-one' (default): reveal each item on click.
   * 'all': show all items at once on first display.
   */
  reveal?: 'one-by-one' | 'all';
}

export interface DefinitionModule extends BaseModule {
  type: 'definition';
  term: string;
  /** Markdown */
  definition: string;
  example?: string;
}

export interface FormulaModule extends BaseModule {
  type: 'formula';
  /** KaTeX-compatible LaTeX (no $ delimiters). Use display math. */
  latex: string;
  /** Plain-language explanation, markdown allowed */
  explanation?: string;
  caption?: string;
}

export interface CalloutModule extends BaseModule {
  type: 'callout';
  variant: 'note' | 'tip' | 'warning' | 'question' | 'insight';
  title?: string;
  /** Markdown */
  body: string;
}

export interface QAModule extends BaseModule {
  type: 'qa';
  question: string;
  /** Markdown answer (often sourced from the user's annotations / LLM responses) */
  answer: string;
  /** Quote from the original note that this Q&A is anchored to */
  source?: string;
  /** When true, answer is hidden until the user clicks to reveal */
  reveal?: boolean;
}

export interface QuizModule extends BaseModule {
  type: 'quiz';
  question: string;
  options: string[];
  correctIndex: number;
  /** Shown after the user answers */
  explanation?: string;
}

export interface SummaryModule extends BaseModule {
  type: 'summary';
  title?: string;
  /** Bullet-style takeaways */
  points: string[];
  /** Same as KeyPointsModule.reveal */
  reveal?: 'one-by-one' | 'all';
}

export type TeachingModule =
  | HeroModule
  | SectionModule
  | KeyPointsModule
  | DefinitionModule
  | FormulaModule
  | CalloutModule
  | QAModule
  | QuizModule
  | SummaryModule;

export interface TeachingSite {
  /** Stable across regenerations: the document id */
  documentId: string;
  /** Display title (usually the document title) */
  title: string;
  /** ISO timestamp */
  generatedAt: number;
  /** Provider/model used (for transparency) */
  model?: string;
  modules: TeachingModule[];
  /** Reviewer notes captured for transparency (optional) */
  reviewerNotes?: string[];
}

export const MODULE_TYPES: TeachingModule['type'][] = [
  'hero', 'section', 'keypoints', 'definition',
  'formula', 'callout', 'qa', 'quiz', 'summary',
];

/** Spec sent to the LLM so it knows the schema it must produce. */
export const MODULE_SCHEMA_DOC = `
You can only emit objects with these "type" values, and only the listed fields:

- hero        { type, title, subtitle?, summary?, chips? }
- section     { type, title, level?: 1|2|3, content: <markdown> }
- keypoints   { type, title?, items: string[], reveal?: "one-by-one"|"all" }  // reveal: "all" = show all at once, "one-by-one" = click-reveal each (default)
- definition  { type, term, definition: <markdown>, example?: <markdown> }
- formula     { type, latex: <pure LaTeX, no $ delimiters>, explanation?: <markdown>, caption? }
- callout     { type, variant: "note"|"tip"|"warning"|"question"|"insight", title?, body: <markdown> }
- qa          { type, question, answer: <markdown>, source?: <quote>, reveal?: boolean }
- quiz        { type, question, options: string[], correctIndex: number, explanation?: <markdown> }
- summary     { type, title?, points: string[], reveal?: "one-by-one"|"all" }

Optional on every module: id (string), size ("sm"|"md"|"lg"|"full"), accent ("blue"|"purple"|"green"|"amber"|"rose"|"gray"), anchor (string).
Markdown supports inline math \\( ... \\) and display math $$ ... $$.
`.trim();
