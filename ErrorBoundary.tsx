import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080c10] text-[#c8d8e8] flex items-center justify-center p-4">
          <div className="bg-[#e04040]/10 border border-[#e04040] rounded-xl p-6 max-w-md w-full text-center space-y-4">
            <AlertTriangle size={48} className="text-[#e04040] mx-auto" />
            <h2 className="text-xl font-bold text-[#e04040]">حدث خطأ غير متوقع</h2>
            <p className="text-sm text-[#6a8099]">
              {this.state.error?.message || 'يرجى التحقق من صلاحيات الكاميرا والميكروفون وإعادة المحاولة.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 flex items-center justify-center gap-2 w-full p-3 rounded-lg bg-[#e04040] text-white font-bold hover:bg-[#c03030] transition-colors"
            >
              <RefreshCw size={16} />
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
