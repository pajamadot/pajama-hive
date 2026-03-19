'use client';

import { useEffect, useRef } from 'react';

interface LogTerminalProps {
  logs: string[];
}

export function LogTerminal({ logs }: LogTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<unknown>(null);

  useEffect(() => {
    // Dynamic import to avoid SSR issues with xterm
    let terminal: { write: (data: string) => void; open: (el: HTMLElement) => void; dispose: () => void } | null = null;
    let fitAddon: { fit: () => void } | null = null;

    async function init() {
      if (!containerRef.current) return;

      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      await import('xterm/css/xterm.css');

      terminal = new Terminal({
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

      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon as never);
      terminal.open(containerRef.current);
      fitAddon.fit();

      terminalRef.current = terminal;

      const observer = new ResizeObserver(() => fitAddon?.fit());
      observer.observe(containerRef.current);

      return () => {
        observer.disconnect();
        terminal?.dispose();
      };
    }

    const cleanup = init();
    return () => { cleanup.then((fn) => fn?.()); };
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
