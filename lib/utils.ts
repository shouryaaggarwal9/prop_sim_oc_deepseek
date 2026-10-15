import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(val: number, showSign: boolean = false): string {
  const isNegative = val < 0;
  const absVal = Math.abs(val);

  // Format in Indian currency notation (₹ Lakhs / Crores)
  const formatted = absVal.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  if (showSign) {
    if (val > 0) return `+₹${formatted}`;
    if (val < 0) return `-₹${formatted}`;
    return `₹${formatted}`;
  }

  return `${isNegative ? '-' : ''}₹${formatted}`;
}

export function formatNumber(val: number, decimals: number = 2): string {
  return val.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
