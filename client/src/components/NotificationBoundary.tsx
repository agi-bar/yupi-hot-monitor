import React from 'react';

interface NotificationBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface NotificationBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onRetry?: () => void;
}

export class NotificationBoundary extends React.Component<NotificationBoundaryProps, NotificationBoundaryState> {
  constructor(props: NotificationBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): NotificationBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('NotificationBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-red-400 text-sm">通知加载失败</p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onRetry?.();
            }}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
