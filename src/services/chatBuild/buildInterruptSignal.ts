interface InterruptRegistryEntry {
  runId: string;
  requested: boolean;
  requestedAt: number | null;
}

class BuildInterruptedError extends Error {
  constructor(message: string = '构建已中断') {
    super(message);
    this.name = 'BuildInterruptedError';
  }
}

const registry = new Map<string, InterruptRegistryEntry>();

export const buildInterruptSignal = {
  attach(tabId: string, runId: string) {
    registry.set(tabId, {
      runId,
      requested: false,
      requestedAt: null,
    });
  },

  detach(tabId: string) {
    registry.delete(tabId);
  },

  request(tabId: string, runId: string): boolean {
    const entry = registry.get(tabId);
    if (!entry || entry.runId !== runId) {
      return false;
    }

    entry.requested = true;
    entry.requestedAt = Date.now();
    return true;
  },

  isRequested(tabId: string, runId: string): boolean {
    const entry = registry.get(tabId);
    return Boolean(entry && entry.runId === runId && entry.requested);
  },

  assertNotInterrupted(tabId: string, runId: string) {
    if (this.isRequested(tabId, runId)) {
      throw new BuildInterruptedError();
    }
  },

  getRequestedAt(tabId: string, runId: string): number | null {
    const entry = registry.get(tabId);
    if (!entry || entry.runId !== runId) {
      return null;
    }
    return entry.requestedAt;
  },

  isInterruptError(error: unknown): boolean {
    return error instanceof BuildInterruptedError;
  },
};

