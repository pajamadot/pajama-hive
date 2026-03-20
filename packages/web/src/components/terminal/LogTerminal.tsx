'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface LogTerminalProps {
  logs: string[];
}

export function LogTerminal({ logs }: LogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<unknown>(null);
  const [height, setHeight] = useState(200);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startHeight.current = height;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = startY.current - e.clientY;
      setHeight(Math.max(80, Math.min(600, startHeight.current + delta)));
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [height]);

  useEffect(() => {
    let disposed = false;

    async function init() {
      if (!containerRef.current) return;

      const xtermModule = await import('@xterm/xterm');
      const fitModule = await import('@xterm/addon-fit');

      if (disposed) return;

      const terminal = new xtermModule.Terminal({
        theme: {
          background: '#0a0a0f',
          foreground: '#e4e4e7',
          cursor: '#a78bfa',
        },
        fontSize: 13,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
        disableStdin: true,
        scrollback: 5000,
      });

      const fitAddon = new fitModule.FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(containerRef.current!);
      fitAddon.fit();

      terminalRef.current = terminal;

      const observer = new ResizeObserver(() => fitAddon.fit());
      observer.observe(containerRef.current!);

      return () => {
        observer.disconnect();
        terminal.dispose();
      };
    }

    const cleanup = init();
    return () => {
      disposed = true;
      cleanup.then((fn) => fn?.());
    };
  }, []);

  // Write new logs
  useEffect(() => {
    const term = terminalRef.current as { write: (data: string) => void } | null;
    if (!term || logs.length === 0) return;

    const latest = logs[logs.length - 1];
    term.write(latest);
  }, [logs]);

  return (
    <div className="border-t border-border bg-[#0a0a0f] flex flex-col" style={{ height: collapsed ? 'auto' : undefined }}>
      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className="h-1 cursor-row-resize hover:bg-blue-500/50 transition-colors shrink-0"
      />
      <div className="px-4 py-1.5 border-b border-border flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Terminal Output</span>
        <div className="flex-1" />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </button>
      </div>
      {!collapsed && <div ref={containerRef} style={{ height }} />}
    </div>
  );
}
