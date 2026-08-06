import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App.js';

interface ErrorBoundaryState {
    readonly error: Error | null;
}

/**
 * Catches any render/effect throw and shows a recoverable message instead of unmounting the tree
 * (which, against the dark page background, reads as a "black screen"). Belt-and-suspenders behind
 * the debounced+guarded URL sync in App.tsx.
 */
class ErrorBoundary extends React.Component<{ readonly children: React.ReactNode }, ErrorBoundaryState> {
    override state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    override render() {
        if (this.state.error) {
            return (
                <main style={{ margin: '0 auto', maxWidth: 640, padding: '4rem 1.5rem' }}>
                    <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>Something went wrong</h1>
                    <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
                        The model view hit an unexpected error. Your inputs are preserved in the URL — reloading
                        restores them.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: 8,
                            color: '#141414',
                            cursor: 'pointer',
                            fontWeight: 600,
                            padding: '0.6rem 1.1rem',
                        }}
                        type="button"
                    >
                        Reload
                    </button>
                    <pre
                        style={{
                            color: 'var(--danger)',
                            fontSize: '0.8rem',
                            marginTop: '1.5rem',
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                        }}
                    >
                        {this.state.error.message}
                    </pre>
                </main>
            );
        }

        return this.props.children;
    }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
);
