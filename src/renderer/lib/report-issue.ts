export function reportIssue(event: {
  code: string;
  httpStatus?: number;
  itemName?: string;
  context?: string;
}): void {
  try {
    void window.electronAPI?.beacon?.report(event).catch(() => {
    });
  } catch {
  }
}
