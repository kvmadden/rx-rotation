import { Component } from "react";
import { Co, shadow, font } from "../theme.js";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error: error };
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return <div style={{ maxWidth: 520, margin: "0 auto", padding: "60px 24px", textAlign: "center", fontFamily: "var(--font)" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--tx)" }}>Something went wrong</h2>
      <p style={{ fontSize: 13, color: "var(--tx-mu)", marginBottom: 24, lineHeight: 1.5 }}>
        The scheduler hit an unexpected error. Your browser data is safe — nothing is stored on any server.
      </p>
      <button onClick={function () { window.location.reload(); }} style={{ padding: "12px 24px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "var(--font)", background: "var(--ac)", color: "#fff" }}>
        Reload App
      </button>
      <details style={{ marginTop: 24, textAlign: "left", fontSize: 11, color: "var(--tx-d)" }}>
        <summary style={{ cursor: "pointer", marginBottom: 8 }}>Error details</summary>
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--sf)", padding: 12, borderRadius: 8, fontFamily: "var(--mono)", lineHeight: 1.5 }}>
          {this.state.error && this.state.error.toString()}
        </pre>
      </details>
    </div>;
  }
}
