import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'loading';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
  useEffect(() => {
    if (type !== 'loading' && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose, type]);

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-success shrink-0" strokeWidth={2} />,
    error: <AlertCircle className="h-4 w-4 text-error shrink-0" strokeWidth={2} />,
    loading: <Loader2 className="h-4 w-4 text-text-muted shrink-0 animate-spin" strokeWidth={2} />,
  };

  return (
    <div className="flex items-center gap-2.5 pl-3.5 pr-2 py-2.5 rounded-surface border border-border-light bg-bg-elevated shadow-float animate-slide-in">
      {icons[type]}
      <p className="text-text-primary text-body font-medium flex-1 leading-snug">{message}</p>
      {type !== 'loading' && (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          className="inline-flex items-center justify-center w-6 h-6 rounded-control text-text-muted hover:text-text-primary hover:bg-bg-tertiary transition-colors duration-fast ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type: ToastType }>;
  onRemove: (id: string) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: ToastType }>>([]);

  const addToast = (message: string, type: ToastType) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts(prev => [...prev, { id, message, type }]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const updateToast = (id: string, message: string, type: ToastType) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, message, type } : t));
  };

  return {
    toasts,
    addToast,
    removeToast,
    updateToast,
    success: (message: string) => addToast(message, 'success'),
    error: (message: string) => addToast(message, 'error'),
    loading: (message: string) => addToast(message, 'loading'),
  };
}
