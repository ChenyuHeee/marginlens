import { useRef, useCallback } from 'react';
import { useUIStore } from '@/stores';

interface ResizableHandleProps {
  side: 'left' | 'right';
}

export function ResizableHandle({ side }: ResizableHandleProps) {
  const { setRightPanelWidth, rightPanelWidth } = useUIStore();
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = rightPanelWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return;
        const delta = side === 'right' ? startX.current - e.clientX : e.clientX - startX.current;
        setRightPanelWidth(startWidth.current + delta);
      };

      const handleMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [rightPanelWidth, setRightPanelWidth, side],
  );

  return (
    <div
      className="w-1 cursor-col-resize hover:bg-indigo-500 active:bg-indigo-500 transition-colors flex-shrink-0"
      onMouseDown={handleMouseDown}
    />
  );
}
