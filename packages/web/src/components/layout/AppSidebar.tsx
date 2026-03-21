'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';

const NAV_SECTIONS = [
  {
    label: 'Build',
    items: [
      { href: '/agents', label: 'Agents' },
      { href: '/workflows', label: 'Workflows' },
      { href: '/plugins', label: 'Plugins' },
      { href: '/knowledge', label: 'Knowledge' },
      { href: '/prompts', label: 'Prompts' },
    ],
  },
  {
    label: 'Test',
    items: [
      { href: '/playground', label: 'Playground' },
    ],
  },
  {
    label: 'Deploy',
    items: [
      { href: '/apps', label: 'Apps' },
      { href: '/marketplace', label: 'Marketplace' },
    ],
  },
  {
    label: 'Orchestrate',
    items: [
      { href: '/', label: 'Graphs' },
      { href: '/workers', label: 'Workers' },
      { href: '/replication', label: 'Replication' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/audit', label: 'Audit Log' },
      { href: '/settings', label: 'Settings' },
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
    <aside className="w-52 h-screen border-r bg-card flex flex-col fixed left-0 top-0 z-30">
      <div className="px-4 py-4 border-b">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 bg-foreground rounded-md flex items-center justify-center">
            <span className="text-background text-xs font-bold">H</span>
          </div>
          <span className="text-sm font-semibold tracking-tight">Pajama Hive</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-3">
            <div className="px-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {section.label}
            </div>
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center px-4 py-1.5 text-[13px] transition-colors ${
                  isActive(item.href)
                    ? 'text-foreground font-medium bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t px-4 py-3 flex items-center gap-2">
        <UserButton afterSignOutUrl="/sign-in" />
        <span className="text-xs text-muted-foreground">Account</span>
      </div>
    </aside>
  );
}
