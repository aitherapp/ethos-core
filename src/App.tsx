import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
// AnimatePresence types aren't re-exported from motion/react; import from framer-motion directly
import { AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Send, 
  User, 
  Terminal, 
  Lock, 
  Clock, 
  Paperclip,
  Trash2,
  Search,
  Smile,
  File as FileIcon,
  Download,
  Key,
  Users,
  Plus,
  Upload,
  Clipboard,
  Info,
  Menu,
  Network
} from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { iroh } from './lib/iroh';
import { exportIdentity } from './lib/crypto';
import { diagnosticsLog, installDiagnosticsConsoleCapture, DiagnosticEntry } from './lib/diagnostics';
import { IndexedDbMessageHistoryStore, loadEncryptedMessageHistory, saveEncryptedMessageHistory } from './lib/messageHistory';
import { getMobileNavItems, MobileNavItemId } from './lib/mobileNav';
import { removePeerFromList } from './lib/peerList';
import { isNearScrollBottom } from './lib/chatScroll';
import { ETHOS_MONERO_DONATION_ADDRESS, getMoneroDonationUri } from './lib/donations';
import { validateHistoryPassphrase } from './lib/historyLock';
import { getUnverifiedDiscoveryWarning, isDirectPeerTicket } from './lib/discovery';
import { buildNetworkDiagnostics } from './lib/networkDiagnostics';
import { SecureMessage, Identity, FileTransfer, Group } from './types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import {
  ICE_SERVER_PRESETS,
  isValidUserIceServer,
  type UserIceServer,
} from './lib/iceServers';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function mergeMessagesById(existing: SecureMessage[], saved: SecureMessage[]) {
  return Array.from(new Map([...saved, ...existing].map(message => [message.id, message])).values())
    .sort((a, b) => a.timestamp - b.timestamp);
}

const playNote = (freq: number, duration: number, type: OscillatorType = 'sine') => {
  const ctx = typeof window !== 'undefined' ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
};

const playSendSound = () => playNote(800, 0.1);
const playReceiveSound = () => playNote(600, 0.15);

// Keep in sync with CACHE_NAME in public/sw.js when busting caches
const APP_VERSION = '3.1.73';

