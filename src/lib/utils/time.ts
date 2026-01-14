// Time formatting utilities
// Requirements: 7.6

/**
 * Format a timestamp as relative time (e.g., "5 minutes ago", "2 hours ago", "3 days ago").
 * Returns a human-readable string representing the time difference from now.
 * Requirements: 7.6
 */
export function formatRelativeTime(
  timestamp: number | null,
  now: number = Date.now(),
  locale: string = 'en'
): string | null {
  if (timestamp === null || timestamp === undefined) {
    return null;
  }

  const diffMs = now - timestamp;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });

  // Handle future timestamps or very recent (within 1 second)
  if (diffMs < 1000) {
    return 'just now';
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) {
    return rtf.format(-years, 'year');
  }
  if (months > 0) {
    return rtf.format(-months, 'month');
  }
  if (weeks > 0) {
    return rtf.format(-weeks, 'week');
  }
  if (days > 0) {
    return rtf.format(-days, 'day');
  }
  if (hours > 0) {
    return rtf.format(-hours, 'hour');
  }
  if (minutes > 0) {
    return rtf.format(-minutes, 'minute');
  }
  return rtf.format(-seconds, 'second');
}

/**
 * Format bytes to human-readable size (e.g., "1.5 KB", "2.3 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  // Use 1 decimal place for KB and above, no decimals for bytes
  if (i === 0) {
    return `${bytes} B`;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}
