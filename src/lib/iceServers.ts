export const ICE_SERVERS_STORAGE_KEY = 'nexus_ice_servers';

export type UserIceServer = {
  id: string;
  urls: string;
  username?: string;
  credential?: string;
  label?: string;
};

export type IceServerPreset = {
  id: string;
  label: string;
  description: string;
  urls: string;
  username?: string;
  credential?: string;
  requiresCredentials: boolean;
};

export type TurnEnv = {
  urls?: string;
  username?: string;
  credential?: string;
};

export type IceServerLayer = 'user' | 'hosted' | 'stun' | 'demo';

export type ResolvedIceServer = RTCIceServer & {
  layer: IceServerLayer;
  label?: string;
};

export type IceCandidateSummary = {
  host: number;
  srflx: number;
  relay: number;
  total: number;
};

export const ICE_SERVER_PRESETS: IceServerPreset[] = [
  {
    id: 'metered',
    label: 'Metered.ca',
    description: 'Paste your Metered TURN URLs and API credentials from the dashboard.',
    urls: '',
    requiresCredentials: true,
  },
  {
    id: 'twilio',
    label: 'Twilio Network Traversal',
    description: 'Use the TURN URI, username, and credential from Twilio Network Traversal.',
    urls: '',
    requiresCredentials: true,
  },
  {
    id: 'xirsys',
    label: 'Xirsys',
    description: 'Paste the comma-separated URLs plus username and credential from Xirsys.',
    urls: '',
    requiresCredentials: true,
  },
  {
    id: 'coturn',
    label: 'Self-hosted coturn',
    description: 'Example: turn:turn.example.com:3478 and optional turns: URL with your coturn credentials.',
    urls: 'turn:turn.example.com:3478',
    requiresCredentials: true,
  },
  {
    id: 'metered-openrelay-demo',
    label: 'Metered Open Relay (demo)',
    description: 'Shared public credentials. Best-effort only — not for production traffic.',
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:80?transport=tcp',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ].join(','),
    username: 'openrelayproject',
    credential: 'openrelayproject',
    requiresCredentials: false,
  },
];

const BUNDLED_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:stun.services.mozilla.com',
];

const DEMO_TURN_URLS = [
  'turn:openrelay.metered.ca:80',
  'turn:openrelay.metered.ca:80?transport=tcp',
  'turn:openrelay.metered.ca:443',
  'turn:openrelay.metered.ca:443?transport=tcp',
  'turns:openrelay.metered.ca:443?transport=tcp',
];

export function parseIceUrls(urls: string) {
  return urls
    .split(/[\n,]/)
    .map(url => url.trim())
    .filter(Boolean);
}

export function isValidIceUrl(url: string) {
  return /^(stun|turn|turns):/i.test(url);
}

export function isValidUserIceServer(entry: Pick<UserIceServer, 'urls'>) {
  const urls = parseIceUrls(entry.urls);
  return urls.length > 0 && urls.every(isValidIceUrl);
}

export function userIceServerToRtc(entry: UserIceServer): RTCIceServer {
  const urls = parseIceUrls(entry.urls);
  const server: RTCIceServer = { urls };
  if (entry.username?.trim()) server.username = entry.username.trim();
  if (entry.credential?.trim()) server.credential = entry.credential.trim();
  return server;
}

export function loadUserIceServers(
  storage?: Pick<Storage, 'getItem'>,
): UserIceServer[] {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  const raw = store?.getItem(ICE_SERVERS_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is UserIceServer => (
        entry
        && typeof entry.id === 'string'
        && typeof entry.urls === 'string'
        && isValidUserIceServer(entry)
      ));
  } catch {
    return [];
  }
}

export function saveUserIceServers(
  servers: UserIceServer[],
  storage?: Pick<Storage, 'setItem'>,
) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  store?.setItem(ICE_SERVERS_STORAGE_KEY, JSON.stringify(servers));
}

export function clearUserIceServers(
  storage?: Pick<Storage, 'removeItem'>,
) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  store?.removeItem(ICE_SERVERS_STORAGE_KEY);
}

export function readTurnEnv(
  env: Record<string, string | boolean | undefined> = typeof import.meta !== 'undefined' ? import.meta.env : {},
): TurnEnv {
  return {
    urls: typeof env.VITE_TURN_URLS === 'string' ? env.VITE_TURN_URLS : undefined,
    username: typeof env.VITE_TURN_USERNAME === 'string' ? env.VITE_TURN_USERNAME : undefined,
    credential: typeof env.VITE_TURN_CREDENTIAL === 'string' ? env.VITE_TURN_CREDENTIAL : undefined,
  };
}

function urlsAlreadyPresent(urls: string[], seen: Set<string>) {
  return urls.every(url => seen.has(url));
}

