import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pajama Hive',
  description: 'Agent Orchestrator + DAG Visualizer',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="min-h-screen antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
