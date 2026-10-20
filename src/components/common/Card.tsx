import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
  subtitle?: string;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  action,
  subtitle,
}) => {
  return (
    <div
      className={`bg-slate-900 border border-slate-800 rounded-lg shadow-sm overflow-hidden ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/60">
          <div>
            <h4 className="text-sm font-semibold text-slate-100">{title}</h4>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
};
