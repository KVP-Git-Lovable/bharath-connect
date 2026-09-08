/**
 * Development-only logging utility to prevent sensitive data leakage in production.
 * 
 * Usage:
 *   import { devLog, devWarn, devError } from '@/utils/devLog';
 *   devLog('Debug info:', data);
 * 
 * In production builds (import.meta.env.PROD), these functions are no-ops.
 */

export const devLog = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.log(...args);
  }
};

export const devWarn = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.warn(...args);
  }
};

export const devError = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.error(...args);
  }
};

export const devInfo = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.info(...args);
  }
};
