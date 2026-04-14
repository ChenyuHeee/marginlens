import { useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Trash2, BarChart2 } from 'lucide-react';
import { getAllApiUsage, clearApiUsage } from '@/lib/db';
import type { ApiUsageRecord } from '@/types';

interface ApiMonitorPanelProps {
  open: boolean;
  onClose: () => void;
}

// Generate the last N days as YYYY-MM-DD strings
function lastNDays(n: number): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function shortDate(date: string) {
  // "2026-04-15" → "04/15"
  return date.slice(5).replace('-', '/');
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

interface DayData {
  date: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  calls: number;
  byProvider: { name: string; total: number }[];
}

const PROVIDER_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316',
];

export function ApiMonitorPanel({ open, onClose }: ApiMonitorPanelProps) {
  const [records, setRecords] = useState<ApiUsageRecord[]>([]);
  const [range, setRange] = useState<7 | 14 | 30>(30);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    const all = await getAllApiUsage();
    setRecords(all);
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  const days = lastNDays(range);

  // Aggregate by day
  const dayMap: Map<string, DayData> = new Map();
  for (const day of days) {
    dayMap.set(day, { date: day, promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0, byProvider: [] });
  }
  // Collect all provider names
  const providerNames = [...new Set(records.map((r) => r.providerName))];
  for (const r of records) {
    if (!dayMap.has(r.date)) continue;
    const d = dayMap.get(r.date)!;
    d.promptTokens += r.promptTokens;
    d.completionTokens += r.completionTokens;
    d.totalTokens += r.totalTokens;
    d.calls += r.calls;
    const existing = d.byProvider.find((p) => p.name === r.providerName);
    if (existing) existing.total += r.totalTokens;
    else d.byProvider.push({ name: r.providerName, total: r.totalTokens });
  }

  const dayData = days.map((d) => dayMap.get(d)!);
  const maxTotal = Math.max(...dayData.map((d) => d.totalTokens), 1);

  // Overall stats for the selected range
  const filteredRecords = records.filter((r) => days.includes(r.date));
  const totalTokens = filteredRecords.reduce((s, r) => s + r.totalTokens, 0);
  const totalPrompt = filteredRecords.reduce((s, r) => s + r.promptTokens, 0);
  const totalCompletion = filteredRecords.reduce((s, r) => s + r.completionTokens, 0);
  const totalCalls = filteredRecords.reduce((s, r) => s + r.calls, 0);
  const activeDays = dayData.filter((d) => d.totalTokens > 0).length;

  const hovered = hoveredDay ? dayMap.get(hoveredDay) : null;

  const handleClear = async () => {
    if (!confirm('确认清除所有 API 用量记录？')) return;
    setClearing(true);
    await clearApiUsage();
    await load();
    setClearing(false);
  };

  // Chart dimensions
  const chartH = 160;
  const barGap = 3;
  const totalBars = days.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-[780px] max-h-[85vh] rounded-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{
          backgroundColor: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2">
            <BarChart2 size={16} style={{ color: 'var(--color-accent)' }} />
            <h2 className="text-[16px] font-semibold tracking-tight">API 用量监控</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Range selector */}
            <div className="flex rounded-lg overflow-hidden text-[12px]" style={{ border: '1px solid var(--color-border)' }}>
              {([7, 14, 30] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className="px-3 py-1 transition-all"
                  style={{
                    background: range === r ? 'var(--color-accent)' : 'transparent',
                    color: range === r ? '#fff' : 'var(--color-text-secondary)',
                  }}
                >
                  {r}天
                </button>
              ))}
            </div>
            <button
              onClick={load}
              className="p-1.5 rounded-lg transition-all"
              style={{ color: 'var(--color-text-tertiary)' }}
              title="刷新"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="p-1.5 rounded-lg transition-all"
              style={{ color: '#ef4444' }}
              title="清除记录"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg transition-all"
              style={{ color: 'var(--color-text-tertiary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: '总 Token', value: fmtNum(totalTokens), sub: `最近 ${range} 天` },
              { label: '输入 Token', value: fmtNum(totalPrompt), sub: `${totalTokens ? Math.round(totalPrompt / totalTokens * 100) : 0}%` },
              { label: '输出 Token', value: fmtNum(totalCompletion), sub: `${totalTokens ? Math.round(totalCompletion / totalTokens * 100) : 0}%` },
              { label: '调用次数', value: fmtNum(totalCalls), sub: `活跃 ${activeDays} 天` },
            ].map(({ label, value, sub }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3"
                style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
              >
                <div className="text-[11px] mb-1" style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
                <div className="text-[22px] font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{value}</div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div
            className="rounded-xl p-4"
            style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)' }}
          >
            <div className="text-[12px] font-medium mb-3" style={{ color: 'var(--color-text-secondary)' }}>
              每日 Token 用量
            </div>

            {/* SVG chart */}
            <div className="relative">
              <svg
                width="100%"
                viewBox={`0 0 ${totalBars * (100 / totalBars * totalBars)} ${chartH + 24}`}
                preserveAspectRatio="none"
                style={{ height: chartH + 24, display: 'block' }}
              >
                {dayData.map((d, i) => {
                  const barW = (100 / totalBars) - barGap / totalBars;
                  const x = i * (100 / totalBars);
                  const isHovered = hoveredDay === d.date;

                  // Stacked bars by provider
                  let stackY = chartH;
                  const provBars: { y: number; h: number; color: string; name: string }[] = [];
                  for (const pv of d.byProvider) {
                    const h = d.totalTokens > 0 ? (pv.total / maxTotal) * chartH : 0;
                    stackY -= h;
                    const colorIdx = providerNames.indexOf(pv.name) % PROVIDER_COLORS.length;
                    provBars.push({ y: stackY, h, color: PROVIDER_COLORS[colorIdx], name: pv.name });
                  }

                  return (
                    <g key={d.date}>
                      {/* Hover hitbox */}
                      <rect
                        x={`${x}%`}
                        y={0}
                        width={`${barW}%`}
                        height={chartH}
                        fill="transparent"
                        onMouseEnter={() => setHoveredDay(d.date)}
                        onMouseLeave={() => setHoveredDay(null)}
                        style={{ cursor: 'default' }}
                      />
                      {/* Stacked provider bars */}
                      {d.totalTokens > 0
                        ? provBars.map((pb) => (
                            <rect
                              key={pb.name}
                              x={`${x}%`}
                              y={pb.y}
                              width={`${barW}%`}
                              height={pb.h}
                              rx={2}
                              fill={pb.color}
                              opacity={isHovered ? 1 : 0.75}
                            />
                          ))
                        : (
                          <rect
                            x={`${x}%`}
                            y={chartH - 2}
                            width={`${barW}%`}
                            height={2}
                            rx={1}
                            fill="var(--color-border)"
                            opacity={0.4}
                          />
                        )}
                      {/* X axis label — only show every nth day based on range */}
                      {(range <= 7 || (range <= 14 && i % 2 === 0) || i % 5 === 0 || i === totalBars - 1) && (
                        <text
                          x={`${x + barW / 2}%`}
                          y={chartH + 16}
                          textAnchor="middle"
                          fontSize={9}
                          fill="var(--color-text-tertiary)"
                        >
                          {shortDate(d.date)}
                        </text>
                      )}
                    </g>
                  );
                })}
                {/* Y gridlines */}
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <line
                    key={f}
                    x1="0%"
                    x2="100%"
                    y1={chartH - f * chartH}
                    y2={chartH - f * chartH}
                    stroke="var(--color-border)"
                    strokeWidth={0.5}
                    strokeDasharray="3 3"
                  />
                ))}
              </svg>

              {/* Hover tooltip */}
              {hovered && hovered.totalTokens > 0 && (
                <div
                  className="absolute top-1 right-0 rounded-xl px-3 py-2 text-[11px] pointer-events-none"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-strong)',
                    boxShadow: 'var(--shadow-md)',
                    minWidth: 160,
                  }}
                >
                  <div className="font-medium mb-1" style={{ color: 'var(--color-text)' }}>{hovered.date}</div>
                  <div className="space-y-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                    <div>总计: <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{fmtNum(hovered.totalTokens)}</span></div>
                    <div>输入: {fmtNum(hovered.promptTokens)}</div>
                    <div>输出: {fmtNum(hovered.completionTokens)}</div>
                    <div>调用: {hovered.calls} 次</div>
                    {hovered.byProvider.length > 1 && (
                      <div className="mt-1 pt-1" style={{ borderTop: '1px solid var(--color-border)' }}>
                        {hovered.byProvider.map((p) => {
                          const colorIdx = providerNames.indexOf(p.name) % PROVIDER_COLORS.length;
                          return (
                            <div key={p.name} className="flex items-center gap-1">
                              <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: PROVIDER_COLORS[colorIdx] }} />
                              <span className="truncate">{p.name}: {fmtNum(p.total)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Legend */}
            {providerNames.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3">
                {providerNames.map((name) => {
                  const colorIdx = providerNames.indexOf(name) % PROVIDER_COLORS.length;
                  return (
                    <div key={name} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: PROVIDER_COLORS[colorIdx] }} />
                      {name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Per-provider breakdown table */}
          {providerNames.length > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--color-border)' }}
            >
              <div className="px-4 py-3 text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
                按 Provider 汇总（最近 {range} 天）
              </div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
                    {['Provider', '模型', '调用次数', '输入 Token', '输出 Token', '总计'].map((h) => (
                      <th key={h} className="px-4 py-2 text-left font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {providerNames.map((name, ni) => {
                    const pRecords = filteredRecords.filter((r) => r.providerName === name);
                    const pPrompt = pRecords.reduce((s, r) => s + r.promptTokens, 0);
                    const pCompletion = pRecords.reduce((s, r) => s + r.completionTokens, 0);
                    const pTotal = pRecords.reduce((s, r) => s + r.totalTokens, 0);
                    const pCalls = pRecords.reduce((s, r) => s + r.calls, 0);
                    const model = pRecords[0]?.model ?? '-';
                    const colorIdx = ni % PROVIDER_COLORS.length;
                    return (
                      <tr key={name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ background: PROVIDER_COLORS[colorIdx] }} />
                            <span style={{ color: 'var(--color-text)' }}>{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{model}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{fmtNum(pCalls)}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{fmtNum(pPrompt)}</td>
                        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{fmtNum(pCompletion)}</td>
                        <td className="px-4 py-2.5 font-semibold" style={{ color: 'var(--color-text)' }}>{fmtNum(pTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {totalCalls === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart2 size={32} style={{ color: 'var(--color-text-tertiary)', marginBottom: 8 }} />
              <div className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>暂无数据</div>
              <div className="text-[12px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>发送消息后，Token 用量将在这里显示</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