const ABOUT_CHANGELOG = [
  {
    version: '3.1.73',
    title: 'Weekly Canary Update',
    date: '2026-09-01',
    changes: ['Updated the weekly canary statement and refreshed app cache.'],
  },
  {
    version: '3.1.72',
    title: 'Weekly Canary Update',
    date: '2026-08-25',
    changes: ['Updated the weekly canary statement and refreshed app cache.'],
  },
  {
    version: '3.1.71',
    title: 'Weekly Canary Update',
    date: '2026-08-17',
    changes: [
      'Updated the weekly canary statement and refreshed app cache.',
    ],
  },
  {
    version: '3.1.70',
    title: 'Security Update',
    date: '2026-08-10',
    changes: [
      'Applied security patch for postcss.',
    ],
  },
  {
    version: '3.1.69',
    title: 'Weekly Canary Update',
    date: '2026-08-10',
    changes: [
      'Updated the weekly canary statement and refreshed app cache.',
    ],
  },
  {
    version: '3.1.68',
    title: 'Canary Update',
    date: '2026-08-03',
    changes: [
      'Updated the public warrant canary to the current weekly statement date.',
      'Updated canary expiry date to 2026-08-10.',
      'Bumped the app and service-worker cache version so browsers fetch the refreshed canary.',
    ],
  },
  {
    version: '3.1.67',
    title: 'Security: PostCSS Path Traversal Fix',
    date: '2026-07-27',
    changes: [
      'Pin transitive postcss to 8.5.18 to close CVE path-traversal via sourceMappingURL.',
      'Keep weekly canary dates fresh and cache-busting aligned.',
    ],
  },
  {
    version: '3.1.66',
    title: 'Canary Update',
    date: '2026-07-27',
    changes: [
      'Updated the public warrant canary to the current weekly statement date.',
      'Updated canary expiry date to 2026-08-03.',
      'Bumped the app and service-worker cache version so browsers fetch the refreshed canary.',
    ],
  },
  {
    version: '3.1.65',
    title: 'Keyboard-Safe Mobile Input Bar',
    date: '2026-07-21',
    changes: [
      'Pin the footer to the viewport bottom when the iOS keyboard opens.',
      'Add keyboard-safe bottom padding in the chat area so messages are never hidden behind the input bar.',
    ],
  },
  {
    version: '3.1.64',
    title: 'Mobile Input Bar Fix',
    date: '2026-07-21',
    changes: [
      'Keeps the send button fully visible inside the mobile viewport so it no longer overflows the right edge.',
      'Accounts for the mobile safe area and viewport chrome while typing, so the input bar stays reachable.',
    ],
  },
  {
    version: '3.1.62',
    title: 'Canary Update',
    date: '2026-07-16',
    changes: [
      'Updated the public warrant canary to the current weekly statement date.',
      'Updated canary expiry date to 2026-07-23.',
    ],
  },
  {
    version: '3.1.61',
    title: 'Canary Refresh & Release Sync',
    date: '2026-07-07',
    changes: [
      'Updated the public warrant canary to the current weekly statement date.',
      'Merged latest staging features into the main production branch and bumped version for cache busting.',
    ],
  },
  {
    version: '3.1.60',
    title: 'Mobile Menu Tap Fix',
    date: '2026-07-03',
    changes: [
      'Keeps the hamburger dropdown above the mobile panel overlay so menu links remain tappable.',
    ],
  },
  {
    version: '3.1.59',
    title: 'Compact Mobile Header',
    date: '2026-07-03',
    changes: [
      'Uses short transport labels on very small screens so the chat header no longer collides with security status.',
      'Keeps the full secure transport wording on wider screens.',
    ],
  },
  {
    version: '3.1.58',
    title: 'Mobile Panel Polish',
    date: '2026-07-03',
    changes: [
      'Made the mobile Network Diagnostics panel scroll within the phone viewport.',
      'Removed the duplicate secure transport badge from the chat header and tightened mobile spacing.',
    ],
  },
  {
    version: '3.1.57',
    title: 'Real Network Diagnostics',
    date: '2026-07-03',
    changes: [
      'Replaced decorative document-sync copy with real relay, peer, transport, transfer, and diagnostic-log data.',
      'Improved the mobile hamburger menu surface so links appear in the foreground with larger click targets.',
    ],
  },
  {
    version: '3.1.56',
    title: 'Secure Relay Mode',
    date: '2026-07-03',
    changes: [
      'Separated encrypted relay data from signaling so fallback chat has its own Nostr transport path.',
      'Added replay-resistant relay envelopes, relay key confirmation, and session-bound relay key context.',
      'Updated the main UI to show secure direct tunnel and secure relay mode instead of protocol-heavy labels.',
    ],
  },
  {
    version: '3.1.55',
    title: 'Staging Release Flow',
    date: '2026-07-03',
    changes: [
      'Added a separate staging deployment path so new builds can be tested before production promotion.',
      'Changed production deployment to run only from explicit release promotion instead of every main branch push.',
      'Updated the reliable transport roadmap to reflect completed Phase 1 and Phase 2 work.',
    ],
  },
  {
    version: '3.1.54',
    title: 'Public Source Trust Copy',
    date: '2026-07-02',
    changes: [
      'Updated landing page and canary policy copy so verification points to the public GitHub repository.',
      'Removed outdated language that implied only supporters could inspect source or reproduce builds.',
    ],
  },
  {
    version: '3.1.53',
    title: 'Production TURN Configuration',
    date: '2026-07-02',
    changes: [
      'Added ICE/TURN server settings with provider presets, local persistence, and ICE candidate testing.',
      'Direct WebRTC tunnels now prefer user TURN servers before hosted and demo fallbacks.',
      'Documented ICE/TURN setup and troubleshooting in the README.',
    ],
  },
  {
    version: '3.1.52',
    title: 'Canary Date Refresh',
    date: '2026-07-02',
    changes: [
      'Updated the public warrant canary to the current weekly statement date.',
      'Noted GitHub artifact attestation verification in the public canary text.',
      'Bumped the app and service-worker cache version so browsers fetch the refreshed canary.',
    ],
  },
  {
    version: '3.1.51',
    title: 'GitHub Artifact Attestations',
    date: '2026-07-01',
    changes: [
      'Enabled signed GitHub artifact attestations in the public release workflow.',
      'Linked attestation metadata from release-manifest.json for deployed builds.',
      'Updated reproducible-build guidance with gh attestation verify steps.',
    ],
  },
  {
    version: '3.1.50',
    title: 'Open Source Release',
    date: '2026-07-01',
    changes: [
      'Published ETHOS Core source on GitHub under AGPL-3.0.',
      'Updated public trust docs and in-app support copy for the open repository.',
      'Removed leftover AI Studio scaffolding and unused dependencies.',
    ],
  },
  {
    version: '3.1.49',
    title: 'Canary Verification Steps',
    date: '2026-06-25',
    changes: [
      'Added SHA-256 verification instructions directly to the public warrant canary.',
      'Bumped the app and service-worker cache version so browsers fetch the updated canary text.',
    ],
  },
  {
    version: '3.1.48',
    title: 'Canary Date Refresh',
    date: '2026-06-25',
    changes: [
      'Updated the public warrant canary to the current weekly statement date.',
      'Bumped the app and service-worker cache version so browsers fetch the refreshed canary.',
    ],
  },
  {
    version: '3.1.47',
    title: 'Private Repo Deploy Fix',
    date: '2026-06-14',
    changes: [
      'Skipped GitHub artifact attestation on private source repositories where GitHub does not support it.',
      'Clarified that SHA-256 release receipts are the active verification path until attestations are available.',
    ],
  },
  {
    version: '3.1.46',
    title: 'Transparency Receipts',
    date: '2026-06-14',
    changes: [
      'Added public trust artifacts, release receipts, and verification links for ETHOS transparency.',
      'Bumped the app and service-worker cache version so browsers fetch the new transparency release.',
    ],
  },
  {
    version: '3.1.45',
    title: 'Landing Slogan Cleanup',
    date: '2026-06-14',
    changes: [
      'Updated the landing-page slogan to Secure peer-to-peer messaging for clearer public wording.',
    ],
  },
  {
    version: '3.1.44',
    title: 'Security Hardening',
    date: '2026-06-14',
    changes: [
      'Bound peer identities to handshake keys, limited inbound file transfers, strengthened history locks, and made name discovery explicitly unverified.',
      'Redacted relationship metadata from diagnostics exports by default.',
    ],
  },
  {
    version: '3.1.43',
    title: 'Landing Page Comparison',
    date: '2026-06-14',
    changes: [
      'Added a public ETHOS, Signal, and WhatsApp comparison section to the landing page.',
    ],
  },
  {
    version: '3.1.42',
    title: 'Landing Copy Cleanup',
    date: '2026-06-14',
    changes: [
      'Replaced the awkward central-server slogan with clearer no-signup wording.',
    ],
  },
  {
    version: '3.1.41',
    title: 'Public Landing Page',
    date: '2026-06-14',
    changes: [
      'Added a public SEO landing page while keeping the app available at #app.',
    ],
  },
  {
    version: '3.1.40',
    title: 'Donation Action Cleanup',
    date: '2026-06-14',
    changes: [
      'Removed the Monero wallet-opening button because desktop browsers may not have a monero: handler installed.',
    ],
  },
  {
    version: '3.1.39',
    title: 'Local ETHOS App Icon',
    date: '2026-06-14',
    changes: [
      'Replaced external placeholder app icons with a local ETHOS logo asset.',
    ],
  },
  {
    version: '3.1.38',
    title: 'Monero Support Donations',
    date: '2026-06-14',
    changes: [
      'Added a Monero-only donation card with the official ETHOS support address and copy actions.',
    ],
  },
  {
    version: '3.1.37',
    title: 'ETHOS Branding Cleanup',
    date: '2026-06-14',
    changes: [
      'Replaced old user-facing Iroh wording with ETHOS tunnel and peer-ticket language.',
    ],
  },
  {
    version: '3.1.36',
    title: 'Styled Group Delete Confirmation',
    date: '2026-06-14',
    changes: [
      'Replaced the browser-native group deletion popup with an ETHOS-styled confirmation modal.',
    ],
  },
  {
    version: '3.1.35',
    title: 'Reliable Group Chat',
    date: '2026-06-14',
    changes: [
      'Group invites and messages now use the same encrypted WebRTC-or-secure-relay path as one-to-one chat.',
      'Groups are saved in encrypted IndexedDB storage and owners can delete a group for every member.',
    ],
  },
  {
    version: '3.1.34',
    title: 'In-App Changelog',
    date: '2026-06-13',
    changes: [
      'Added this readable changelog to About so users can see what changed without visiting GitHub.',
    ],
  },
  {
    version: '3.1.33',
    title: 'Relay Resync & Chat Scroll Fixes',
    date: '2026-06-13',
    changes: [
      'Fresh secure relay handshake when a peer asks to resync, even if stale browser state says an old relay is connected.',
      'Chat no longer forces itself to the newest message while you scroll up to read older messages.',
    ],
  },
  {
    version: '3.1.32',
    title: 'Reliable Image/File Reassembly',
    date: '2026-06-13',
    changes: [
      'Encrypted relay file chunks are reassembled by byte offset so out-of-order or duplicate relay delivery should not corrupt images.',
    ],
  },
  {
    version: '3.1.31',
    title: 'Secure Relay Session Alignment',
    date: '2026-06-13',
    changes: [
      'Relay messages are pinned to the established secure session to avoid silent drops when reconnect attempts overlap.',
    ],
  },
  {
    version: '3.1.30',
    title: 'Encrypted Peer Display Metadata',
    date: '2026-06-13',
    changes: [
      'Peer display names moved from plaintext browser storage into encrypted IndexedDB storage.',
    ],
  },
  {
    version: '3.1.23',
    title: 'About, Trust, and Local Data',
    date: '2026-06-12',
    changes: [
      'Added the About section with clear security, reliability, local-data, and support information.',
      'Documented hybrid quantum-safe encryption in user-facing language.',
    ],
  },
];

