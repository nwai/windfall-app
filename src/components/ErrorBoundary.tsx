import React from "react";

type Props = {
  name?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
};

type State = { hasError: boolean; message?: string; stack?: string };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: any): State {
    return { hasError: true, message: String(err?.message ?? err), stack: String(err?.stack ?? "") };
  }

  componentDidCatch(error: any, info: any) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ""}]`, error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{ border: "1px solid #f5c2c7", background: "#f8d7da", color: "#842029", padding: 10, borderRadius: 6 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          {this.props.name || "Section"} failed to render
        </div>
        {this.props.fallback ?? (
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0 }}>
            {this.state.message}
            {this.state.stack ? `\n\n${this.state.stack}` : ""}
          </pre>
        )}
      </div>
    );
  }
}

export default ErrorBoundary;