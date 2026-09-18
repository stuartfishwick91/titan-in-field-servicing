import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine } from '../src/cloud/syncEngine.ts';

function server() {
  let snapshot = { revision: 0, documents: {} };
  const receipts = new Set();
  return {
    read: async () => structuredClone(snapshot),
    commit: async (pending) => {
      if (receipts.has(pending.operationId)) return structuredClone(snapshot);
      if (pending.expectedRevision !== snapshot.revision) throw new Error('conflict');
      snapshot = { revision: snapshot.revision + 1, documents: structuredClone(pending.documents) };
      receipts.add(pending.operationId);
      return structuredClone(snapshot);
    },
  };
}

test('two independent clients share an atomic service entry and stock change', async () => {
  const transport = server();
  const desktop = new SyncEngine(await transport.read(), null, transport, () => {});
  const phone = new SyncEngine(await transport.read(), null, transport, () => {});
  phone.stage({ entries: '[{"litres":100}]', stock: '600' }, 'phone-1');
  await phone.save();
  assert.deepEqual((await desktop.refresh()).documents, { entries: '[{"litres":100}]', stock: '600' });
});

test('a concurrent stale save fails without overwriting newer records and retains its draft', async () => {
  const transport = server();
  let pending;
  const phone = new SyncEngine(await transport.read(), null, transport, value => { pending = value; });
  const desktop = new SyncEngine(await transport.read(), null, transport, () => {});
  phone.stage({ stock: '600' }, 'phone-1');
  desktop.stage({ stock: '500' }, 'desktop-1');
  await desktop.save();
  await assert.rejects(phone.save(), /conflict/);
  assert.equal((await transport.read()).documents.stock, '500');
  assert.equal(pending.documents.stock, '600');
  assert.equal((await phone.discard()).documents.stock, '500');
  assert.equal(pending, null);
});

test('retry after a lost response does not duplicate a commit, including after a later update', async () => {
  const transport = server();
  let fail = true;
  let pending;
  const unstable = { ...transport, commit: async value => {
    const result = await transport.commit(value);
    if (fail) { fail = false; throw new Error('connection lost'); }
    return result;
  } };
  const phone = new SyncEngine(await transport.read(), null, unstable, value => { pending = value; });
  phone.stage({ stock: '600' }, 'phone-1');
  await assert.rejects(phone.save(), /connection lost/);
  const desktop = new SyncEngine(await transport.read(), null, transport, () => {});
  desktop.stage({ stock: '500' }, 'desktop-1'); await desktop.save();
  const reopened = new SyncEngine(await transport.read(), pending, unstable, () => {});
  const result = await reopened.save();
  assert.equal(result.revision, 2);
  assert.equal(result.documents.stock, '500');
});

test('local backup failure prevents starting a server save', async () => {
  const transport = server();
  const phone = new SyncEngine(await transport.read(), null, transport, () => { throw new Error('storage full'); });
  assert.throws(() => phone.stage({ stock: '600' }, 'phone-1'), /storage full/);
  assert.equal(phone.pending, null);
  assert.equal((await transport.read()).revision, 0);
});
