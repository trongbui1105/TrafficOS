// src/app/layout.tsx
import type { Metadata } from 'next';
import { Providers } from '@/components/Providers';
import { Sidebar } from '@/components/Sidebar';
import './globals.css';

export const metadata: Metadata = {
  title: 'TrafficOS — Real-time Monitoring',
  description: 'Real-time traffic analysis and congestion monitoring dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased flex">
        <Sidebar />
        <Providers>
          <main className="flex-1 ml-16 lg:ml-60 min-h-screen">
            <div className="max-w-7xl mx-auto px-4 py-6">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
