'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

const NAV_SECTIONS = [
  {
    label: 'Build',
    items: [
      { href: '/agents', label: 'Agents', icon: '🤖' },
      { href: '/workflows', label: 'Workflows', icon: '⚡' },
      { href: '/plugins', label: 'Plugins', icon: '🔌' },
      { href: '/knowledge', label: 'Knowledge', icon: '📚' },
      { href: '/prompts', label: 'Prompts', icon: '📝' },
    ],
  },
  {
    label: 'Test',
    items: [
      { href: '/playground', label: 'Playground', icon: '💬' },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { href: '/apps', label: 'Apps', icon: '📦' },
      { href: '/marketplace', label: 'Marketplace', icon: '🏪' },
    ],
  },
  {
    label: 'Orchestrate',
    items: [
      { href: '/', label: 'Graphs', icon: '📊' },
      { href: '/workers', label: 'Workers', icon: '⚙️' },
      { href: '/evolution', label: 'Evolution', icon: '🧬' },
      { href: '/meta', label: 'Observatory', icon: '🔭' },
      { href: '/replication', label: 'Replication', icon: '📈' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/audit', label: 'Audit Log', icon: '📋' },
      { href: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
];

export default function AppSidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <aside className="w-56 h-screen border-r border-border bg-card flex flex-col fixed left-0 top-0 z-30">
      <div className="px-4 py-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold text-primary">Pajama Hive</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-1">
            <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-4 py-1.5 mx-2 rounded-md text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                <span className="text-sm w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3 flex items-center gap-2">
        <UserButton afterSignOutUrl="/sign-in" />
        <span className="text-xs text-muted-foreground">Account</span>
      </div>
    </aside>
  );
}
