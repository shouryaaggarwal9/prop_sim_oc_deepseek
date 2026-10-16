'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for failures in the root layout itself. Must render its
 * own html/body because it replaces the tree above the layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0b0f19',
          color: '#f1f5f9',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 420, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>Application error</h1>
          <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.5 }}>
            The simulator failed to start. Reload the page to try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 20,
              padding: '10px 18px',
              borderRadius: 8,
              border: 0,
              background: '#10b981',
              color: '#0b0f19',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}