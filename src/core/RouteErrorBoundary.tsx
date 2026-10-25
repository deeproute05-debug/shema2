import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const CHUNK_LOAD_PATTERNS = [
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
];

function isChunkLoadError(error: Error): boolean {
  const msg = error?.message ?? '';
  return CHUNK_LOAD_PATTERNS.some((p) => msg.includes(p));
}

const RELOAD_KEY = 'orgcanvas_chunk_reload_done';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  isChunkLoadError: boolean;
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, isChunkLoadError: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      isChunkLoadError: isChunkLoadError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('route error boundary caught', error, info);

    if (isChunkLoadError(error) && !sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
    }
  }

  handleReload = () => {
    sessionStorage.removeItem(RELOAD_KEY);
    window.location.reload();
  };

  reset = () => {
    this.setState({ hasError: false, isChunkLoadError: false });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkLoadError) {
        return <ChunkLoadFallback onReload={this.handleReload} />;
      }
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-lg font-semibold text-ink-900 dark:text-ink-100">
              Something went wrong
            </p>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              This section failed to load. Please try again.
            </p>
            <button className="btn-secondary" onClick={this.reset}>
              Retry
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

function ChunkLoadFallback({ onReload }: { onReload: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold text-ink-900 dark:text-ink-100">
        {t('update.new_version_available')}
      </p>
      <p className="text-sm text-ink-500 dark:text-ink-400">
        {t('update.new_version_desc')}
      </p>
      <button className="btn-primary" onClick={onReload}>
        {t('update.reload')}
      </button>
    </div>
  );
}