installDiagnosticsConsoleCapture();

export default function App() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [messages, setMessages] = useState<SecureMessage[]>([]);
  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [peers, setPeers] = useState<string[]>([]);
  const [knownPeers, setKnownPeers] = useState<string[]>([]);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [newPeerId, setNewPeerId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [isEphemeral, setIsEphemeral] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'peers' | 'chat' | 'metrics'>('chat');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tempName, setTempName] = useState('');
  const [relays, setRelays] = useState<string[]>([]);
  const [newRelay, setNewRelay] = useState('');
  const [iceServers, setIceServers] = useState<UserIceServer[]>([]);
  const [iceDraft, setIceDraft] = useState({
    label: '',
    urls: '',
    username: '',
    credential: '',
  });
  const [iceTestMessage, setIceTestMessage] = useState<string | null>(null);
  const [isIceTesting, setIsIceTesting] = useState(false);
  const [showAddPeer, setShowAddPeer] = useState(false);
  const [unverifiedDiscovery, setUnverifiedDiscovery] = useState<{ name: string; peerId: string } | null>(null);
  const [status, setStatus] = useState<{ type: 'info' | 'error' | 'warning', message: string } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [signalMeshCount, setSignalMeshCount] = useState(0);
  const [diagnosticEntries, setDiagnosticEntries] = useState<DiagnosticEntry[]>(() => diagnosticsLog.getEntries());
  const [historyLockEnabled, setHistoryLockEnabled] = useState(false);
  const [isHistoryUnlocked, setIsHistoryUnlocked] = useState(true);
  const [historyPassphrase, setHistoryPassphrase] = useState('');
  
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<Group | null>(null);
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
}
