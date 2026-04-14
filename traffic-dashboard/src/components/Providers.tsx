// src/components/Providers.tsx
'use client';

import { Toaster } from 'react-hot-toast';

interface Props {
  children: React.ReactNode;
}

export function Providers({ children }: Props) {
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        gutter={8}
        toastOptions={{
          style: {
            background: '#0f172a',
            color: '#f1f5f9',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            fontSize: '13px',
            padding: '12px 16px',
            maxWidth: '420px',
          },
          success: {
            style: {
              border: '1px solid #10b981',
            },
          },
          error: {
            style: {
              border: '1px solid #ef4444',
            },
          },
        }}
      />
    </>
  );
}
