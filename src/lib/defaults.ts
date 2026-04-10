import type { PromptTemplate, AppSettings, LLMProvider } from '@/types';

export const DEFAULT_PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: 'explain',
    name: '解释概念',
    icon: '💡',
    prompt: '请用简单易懂的方式解释以下内容，如有必要请举例说明：\n\n"{text}"',
    builtin: true,
  },
  {
    id: 'summarize',
    name: '总结段落',
    icon: '📝',
    prompt: '请简要总结以下内容的核心要点：\n\n"{text}"',
    builtin: true,
  },
  {
    id: 'translate',
    name: '翻译',
    icon: '🌐',
    prompt: '请将以下内容翻译为中文（如果已是中文则翻译为英文），保持学术用语的准确性：\n\n"{text}"',
    builtin: true,
  },
  {
    id: 'critique',
    name: '批判性分析',
    icon: '🔍',
    prompt: '请对以下论述进行批判性分析，指出其优点、可能的不足和隐含假设：\n\n"{text}"',
    builtin: true,
  },
  {
    id: 'elaborate',
    name: '深入展开',
    icon: '📖',
    prompt: '请对以下内容进行深入展开，补充相关背景知识和细节：\n\n"{text}"',
    builtin: true,
  },
  {
    id: 'math',
    name: '数学推导',
    icon: '🔢',
    prompt: '请详细解释以下数学公式/推导过程，说明每一步的含义：\n\n"{text}"',
    builtin: true,
  },
  {
    id: 'question',
    name: '自由提问',
    icon: '❓',
    prompt: '{text}',
    builtin: true,
  },
];

export const DEFAULT_PROVIDERS: LLMProvider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o-mini',
    maxTokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    maxTokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'qwen',
    name: 'Qwen (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: '',
    model: 'qwen-plus',
    maxTokens: 4096,
    temperature: 0.7,
  },
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'llama3',
    maxTokens: 4096,
    temperature: 0.7,
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  activeProviderId: 'openai',
  providers: DEFAULT_PROVIDERS,
  promptTemplates: DEFAULT_PROMPT_TEMPLATES,
  fontSize: 16,
  lineHeight: 1.8,
};
