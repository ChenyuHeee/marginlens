import { useRef } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';

import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

interface LiveMarkdownEditorProps {
  content: string;
  documentId: string;
  onChange: (markdown: string) => void;
}

function MilkdownEditorInner({ content, onChange }: Omit<LiveMarkdownEditorProps, 'documentId'>) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEditor((root) => {
    return new Crepe({
      root,
      defaultValue: content,
      features: {
        [CrepeFeature.CodeMirror]: true,
        [CrepeFeature.ListItem]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.Cursor]: true,
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.Toolbar]: true,
        [CrepeFeature.Placeholder]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.Latex]: true,
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.TopBar]: false,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: '开始输入 Markdown...',
        },
      },
    }).on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) {
          onChangeRef.current(markdown);
        }
      });
    });
  }, []);

  return <Milkdown />;
}

export function LiveMarkdownEditor({ content, documentId, onChange }: LiveMarkdownEditorProps) {
  return (
    <MilkdownProvider key={documentId}>
      <div className="live-editor-wrapper">
        <MilkdownEditorInner content={content} onChange={onChange} />
      </div>
    </MilkdownProvider>
  );
}
