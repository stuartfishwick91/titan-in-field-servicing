export type Documents = Record<string, string>;
export type Snapshot = { revision: number; documents: Documents };
export type Pending = { expectedRevision: number; documents: Documents; operationId: string };
export type Transport = {
  read: () => Promise<Snapshot | null>;
  commit: (pending: Pending) => Promise<Snapshot>;
};

// A complete user action (entry + fuel register + stock movements) commits together.
// Retrying uses the same operation id; the server keeps a receipt for each commit.
export class SyncEngine {
  snapshot: Snapshot;
  pending: Pending | null;
  private transport: Transport;
  private persistPending: (pending: Pending | null) => void;
  constructor(
    snapshot: Snapshot, pending: Pending | null, transport: Transport,
    persistPending: (pending: Pending | null) => void,
  ) { this.snapshot = snapshot; this.pending = pending; this.transport = transport; this.persistPending = persistPending; }

  stage(documents: Documents, operationId: string) {
    if (this.pending) throw new Error("Finish or discard the previous save before editing.");
    const next = { expectedRevision: this.snapshot.revision, documents: { ...documents }, operationId };
    // Persist before sending so closing the page cannot silently lose an in-flight action.
    this.persistPending(next);
    this.pending = next;
  }

  async save() {
    if (!this.pending) return this.snapshot;
    const result = await this.transport.commit(this.pending);
    this.persistPending(null);
    this.pending = null;
    this.snapshot = result;
    return result;
  }

  async refresh() {
    if (this.pending) return this.snapshot;
    const result = await this.transport.read();
    if (!result) throw new Error("Shared trial is unavailable. Please sign in again.");
    this.snapshot = result;
    return result;
  }

  async discard() {
    const result = await this.transport.read();
    if (!result) throw new Error("Cannot discard until the shared trial is reachable.");
    this.persistPending(null);
    this.pending = null;
    this.snapshot = result;
    return result;
  }
}
