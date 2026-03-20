'use client';

import AppSidebar from './AppSidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 ml-56">{children}</main>
    </div>
  );
}
