export type ClaimResult<T> =
  | { status: "active" }
  | { status: "completed"; value: T }
  | { status: "new" };

export class IdempotencyLedger<T> {
  private readonly active = new Set<string>();
  private readonly completed = new Map<string, T>();

  constructor(private readonly maxCompleted = 100) {}

  claim(id: string): ClaimResult<T> {
    const completed = this.completed.get(id);
    if (completed !== undefined) {
      return { status: "completed", value: completed };
    }
    if (this.active.has(id)) {
      return { status: "active" };
    }
    this.active.add(id);
    return { status: "new" };
  }

  complete(id: string, value: T): void {
    this.active.delete(id);
    this.completed.set(id, value);
    while (this.completed.size > this.maxCompleted) {
      const oldest = this.completed.keys().next().value;
      if (!oldest) {
        break;
      }
      this.completed.delete(oldest);
    }
  }

  release(id: string): void {
    this.active.delete(id);
  }
}
