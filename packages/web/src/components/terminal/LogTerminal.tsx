'use client';

import { useEffect, useRef } from 'react';

interface LogTerminalProps {
  logs: string[];
}

export function LogTerminal({ logs }: LogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<unknown>(null);

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
    <div className="border-t border-border bg-[#0a0a0f]">
      <div className="px-4 py-2 border-b border-border flex items-center gap-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Terminal Output</span>
      </div>
      <div ref={containerRef} className="h-48" />
    </div>
  );
}
