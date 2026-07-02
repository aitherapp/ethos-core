import { Group } from '../types';

export function normalizeGroupMembers(members: string[], ownerId: string) {
  return [...new Set([...members, ownerId].filter(Boolean))];
}

export function canDeleteGroupForEveryone(group: Pick<Group, 'ownerId'> | undefined, peerId: string | undefined) {
  return !!group && !!peerId && group.ownerId === peerId;
}

export function removeGroupFromList(groups: Group[], groupId: string) {
  return groups.filter(group => group.id !== groupId);
}
