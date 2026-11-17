import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home, Sparkles } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('SoundDeck Studio Runtime Error Caught:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B0D10] text-slate-100 flex items-center justify-center p-4 antialiased font-sans">
          <div className="w-full max-w-lg rounded-2xl bg-[#13161B] border border-red-900/50 shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-950/80 border border-red-800/60 flex items-center justify-center text-red-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-slate-100">
                  {this.props.fallbackTitle || 'Studio Runtime Recovery'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  SoundDeck Studio caught an unexpected UI exception and isolated the failure to protect your session.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="p-3.5 rounded-xl bg-[#0B0D10] border border-[#232833] space-y-2">
                <div className="text-[11px] font-mono text-amber-400 uppercase tracking-wider">
                  Exception Details
                </div>
                <pre className="text-xs font-mono text-red-300 max-h-36 overflow-y-auto whitespace-pre-wrap break-all">
                  {this.state.error.toString()}
                </pre>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reload Studio Session</span>
              </button>
              <a
                href={import.meta.env.BASE_URL || './'}
                className="w-full sm:w-auto py-3 px-4 rounded-xl bg-[#1B2028] hover:bg-[#252B36] text-slate-200 text-xs font-medium border border-[#2A313E] flex items-center justify-center gap-2 transition-colors text-center"
              >
                <Home className="w-4 h-4 text-amber-400" />
                <span>Return Home</span>
              </a>
            </div>

            <div className="text-center text-[11px] text-slate-500 pt-2 border-t border-[#232833]">
              SoundDeck Studio · Artists, Creators &amp; DJs Workspace
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
