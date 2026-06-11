export function codeCountdown(expiresAt: number, now: number): string | null {
  const remainingMs = expiresAt - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const totalSec = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
