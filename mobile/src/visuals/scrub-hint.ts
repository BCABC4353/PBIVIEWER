export interface ScrubHintGate {
  claim(): boolean;
  dismiss(): void;
  dismissed(): boolean;
  onDismiss(listener: () => void): () => void;
}

export function createScrubHintGate(): ScrubHintGate {
  let claimed = false;
  let dismissed = false;
  const listeners = new Set<() => void>();
  return {
    claim() {
      if (claimed || dismissed) return false;
      claimed = true;
      return true;
    },
    dismiss() {
      if (dismissed) return;
      dismissed = true;
      for (const listener of [...listeners]) listener();
    },
    dismissed: () => dismissed,
    onDismiss(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const scrubHintGate: ScrubHintGate = createScrubHintGate();
