import { describe, expect, it } from 'vitest';
import { canDeleteGroupForEveryone, normalizeGroupMembers, removeGroupFromList } from '../src/lib/groups';

describe('group helpers', () => {
  it('keeps group members unique and includes the owner', () => {
    expect(normalizeGroupMembers(['peer-1', 'peer-1', 'peer-2'], 'owner')).toEqual(['peer-1', 'peer-2', 'owner']);
  });

  it('only lets the group owner delete for everyone', () => {
    const group = {
      id: 'group-1',
      name: 'Team',
      members: ['owner', 'peer-1'],
      ownerId: 'owner',
      createdAt: 100,
      updatedAt: 100,
    };

    expect(canDeleteGroupForEveryone(group, 'owner')).toBe(true);
    expect(canDeleteGroupForEveryone(group, 'peer-1')).toBe(false);
  });

  it('removes a group from the local list', () => {
    expect(removeGroupFromList([
      { id: 'group-1', name: 'One', members: ['owner'], ownerId: 'owner', createdAt: 100, updatedAt: 100 },
      { id: 'group-2', name: 'Two', members: ['owner'], ownerId: 'owner', createdAt: 101, updatedAt: 101 },
    ], 'group-1')).toEqual([
      { id: 'group-2', name: 'Two', members: ['owner'], ownerId: 'owner', createdAt: 101, updatedAt: 101 },
    ]);
  });
});
