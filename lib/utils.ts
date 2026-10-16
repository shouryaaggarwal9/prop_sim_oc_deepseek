import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names, letting later Tailwind utilities win. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Indian currency grouping (lakh / crore). `showSign` prefixes an explicit +/-
 * for P&L figures; without it, negatives carry the rupee sign.
 */
export function formatINR(value: number, showSign = false): string {
  if (!Number.isFinite(value)) return '₹0';

  const rounded = Math.round(value * 100) / 100;
  const formatted = Math.abs(rounded).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });

  if (showSign) {
    if (rounded > 0) return `+₹${formatted}`;
    if (rounded < 0) return `-₹${formatted}`;
    return '₹0';
  }

  return rounded < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return (0).toFixed(decimals);
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}