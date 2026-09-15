import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last line of defence: a thrown render/handler error would otherwise unmount
 * the whole tree and leave the user staring at a black canvas.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("NeonDrift crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07060f] p-6 font-body text-white">
        <div className="w-[min(92vw,420px)] rounded-2xl border border-rose-400/30 bg-[#0c0820]/90 p-6 text-center shadow-[0_0_60px_-10px_rgba(255,45,149,0.5)]">
          <div className="font-display text-3xl font-black tracking-[0.2em] text-rose-300">
            PIT STOP
          </div>
          <p className="mt-3 text-sm text-white/60">
            Something broke in the garage. Your high scores are safe.
          </p>
          <pre className="mt-3 max-h-24 overflow-auto rounded-lg bg-black/50 p-2 text-left font-mono text-[10px] text-rose-200/70">
            {error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-6 py-3 font-display text-sm font-black uppercase tracking-[0.2em] text-[#0a0618] active:scale-95"
          >
            Back to track
          </button>
        </div>
      </div>
    );
  }
}