function markUrls(urls: string | string[], seen: Set<string>) {
  const list = Array.isArray(urls) ? urls : parseIceUrls(urls);
  list.forEach(url => seen.add(url));
  return list;
}

export function buildIceServers(
  userServers: UserIceServer[] = [],
  turnEnv: TurnEnv = readTurnEnv(),
): ResolvedIceServer[] {
  const resolved: ResolvedIceServer[] = [];
  const seen = new Set<string>();

  for (const entry of userServers) {
    const urls = markUrls(entry.urls, seen);
    resolved.push({
      ...userIceServerToRtc(entry),
      urls,
      layer: 'user',
      label: entry.label,
    });
  }

  const hostedUrls = parseIceUrls(turnEnv.urls ?? '');
  if (hostedUrls.length > 0 && !urlsAlreadyPresent(hostedUrls, seen)) {
    markUrls(hostedUrls, seen);
    resolved.push({
      urls: hostedUrls,
      ...(turnEnv.username ? { username: turnEnv.username } : {}),
      ...(turnEnv.credential ? { credential: turnEnv.credential } : {}),
      layer: 'hosted',
      label: 'Hosted deployment TURN',
    });
  }

  const stunUrls = BUNDLED_STUN_URLS.filter(url => !seen.has(url));
  if (stunUrls.length > 0) {
    markUrls(stunUrls, seen);
    resolved.push({
      urls: stunUrls,
      layer: 'stun',
      label: 'Public STUN fallback',
    });
  }

  if (!hostedUrls.length && !userServers.some(entry => parseIceUrls(entry.urls).some(url => /^(turn|turns):/i.test(url)))) {
    const demoUrls = DEMO_TURN_URLS.filter(url => !seen.has(url));
    if (demoUrls.length > 0) {
      markUrls(demoUrls, seen);
      resolved.push({
        urls: demoUrls,
        username: turnEnv.username || 'openrelayproject',
        credential: turnEnv.credential || 'openrelayproject',
        layer: 'demo',
        label: 'Demo TURN (best-effort)',
      });
    }
  }

  return resolved;
}

export function summarizeIceCandidates(candidates: string[]): IceCandidateSummary {
  const summary = { host: 0, srflx: 0, relay: 0, total: 0 };

  for (const candidate of candidates) {
    summary.total += 1;
    if (/\btyp relay\b/i.test(candidate)) summary.relay += 1;
    else if (/\btyp srflx\b/i.test(candidate)) summary.srflx += 1;
    else if (/\btyp host\b/i.test(candidate)) summary.host += 1;
  }

  return summary;
}

export function formatIceTestResult(summary: IceCandidateSummary) {
  if (summary.total === 0) {
    return 'No ICE candidates gathered. Check URLs, credentials, and network restrictions.';
  }

  const parts = [
    `${summary.host} host`,
    `${summary.srflx} srflx`,
    `${summary.relay} relay`,
  ];

  if (summary.relay > 0) {
    return `ICE test passed: ${parts.join(', ')}. Relay candidates are available.`;
  }

  return `ICE test partial: ${parts.join(', ')}. No relay candidate yet — direct paths may work, but restrictive NATs may still need TURN.`;
}

export async function gatherIceCandidates(
  iceServers: RTCIceServer[],
  timeoutMs = 8000,
): Promise<{ summary: IceCandidateSummary; candidates: string[] }> {
  if (typeof RTCPeerConnection === 'undefined') {
    throw new Error('ICE testing requires a browser WebRTC environment.');
  }

  const pc = new RTCPeerConnection({ iceServers });
  const candidates: string[] = [];

  try {
    const summary = await new Promise<IceCandidateSummary>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        resolve(summarizeIceCandidates(candidates));
      }, timeoutMs);

      pc.onicecandidate = (event) => {
        if (event.candidate?.candidate) {
          candidates.push(event.candidate.candidate);
          return;
        }

        window.clearTimeout(timer);
        resolve(summarizeIceCandidates(candidates));
      };

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          window.clearTimeout(timer);
          resolve(summarizeIceCandidates(candidates));
        }
      };

      pc.createDataChannel('ethos-ice-test');
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .catch(reject);
    });

    return { summary, candidates };
  } finally {
    pc.close();
  }
}

export async function testIceConfiguration(
  userServers: UserIceServer[] = loadUserIceServers(),
  turnEnv: TurnEnv = readTurnEnv(),
  timeoutMs = 8000,
) {
  const iceServers = buildIceServers(userServers, turnEnv).map(({ layer, label, ...server }) => server);
  const { summary } = await gatherIceCandidates(iceServers, timeoutMs);
  return {
    summary,
    message: formatIceTestResult(summary),
    hasRelayCandidate: summary.relay > 0,
  };
}
