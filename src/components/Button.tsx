import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

export function Button({ variant = 'primary', className = '', children, ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm',
    secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 shadow-sm',
    ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
