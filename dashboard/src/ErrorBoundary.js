import React from 'react';

/**
 * Top-level error boundary for Verifica.
 *
 * Without one, a single render exception unmounts the whole tree and the user
 * sees a white page — the worst possible failure mode in front of a customer,
 * because it is indistinguishable from the app being down. This keeps the
 * chrome, reports to Sentry if configured, and offers a way back.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ui] render error', error, info);
    if (typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.captureException === 'function') {
      window.Sentry.captureException(error, { extra: info });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 640, margin: '10vh auto', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something went wrong on this screen</h1>
        <p style={{ color: '#555', marginBottom: '1rem' }}>
          The rest of Verifica is still running. Reloading usually clears it; if it keeps happening,
          send this message to your administrator.
        </p>
        <pre style={{ background: '#f5f5f5', padding: '0.75rem', borderRadius: 8, overflowX: 'auto', fontSize: '0.8rem' }}>
          {String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error)}
        </pre>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Reload
        </button>
      </div>
    );
  }
}

