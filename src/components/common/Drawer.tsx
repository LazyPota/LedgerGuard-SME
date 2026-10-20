import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'xl',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClass = {
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  }[width];

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-xs"
      data-testid="drawer-container"
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 flex pl-10 max-w-full">
        <div
          className={`w-screen ${widthClass} bg-slate-900 border-l border-slate-700/80 shadow-2xl flex flex-col`}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
};
