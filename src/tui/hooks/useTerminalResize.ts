/**
 * Hook to handle terminal resize events
 *
 * Listens for process.stdout 'resize' events and triggers re-render
 * when the terminal dimensions change.
 */

import { useEffect, useState, useCallback } from 'react';

interface TerminalDimensions {
  columns: number;
  rows: number;
}

/**
 * Hook that returns current terminal dimensions and updates on resize
 */
export function useTerminalResize(): TerminalDimensions {
  const [dimensions, setDimensions] = useState<TerminalDimensions>({
    columns: process.stdout.columns ?? 80,
    rows: process.stdout.rows ?? 24,
  });

  const handleResize = useCallback(() => {
    setDimensions({
      columns: process.stdout.columns ?? 80,
      rows: process.stdout.rows ?? 24,
    });
  }, []);

  useEffect(() => {
    process.stdout.on('resize', handleResize);
    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, [handleResize]);

  return dimensions;
}

/**
 * Hook that triggers a callback on terminal resize
 */
export function useOnTerminalResize(callback: () => void): void {
  useEffect(() => {
    process.stdout.on('resize', callback);
    return () => {
      process.stdout.off('resize', callback);
    };
  }, [callback]);
}
