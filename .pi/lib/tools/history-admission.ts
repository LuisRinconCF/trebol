/** Bound simultaneous history working sets; never retain an unbounded wait queue. */
export class HistoryAdmission {
  private active = 0;
  constructor(private readonly capacity = 1) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error("invalid history admission capacity");
  }

  async run<T>(signal: AbortSignal | undefined, operation: () => Promise<T>): Promise<T> {
    signal?.throwIfAborted();
    if (this.active >= this.capacity) throw new Error("History is busy; retry after the current history operation finishes");
    this.active++;
    try {
      signal?.throwIfAborted();
      return await operation();
    } finally {
      this.active--;
    }
  }
}

export const historyAdmission = new HistoryAdmission();
