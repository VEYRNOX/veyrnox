import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('localBase44 entity contract', () => {
  beforeEach(async () => {
    vi.resetModules();
    await new Promise((resolve) => {
      const req = indexedDB.deleteDatabase('veyrnox-appdata');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it('honors descending sort and limit for list()', async () => {
    const { localBase44 } = await import('../localClient.js');
    const Wallet = localBase44.entities.Wallet;

    await Wallet.create({ name: 'Older', created_date: '2026-08-15T10:00:00.000Z' });
    await Wallet.create({ name: 'Newest', created_date: '2026-08-17T10:00:00.000Z' });
    await Wallet.create({ name: 'Middle', created_date: '2026-08-16T10:00:00.000Z' });

    const rows = await Wallet.list('-created_date', 2);

    expect(rows.map((r) => r.name)).toEqual(['Newest', 'Middle']);
  });

  it('honors ascending sort for list()', async () => {
    const { localBase44 } = await import('../localClient.js');
    const Wallet = localBase44.entities.Wallet;

    await Wallet.create({ name: 'Zulu' });
    await Wallet.create({ name: 'Alpha' });
    await Wallet.create({ name: 'Mike' });

    const rows = await Wallet.list('name');

    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Mike', 'Zulu']);
  });

  it('stamps updated_date on update()', async () => {
    const { localBase44 } = await import('../localClient.js');
    const Wallet = localBase44.entities.Wallet;

    const created = await Wallet.create({ name: 'Wallet 1' });
    const updated = await Wallet.update(created.id, { name: 'Renamed' });

    expect(updated.name).toBe('Renamed');
    expect(updated.updated_date).toBeTruthy();
    expect(Date.parse(updated.updated_date)).not.toBeNaN();
  });

  it('rejects update() when the row does not exist', async () => {
    const { localBase44 } = await import('../localClient.js');

    await expect(localBase44.entities.Wallet.update('missing-id', { name: 'Ghost' }))
      .rejects.toMatchObject({
        code: 'LOCAL_ENTITY_NOT_FOUND',
        entity: 'Wallet',
        id: 'missing-id',
      });
  });
});
