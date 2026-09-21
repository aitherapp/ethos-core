import { describe, expect, it } from 'vitest';
import type { OutboxEntry } from '../src/lib/messageOutbox';
import {
  enqueueOutbox,
  listOutboxForPeer,
  removeOutbox,
} from '../src/lib/messageOutbox';

function entry(
  partial: Partial<OutboxEntry> & Pick<OutboxEntry, 'id' | 'peerId' | 'text'>,
): OutboxEntry {
  return {
    createdAt: 1,
    ...partial,
  };
}

describe('messageOutbox', () => {
  it('enqueue appends in FIFO order and returns a new array', () => {
    const queue: OutboxEntry[] = [
      entry({ id: 'a', peerId: 'p1', text: 'first', createdAt: 10 }),
    ];
    const next = entry({ id: 'b', peerId: 'p1', text: 'second', createdAt: 20 });
    const result = enqueueOutbox(queue, next);

    expect(result).toEqual([
      entry({ id: 'a', peerId: 'p1', text: 'first', createdAt: 10 }),
      entry({ id: 'b', peerId: 'p1', text: 'second', createdAt: 20 }),
    ]);
    expect(result).not.toBe(queue);
    expect(queue).toHaveLength(1);
  });

  it('listOutboxForPeer returns entries for one peer in FIFO order', () => {
    const queue: OutboxEntry[] = [
      entry({ id: '1', peerId: 'alice', text: 'a', createdAt: 1 }),
      entry({ id: '2', peerId: 'bob', text: 'b', createdAt: 2 }),
      entry({ id: '3', peerId: 'alice', text: 'c', createdAt: 3 }),
    ];
    expect(listOutboxForPeer(queue, 'alice')).toEqual([
      entry({ id: '1', peerId: 'alice', text: 'a', createdAt: 1 }),
      entry({ id: '3', peerId: 'alice', text: 'c', createdAt: 3 }),
    ]);
    expect(listOutboxForPeer(queue, 'nobody')).toEqual([]);
  });

  it('removeOutbox drops by id and leaves order of remaining entries', () => {
    const queue: OutboxEntry[] = [
      entry({ id: '1', peerId: 'p', text: 'one', createdAt: 1 }),
      entry({ id: '2', peerId: 'p', text: 'two', createdAt: 2 }),
      entry({ id: '3', peerId: 'p', text: 'three', createdAt: 3 }),
    ];
    const result = removeOutbox(queue, '2');

    expect(result).toEqual([
      entry({ id: '1', peerId: 'p', text: 'one', createdAt: 1 }),
      entry({ id: '3', peerId: 'p', text: 'three', createdAt: 3 }),
    ]);
    expect(result).not.toBe(queue);
    expect(queue).toHaveLength(3);
  });

  it('removeOutbox returns a copy when id is missing', () => {
    const queue: OutboxEntry[] = [
      entry({ id: '1', peerId: 'p', text: 'one', createdAt: 1 }),
    ];
    const result = removeOutbox(queue, 'missing');
    expect(result).toEqual(queue);
    expect(result).not.toBe(queue);
  });

  it('does not mutate the input queue on list', () => {
    const queue: OutboxEntry[] = [
      entry({ id: '1', peerId: 'p', text: 'x', createdAt: 1 }),
    ];
    const snapshot = [...queue];
    listOutboxForPeer(queue, 'p');
    expect(queue).toEqual(snapshot);
  });

  it('preserves optional ephemeral flag on entries', () => {
    const queue = enqueueOutbox([], entry({ id: 'e', peerId: 'p', text: 'hi', ephemeral: true }));
    expect(queue[0].ephemeral).toBe(true);
  });
});
