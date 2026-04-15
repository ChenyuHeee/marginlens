export interface HighlightColor {
  id: string;
  color: string;      // light-mode bg
  darkColor: string;  // dark-mode bg
  label: string;
  emoji: string;
}

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { id: 'yellow',  color: '#fef08a', darkColor: '#78640a', label: '重要',   emoji: '🟡' },
  { id: 'red',     color: '#fecaca', darkColor: '#7f1d1d', label: '疑问',   emoji: '🔴' },
  { id: 'green',   color: '#bbf7d0', darkColor: '#14532d', label: '方法',   emoji: '🟢' },
  { id: 'blue',    color: '#bfdbfe', darkColor: '#1e3a5f', label: '结论',   emoji: '🔵' },
  { id: 'purple',  color: '#e9d5ff', darkColor: '#4a1d96', label: '定义',   emoji: '🟣' },
  { id: 'orange',  color: '#fed7aa', darkColor: '#7c2d12', label: '数据',   emoji: '🟠' },
];

export function getColorConfig(color: string): HighlightColor | undefined {
  return HIGHLIGHT_COLORS.find((c) => c.color === color || c.darkColor === color);
}
