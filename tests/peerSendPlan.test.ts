import { describe, expect, it } from 'vitest';
import { planPeerSendAction } from '../src/lib/peerSendPlan';

describe('planPeerSendAction', () => {
  it('sends immediately when transport is usable', () => {
    expect(
      planPeerSendAction({ transportUsable: true, hasPushProfile: false }),
    ).toEqual({ action: 'send-now' });
    expect(
      planPeerSendAction({ transportUsable: true, hasPushProfile: true }),
    ).toEqual({ action: 'send-now' });
  });

  it('wakes and waits when transport is unusable but push profile exists', () => {
    expect(
      planPeerSendAction({ transportUsable: false, hasPushProfile: true }),
    ).toEqual({ action: 'wake-and-wait' });
  });

  it('queues when transport is unusable and there is no push profile', () => {
    expect(
      planPeerSendAction({ transportUsable: false, hasPushProfile: false }),
    ).toEqual({ action: 'queue' });
  });
});
