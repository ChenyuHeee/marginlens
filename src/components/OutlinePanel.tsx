import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useUIStore, type PdfOutlineItem } from '@/stores';

export type { PdfOutlineItem };

// ─── Markdown outline ───

export interface HeadingItem {
  id: string;
  level: number;
  text: string;
  children: HeadingItem[];
}

export function parseMarkdownHeadings(content: string): HeadingItem[] {
  const lines = content.split('\n');
  const flat: { level: number; text: string; id: string }[] = [];

  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].trim();
    // Generate a slug matching rehype-slug
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    flat.push({ level, text, id });
  }

  return buildTree(flat);
}

function buildTree(flat: { level: number; text: string; id: string }[]): HeadingItem[] {
  const root: HeadingItem[] = [];
  const stack: HeadingItem[] = [];

  for (const item of flat) {
    const node: HeadingItem = { id: item.id, level: item.level, text: item.text, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return root;
}

// ─── Markdown Outline Tree ───

function MarkdownNode({ item, depth }: { item: HeadingItem; depth: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = item.children.length > 0;

  const scrollTo = () => {
    const el = document.getElementById(item.id);
    const container = document.getElementById('markdown-scroll-container');
    if (el && container) {
      const elTop = el.getBoundingClientRect().top;
      const containerTop = container.getBoundingClientRect().top;
      container.scrollBy({ top: elTop - containerTop - 16, behavior: 'smooth' });
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded-md cursor-pointer group"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          paddingTop: 3,
          paddingBottom: 3,
          paddingRight: 4,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            className="flex-shrink-0 p-0.5 rounded"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <span
          onClick={scrollTo}
          className="flex-1 text-[11.5px] truncate leading-snug"
          style={{
            color: depth === 0 ? 'var(--color-text)' : 'var(--color-text-secondary)',
            fontWeight: depth === 0 ? 500 : 400,
          }}
          title={item.text}
        >
          {item.text}
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {item.children.map((child, i) => (
            <MarkdownNode key={i} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PDF Outline Tree ───

function PdfOutlineNode({
  item,
  depth,
}: {
  item: PdfOutlineItem;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const scrollToPdfPage = useUIStore((s) => s.scrollToPdfPage);
  const hasChildren = item.children && item.children.length > 0;

  const handleClick = async () => {
    if (!item.dest || !scrollToPdfPage) return;
    // dest can be a string (named dest) or array [pageRef, ...]. We stored
    // the raw dest from pdfjs which is already resolved via pdfDoc.getDestination.
    // Since we don't have pdfDoc here, we push a page number via a data attribute
    // trick: item.dest[0] is a page reference object. We can't resolve it without
    // pdfDoc. Instead, we use a custom event to let PdfViewer handle it.
    const event = new CustomEvent('outline-navigate', { detail: { dest: item.dest } });
    window.dispatchEvent(event);
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 rounded-md cursor-pointer"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          paddingTop: 3,
          paddingBottom: 3,
          paddingRight: 4,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-card-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            className="flex-shrink-0 p-0.5 rounded"
            style={{ color: 'var(--color-text-tertiary)' }}
          >
            {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <span
          onClick={handleClick}
          className="flex-1 text-[11.5px] truncate leading-snug"
          style={{
            color: depth === 0 ? 'var(--color-text)' : 'var(--color-text-secondary)',
            fontWeight: depth === 0 ? 500 : 400,
          }}
          title={item.title}
        >
          {item.title}
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {item.children.map((child, i) => (
            <PdfOutlineNode key={i} item={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main exported components ───

interface MarkdownOutlineProps {
  content: string;
}

export function MarkdownOutline({ content }: MarkdownOutlineProps) {
  const headings = useMemo(() => parseMarkdownHeadings(content), [content]);

  if (headings.length === 0) {
    return (
      <div className="px-4 py-3 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        无标题，请在文档中使用 # 添加标题
      </div>
    );
  }

  return (
    <div className="py-1 px-1">
      {headings.map((item, i) => (
        <MarkdownNode key={i} item={item} depth={0} />
      ))}
    </div>
  );
}

interface PdfOutlineProps {
  outline: PdfOutlineItem[];
}

export function PdfOutline({ outline }: PdfOutlineProps) {
  if (outline.length === 0) {
    return (
      <div className="px-4 py-3 text-[11px]" style={{ color: 'var(--color-text-tertiary)' }}>
        此 PDF 没有书签目录
      </div>
    );
  }

  return (
    <div className="py-1 px-1">
      {outline.map((item, i) => (
        <PdfOutlineNode key={i} item={item} depth={0} />
      ))}
    </div>
  );
}
