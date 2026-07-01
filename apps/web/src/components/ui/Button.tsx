'use client';

import type { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses: Record<string, string> = {
  primary: 'bg-primary-600 text-slate-900 hover:bg-primary-700 disabled:opacity-50',
  secondary: 'bg-white border border-slate-200 text-slate-900 hover:bg-slate-50 disabled:opacity-50',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 disabled:opacity-50',
  danger: 'bg-red-600 text-slate-900 hover:bg-red-700 disabled:opacity-50',
};

const sizeClasses: Record<string, string> = {
  sm: 'px-2.5 py-1 text-xs rounded',
  md: 'px-3.5 py-1.5 text-sm rounded-lg',
  lg: 'px-5 py-2 text-base rounded-lg',
};

export function Button({ variant = 'secondary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 font-medium transition-colors cursor-pointer ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    />
  );
}
