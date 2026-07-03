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
const APP_VERSION = '3.1.60';

const ABOUT_CHANGELOG = [
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

  const allPersistedPeers = [...new Set([...peers, ...knownPeers])];
  const filteredPeers = allPersistedPeers.filter(id => 
    id.toLowerCase().includes(searchQuery.toLowerCase()) || 
    iroh.getPeerName(id)?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageHistoryStoreRef = useRef(new IndexedDbMessageHistoryStore());
  const messageHistoryContextRef = useRef<{ identityMaterial: string; nodeId: string; lockSecret?: string } | null>(null);
  const isMessageHistoryReadyRef = useRef(false);

  useEffect(() => {
    const init = async () => {
      let name = localStorage.getItem('nexus_name');
      if (!name) {
        name = `Node_${Math.floor(Math.random() * 999)}`;
        localStorage.setItem('nexus_name', name);
      }
      await iroh.initialize(name);
      const currentIdentity = iroh.getIdentity();
      setIdentity(currentIdentity);
      setGroups(iroh.getGroups());

      const quantumIdentity = iroh.getQuantumIdentity();
      if (currentIdentity && quantumIdentity) {
        const identityMaterial = await exportIdentity(quantumIdentity);
        const isLocked = localStorage.getItem(`ethos_history_locked_${currentIdentity.id}`) === '1';
        const historyContext = {
          identityMaterial,
          nodeId: currentIdentity.id,
        };
        messageHistoryContextRef.current = historyContext;
        setHistoryLockEnabled(isLocked);
        setIsHistoryUnlocked(!isLocked);

        if (!isLocked) {
          const savedMessages = await loadEncryptedMessageHistory({
            store: messageHistoryStoreRef.current,
            ...historyContext,
          });
          setMessages(savedMessages ?? []);
        }
      }
      isMessageHistoryReadyRef.current = true;
      
      const savedPeers = localStorage.getItem('nexus_peer_list');
      if (savedPeers) {
        try {
          setKnownPeers(JSON.parse(savedPeers));
        } catch (e) {}
      }
      
      iroh.onSignalStatus((count) => {
        setSignalMeshCount(count);
      });
      
      setIsInitialized(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!isMessageHistoryReadyRef.current || !messageHistoryContextRef.current) return;
    if (historyLockEnabled && !isHistoryUnlocked) return;

    saveEncryptedMessageHistory({
      store: messageHistoryStoreRef.current,
      ...messageHistoryContextRef.current,
      messages,
    }).catch(err => {
      console.warn('[Storage] Failed to persist encrypted message history:', err);
    });
  }, [messages, historyLockEnabled, isHistoryUnlocked]);

  useEffect(() => {
    return diagnosticsLog.subscribe(() => {
      setDiagnosticEntries(diagnosticsLog.getEntries());
    });
  }, []);

  useEffect(() => {
    iroh.onMessage((msg) => {
      if (msg.type === 'reaction') {
        setMessages(prev => prev.map(m => {
          if (m.id === msg.targetMessageId) {
            const reactions = { ...m.reactions };
            const users = reactions[msg.content] || [];
            if (!users.includes(msg.senderId)) {
              reactions[msg.content] = [...users, msg.senderId];
            }
            return { ...m, reactions };
          }
          return m;
        }));
      } else {
        setMessages(prev => [...prev, msg]);
      }
      
      setPeers(prev => prev.includes(msg.senderId) ? prev : [...prev, msg.senderId]);
      if (msg.senderId !== identity?.id) playReceiveSound();
      setKnownPeers(prev => {
        if (!prev.includes(msg.senderId)) {
          const next = [...prev, msg.senderId];
          localStorage.setItem('nexus_peer_list', JSON.stringify(next));
          return next;
        }
        return prev;
      });
    });

    iroh.onTransferUpdate((newTransfers) => {
      setTransfers(newTransfers);
    });

    iroh.onGroupUpdate((newGroups) => {
      setGroups(newGroups);
    });

    iroh.onStatus((type, message) => {
      setStatus({ type, message });
      if (type === 'error') setIsConnecting(false);
      if (
        message.includes('Secure direct tunnel') ||
        message.includes('Secure relay mode') ||
        message.includes('Tunnel Established') ||
        message.includes('Secure Relay Ready')
      ) setIsConnecting(false);

      setTimeout(() => setStatus(null), 5000);
    });

    const interval = setInterval(() => {
      setPeers(iroh.getConnectedPeers());
      // Keep the sidebar populated without treating visible peers as connected.
      setKnownPeers(prev => {
        const failed = iroh.getFailedPeers();
        const visible = iroh.getVisiblePeers();
        const next = [...new Set([...prev, ...visible, ...failed])];
        if (next.length !== prev.length) {
          localStorage.setItem('nexus_peer_list', JSON.stringify(next));
        }
        return next;
      });
      setMessages(prev => prev.filter(m => !m.expiresAt || m.expiresAt > Date.now()));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const scrollChatToBottom = () => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  useEffect(() => {
    shouldAutoScrollRef.current = true;
    scrollChatToBottom();
  }, [activePeer, activeGroup]);

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollChatToBottom();
    }
  }, [messages]);

  const handleConnect = async () => {
    if (newPeerId.trim()) {
      setIsConnecting(true);
      const input = newPeerId.trim();
      
      let targetId = input;
      // Nexus Tickets (peer IDs) were 16 chars (v2.6) and are now 64 chars (v2.7+)
      const isTicket = isDirectPeerTicket(input);
      
      if (!isTicket) {
        setStatus({ type: 'info', message: `DHT Lookup: ${input}` });
        const resolved = await iroh.searchByName(input);
        if (resolved) {
          setUnverifiedDiscovery({ name: input, peerId: resolved });
          setStatus({ type: 'warning', message: 'Name discovery is unverified. Confirm the peer ticket before connecting.' });
          setIsConnecting(false);
          setShowAddPeer(false);
          return;
        } else {
          setStatus({ type: 'error', message: `Could not find node for: ${input}` });
          setIsConnecting(false);
          return;
        }
      }

      try {
        await iroh.connectByTicket(targetId);
        setNewPeerId('');
        setKnownPeers(prev => prev.includes(targetId) ? prev : [...prev, targetId]);
        setShowAddPeer(false);
        // Stay in connecting state until secure direct/relay mode or error status fires
      } catch (err) {
        console.error('Connection failed', err);
        setStatus({ type: 'error', message: 'Could not reach peer. Keep ETHOS open on both devices and verify the peer ticket.' });
        setIsConnecting(false);
      }
    }
  };

  const confirmUnverifiedDiscovery = async () => {
    if (!unverifiedDiscovery) return;
    const targetId = unverifiedDiscovery.peerId;
    setIsConnecting(true);

    try {
      await iroh.connectByTicket(targetId);
      setKnownPeers(prev => prev.includes(targetId) ? prev : [...prev, targetId]);
      setNewPeerId('');
      setUnverifiedDiscovery(null);
    } catch (err) {
      console.error('Connection failed', err);
      setStatus({ type: 'error', message: 'Could not reach peer. Keep ETHOS open on both devices and verify the peer ticket.' });
      setIsConnecting(false);
    }
  };

  const handleOpenSettings = () => {
    setTempName(identity?.displayName || '');
    setRelays(iroh.getRelays());
    setIceServers(iroh.getUserIceServers());
    setIceDraft({ label: '', urls: '', username: '', credential: '' });
    setIceTestMessage(null);
    setShowSettings(true);
  };

  const handleMobileNavItem = (itemId: MobileNavItemId) => {
    setShowMobileMenu(false);

    if (itemId === 'metrics') {
      setMobilePanel(mobilePanel === 'metrics' ? 'chat' : 'metrics');
      return;
    }

    if (itemId === 'about') {
      setShowAbout(true);
      return;
    }

    handleOpenSettings();
  };

  const handleAddRelay = () => {
    if (newRelay.trim() && !relays.includes(newRelay.trim())) {
      const newList = [...relays, newRelay.trim()];
      setRelays(newList);
      setNewRelay('');
    }
  };

  const handleRemoveRelay = (relay: string) => {
    if (relays.length <= 1) return;
    setRelays(relays.filter(r => r !== relay));
  };

  const handleApplyIcePreset = (presetId: string) => {
    const preset = ICE_SERVER_PRESETS.find(entry => entry.id === presetId);
    if (!preset) return;

    setIceDraft({
      label: preset.label,
      urls: preset.urls,
      username: preset.username ?? '',
      credential: preset.credential ?? '',
    });
    setIceTestMessage(null);
  };

  const handleAddIceServer = () => {
    const draft = {
      label: iceDraft.label.trim() || 'Custom ICE Server',
      urls: iceDraft.urls.trim(),
      username: iceDraft.username.trim(),
      credential: iceDraft.credential.trim(),
    };

    if (!isValidUserIceServer(draft)) {
      setStatus({ type: 'error', message: 'Enter valid stun:, turn:, or turns: URLs before saving an ICE server.' });
      return;
    }

    setIceServers(current => [
      ...current,
      {
        id: uuidv4(),
        ...draft,
        ...(draft.username ? { username: draft.username } : {}),
        ...(draft.credential ? { credential: draft.credential } : {}),
      },
    ]);
    setIceDraft({ label: '', urls: '', username: '', credential: '' });
    setIceTestMessage(null);
  };

  const handleRemoveIceServer = (serverId: string) => {
    setIceServers(current => current.filter(server => server.id !== serverId));
    setIceTestMessage(null);
  };

  const handleResetIceServers = () => {
    setIceServers([]);
    setIceDraft({ label: '', urls: '', username: '', credential: '' });
    setIceTestMessage(null);
  };

  const handleTestIceServers = async () => {
    setIsIceTesting(true);
    setIceTestMessage(null);

    try {
      const result = await iroh.testIceServers(iceServers);
      setIceTestMessage(result.message);
      setStatus({
        type: result.hasRelayCandidate ? 'info' : 'warning',
        message: result.hasRelayCandidate
          ? 'ICE test found relay candidates.'
          : 'ICE test completed without relay candidates.',
      });
    } catch (error: any) {
      const message = error?.message || 'ICE test failed.';
      setIceTestMessage(message);
      setStatus({ type: 'error', message });
    } finally {
      setIsIceTesting(false);
    }
  };

  const handleResetRelays = () => {
    iroh.resetRelays();
    setRelays(iroh.getRelays());
  };

  const handleCopyDiagnostics = async () => {
    const text = diagnosticsLog.exportText({
      appVersion: APP_VERSION,
      relayCount: iroh.getRelays().length,
      peerCount: iroh.getVisiblePeers().length,
    });

    try {
      await navigator.clipboard.writeText(text);
      setStatus({ type: 'info', message: 'Diagnostics copied to clipboard' });
    } catch {
      setStatus({ type: 'error', message: 'Could not copy diagnostics' });
    }
  };

  const handleCopyDonationText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus({ type: 'info', message: `${label} copied` });
    } catch {
      setStatus({ type: 'error', message: `Could not copy ${label.toLowerCase()}` });
    }
  };

  const handleClearDiagnostics = () => {
    diagnosticsLog.clear();
    setStatus({ type: 'info', message: 'Diagnostics cleared' });
  };

  const handleUnlockHistory = async () => {
    const context = messageHistoryContextRef.current;
    if (!context || !historyPassphrase.trim()) return;

    const savedMessages = await loadEncryptedMessageHistory({
      store: messageHistoryStoreRef.current,
      ...context,
      lockSecret: historyPassphrase,
    });
    if (!savedMessages) {
      setStatus({ type: 'error', message: 'Could not unlock history. Check passphrase.' });
      return;
    }

    context.lockSecret = historyPassphrase;
    setMessages(prev => mergeMessagesById(prev, savedMessages));
    setIsHistoryUnlocked(true);
    setHistoryPassphrase('');
    setStatus({ type: 'info', message: 'Encrypted history unlocked' });
  };

  const handleEnableHistoryLock = async () => {
    const context = messageHistoryContextRef.current;
    const passphrase = historyPassphrase.trim();
    if (!context) {
      setStatus({ type: 'warning', message: 'History is not ready yet.' });
      return;
    }

    const validation = validateHistoryPassphrase(passphrase);
    if (validation.ok === false) {
      setStatus({ type: 'warning', message: validation.message });
      return;
    }

    context.lockSecret = passphrase;
    localStorage.setItem(`ethos_history_locked_${context.nodeId}`, '1');
    await saveEncryptedMessageHistory({
      store: messageHistoryStoreRef.current,
      ...context,
      messages,
    });
    setHistoryLockEnabled(true);
    setIsHistoryUnlocked(true);
    setHistoryPassphrase('');
    setStatus({ type: 'info', message: 'Chat history lock enabled' });
  };

  const handleDisableHistoryLock = async () => {
    const context = messageHistoryContextRef.current;
    if (!context) return;

    delete context.lockSecret;
    localStorage.removeItem(`ethos_history_locked_${context.nodeId}`);
    await saveEncryptedMessageHistory({
      store: messageHistoryStoreRef.current,
      ...context,
      messages,
    });
    setHistoryLockEnabled(false);
    setIsHistoryUnlocked(true);
    setHistoryPassphrase('');
    setStatus({ type: 'info', message: 'Chat history lock disabled' });
  };

  const selectPeer = (peerId: string) => {
    setActivePeer(peerId);
    setActiveGroup(null);
    setMobilePanel('chat');
    
    // Auto-connect if not currently connected
    if (!peers.includes(peerId)) {
      iroh.notifyStatus('info', `Re-connecting to ${peerId.slice(0, 8)}...`);
      iroh.connectByTicket(peerId);
    }
  };

  const handleRemovePeer = (peerId: string) => {
    setKnownPeers(prev => {
      const next = removePeerFromList(prev, peerId);
      localStorage.setItem('nexus_peer_list', JSON.stringify(next));
      return next;
    });
    setPeers(prev => removePeerFromList(prev, peerId));

    if (activePeer === peerId) {
      setActivePeer(null);
      setInputText('');
    }

    setStatus({ type: 'info', message: `Removed Node_${peerId.slice(0, 4)} from peer list` });
    setTimeout(() => setStatus(null), 2000);
  };

  const handleBackupIdentity = async () => {
    const qId = iroh.getQuantumIdentity();
    if (qId) {
      const serialized = await exportIdentity(qId);
      const blob = new Blob([serialized], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nexus_identity_${identity?.id.slice(0, 8)}.key`;
      a.click();
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || isSending) return;

    setIsSending(true);

    if (activeGroup) {
      const sentMsg = await iroh.sendGroupMessage(activeGroup, text, { ephemeral: isEphemeral });
      if (sentMsg) {
        setMessages(prev => [...prev, sentMsg]);
        setInputText('');
        playSendSound();
      } else {
        iroh.notifyStatus('error', 'Failed to send group message.');
      }
    } else if (activePeer) {
      const sentMsg = await iroh.sendMessage(activePeer, text, { ephemeral: isEphemeral });
      if (sentMsg) {
        setMessages(prev => [...prev, sentMsg]);
        setInputText('');
        playSendSound();
      } else {
        const isSecure = iroh.isHandshakeComplete(activePeer);
        if (!isSecure) {
          iroh.notifyStatus('warning', 'Connecting securely... please wait.');
        } else {
          iroh.notifyStatus('error', 'Peer unavailable.');
        }
      }
    }
    setIsSending(false);
  };

  const handleFileShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activePeer) {
      await iroh.sendFile(activePeer, file);
    }
  };

  const handleCreateGroup = async () => {
    if (groupName.trim() && selectedPeers.length > 0) {
      const newGroup = await iroh.createGroup(groupName, selectedPeers);
      setGroupName('');
      setSelectedPeers([]);
      setShowCreateGroup(false);
      setActiveGroup(newGroup.id);
      setActivePeer(null);
    }
  };

  const handleDeleteGroup = async (group: Group) => {
    setGroupDeleteTarget(group);
  };

  const confirmDeleteGroup = async () => {
    if (!groupDeleteTarget) return;
    const group = groupDeleteTarget;
    const isOwner = identity?.id === group.ownerId;

    const deleted = await iroh.deleteGroup(group.id, { forEveryone: isOwner });
    if (deleted) {
      setGroups(iroh.getGroups());
      if (activeGroup === group.id) {
        setActiveGroup(null);
      }
    }
    setGroupDeleteTarget(null);
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!activePeer || activeGroup) return; // Currently 1-to-1 only
    const reactionMsg = await iroh.sendReaction(activePeer, messageId, emoji);
    if (reactionMsg) {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          const reactions = { ...m.reactions };
          const users = reactions[emoji] || [];
          if (!users.includes(identity?.id || '')) {
            reactions[emoji] = [...users, identity?.id || ''];
          }
          return { ...m, reactions };
        }
        return m;
      }));
    }
    setShowEmojiPicker(null);
  };

  const mobileNavItems = getMobileNavItems(mobilePanel);
  const networkDiagnostics = buildNetworkDiagnostics({
    relayCount: relays.length,
    activePeerCount: peers.length,
    transferCount: transfers.length,
    activeTransportLabel: activePeer ? iroh.getPeerTransportStatus(activePeer).label : undefined,
    recentEntries: diagnosticEntries,
  });

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-black">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Terminal className="w-12 h-12 text-brand animate-pulse" />
          <p className="text-brand font-mono text-sm tracking-widest uppercase">Initializing ETHOS Node...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg text-text-primary overflow-hidden font-sans">
      <input 
        type="file" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileShare}
      />
      {/* Top Navigation / Title Bar */}
      <nav className={cn(
        "relative h-12 bg-surface-rail border-b border-border flex items-center justify-between px-4 flex-shrink-0 z-20",
        showMobileMenu && "z-[130]"
      )}>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              setShowMobileMenu(false);
              setMobilePanel(mobilePanel === 'peers' ? 'chat' : 'peers');
            }}
            className="md:hidden p-1.5 hover:bg-white/5 rounded transition-colors"
          >
            <Search className="w-4 h-4 text-brand" />
          </button>
          <div className="w-3 h-3 bg-brand rounded-full shadow-[0_0_8px_#00FF41] hidden xs:block"></div>
          <span className="font-mono text-[10px] tracking-widest text-brand uppercase font-bold truncate max-w-[100px] xs:max-w-none underline decoration-brand/20 underline-offset-4">NODE_ACTIVE // PQ-TUNNEL</span>
        </div>
        <div className="flex items-center gap-2 xs:gap-6">
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-tighter opacity-50 font-bold">Node ID</span>
            <span className="font-mono text-xs text-text-secondary truncate max-w-[100px]">{identity?.id}</span>
          </div>
          <div className="relative md:hidden">
            <button
              onClick={() => setShowMobileMenu(prev => !prev)}
              className="min-h-10 min-w-10 p-2 hover:bg-brand/10 rounded-lg transition-colors border border-border bg-bg shadow-lg"
              aria-expanded={showMobileMenu}
              aria-haspopup="menu"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4 text-brand" />
            </button>
            {showMobileMenu && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className="fixed right-4 top-12 z-[120] w-60 rounded-xl border border-brand/20 bg-[#10141c] shadow-2xl shadow-black/80 overflow-hidden"
                role="menu"
              >
                {mobileNavItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleMobileNavItem(item.id)}
                    className="w-full min-h-11 px-4 py-3 text-left text-[11px] uppercase font-bold tracking-wider text-text hover:bg-brand/15 hover:text-brand transition-colors border-b border-border/70 last:border-b-0"
                    role="menuitem"
                  >
                    {item.label}
                  </button>
                ))}
              </motion.div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setShowAbout(true)}
              className="bg-border/60 hover:bg-gray-700 px-2 xs:px-3 py-1 rounded text-[10px] uppercase font-bold transition-colors"
            >
              About
            </button>
            <button 
              onClick={handleOpenSettings}
              className="bg-border hover:bg-gray-700 px-2 xs:px-3 py-1 rounded text-[10px] uppercase font-bold transition-colors"
            >
              Settings
            </button>
          </div>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar: Contacts & Channels */}
        <aside className={cn(
          "w-64 bg-surface-sidebar border-r border-border flex flex-col flex-shrink-0 transition-all duration-300 z-30",
          "absolute inset-y-0 left-0 md:relative md:translate-x-0 hidden md:flex",
          mobilePanel === 'peers' && "translate-x-0 flex !relative"
        )}>
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-brand/10 border border-brand/20 flex items-center justify-center">
                <User className="w-4 h-4 text-brand" />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <div className="text-[10px] font-bold text-brand uppercase truncate">{identity?.displayName}</div>
                  <span className="text-[8px] opacity-20 font-mono">v{APP_VERSION}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div 
                    className="text-[8px] opacity-30 font-mono cursor-pointer hover:opacity-100" 
                    onClick={() => {
                      navigator.clipboard.writeText(identity?.id || '');
                      setStatus({ type: 'info', message: 'Ticket copied to clipboard' });
                      setTimeout(() => setStatus(null), 2000);
                    }}
                    title="Click to copy your connection ticket"
                  >
                    {identity?.id.slice(0, 8)}...{identity?.id.slice(-4)}
                  </div>
                  <button 
                    onClick={() => iroh.reconnect()}
                    className="text-[8px] text-brand hover:underline p-0.5"
                    title="Reconnect to P2P network"
                  >
                    RECONNECT
                  </button>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(identity?.id || '');
                      setStatus({ type: 'info', message: 'Ticket copied to clipboard' });
                      setTimeout(() => setStatus(null), 2000);
                    }}
                    className="text-[8px] text-brand hover:underline p-0.5"
                  >
                    COPY
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[11px] font-bold uppercase tracking-widest opacity-40">Peers</h2>
              <button 
                onClick={() => setShowAddPeer(true)}
                className="text-brand hover:opacity-80 transition-opacity"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-1">
              <div className="relative mb-3">
                <input 
                  type="text" 
                  placeholder="Search tickets..."
                  className="w-full bg-bg border border-border rounded py-1.5 pl-3 pr-3 text-[10px] focus:border-brand/40 outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {filteredPeers.length === 0 && (
                <div className="py-8 text-center px-4">
                  <p className="text-[10px] text-text-secondary uppercase tracking-tight italic">
                    {searchQuery ? 'No matching peers' : 'No active ETHOS mesh. Connect to a peer ticket.'}
                  </p>
                </div>
              )}

              {filteredPeers.map(peerId => {
                const isFailed = iroh.getFailedPeers().includes(peerId);
                const transport = iroh.getPeerTransportStatus(peerId);
                return (
                  <div
                    key={peerId}
                    onClick={() => selectPeer(peerId)}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all group",
                      activePeer === peerId ? "bg-[#1C1F26] border-l-2 border-brand" : "hover:bg-surface-rail",
                      isFailed && "opacity-60"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded flex items-center justify-center font-bold text-[10px] border",
                      isFailed ? "bg-gray-900 border-red-900/50 text-red-500" : "bg-gradient-to-br from-gray-700 to-gray-900 border-border"
                    )}>
                      {peerId.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "text-xs font-semibold truncate group-hover:text-brand transition-colors",
                          isFailed && "text-red-400"
                        )}>
                          {iroh.getPeerName(peerId) || `Node_${peerId.slice(0, 4)}`}
                        </div>
                        <span className={cn(
                          'text-[7px] px-1 rounded border font-bold uppercase tracking-tighter',
                          transport.usable ? 'bg-brand/10 text-brand border-brand/20' :
                            transport.mode === 'connecting' ? 'text-orange-400 border-orange-400/20 animate-pulse' :
                              'text-red-500 border-red-500/20'
                        )}>
                          {transport.mode === 'direct' ? 'DIRECT' :
                            transport.mode === 'relay' ? 'RELAY' :
                              transport.mode === 'connecting' ? 'CONNECTING' : 'UNAVAILABLE'}
                        </span>
                      </div>
                      <div className="text-[10px] opacity-40 truncate font-mono">{peerId}</div>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemovePeer(peerId);
                      }}
                      className="p-1 rounded text-text-secondary/30 hover:text-red-400 hover:bg-red-500/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                      title="Remove peer from list"
                      aria-label="Remove peer from list"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {activePeer === peerId && <div className="w-1.5 h-1.5 bg-brand rounded-full"></div>}
                  </div>
                );
              })}
            </div>

            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[11px] font-bold uppercase tracking-widest opacity-40">Groups</h2>
                <button 
                  onClick={() => setShowCreateGroup(true)}
                  className="text-brand hover:opacity-80 transition-opacity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1">
                {groups.map(group => {
                  const isOwner = identity?.id === group.ownerId;

                  return (
                    <div
                      key={group.id}
                      onClick={() => {
                        setActiveGroup(group.id);
                        setActivePeer(null);
                      }}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all group",
                        activeGroup === group.id ? "bg-[#1C1F26] border-l-2 border-brand" : "hover:bg-surface-rail"
                      )}
                    >
                      <div className="w-8 h-8 rounded bg-brand/10 flex items-center justify-center border border-brand/20">
                        <Users className="w-4 h-4 text-brand" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="text-xs font-semibold truncate group-hover:text-brand transition-colors">{group.name}</div>
                        <div className="text-[10px] opacity-40 truncate">
                          {group.members.length} Members {isOwner ? '// Owner' : ''}
                        </div>
                      </div>
                      {activeGroup === group.id && <div className="w-1.5 h-1.5 bg-brand rounded-full"></div>}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDeleteGroup(group);
                        }}
                        className="p-1 rounded text-text-secondary/30 hover:text-red-400 hover:bg-red-500/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all"
                        title={isOwner ? 'Delete group for everyone' : 'Remove group locally'}
                        aria-label={isOwner ? 'Delete group for everyone' : 'Remove group locally'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
                {groups.length === 0 && (
                  <p className="text-[9px] opacity-30 italic text-center py-2 uppercase tracking-tighter">No active groups</p>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 flex-1 overflow-y-auto terminal-scroll">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-bold uppercase tracking-widest opacity-40">Payload Transfers</h2>
              {transfers.some(t => t.status === 'completed' || t.status === 'failed') && (
                <button 
                  onClick={() => iroh.clearCompletedTransfers()}
                  className="text-[8px] text-text-secondary hover:text-brand uppercase"
                >
                  Clear Done
                </button>
              )}
            </div>
            <div className="space-y-3">
              {transfers.map(t => (
                <div key={t.id} className="p-3 bg-surface-rail rounded border border-border">
                  <div className="flex justify-between text-[9px] mb-1 font-bold uppercase">
                    <span className="truncate max-w-[100px]">{t.name}</span>
                    <div className="flex items-center gap-2">
                      {t.status === 'completed' ? (
                        <span className="text-brand">DONE</span>
                      ) : t.status === 'failed' ? (
                        <span className="text-red-400">FAILED</span>
                      ) : (
                        <span className="text-blue-400">{Math.round((t.progress / t.size) * 100)}%</span>
                      )}
                      {(t.status === 'active' || t.status === 'failed') && (
                        <button 
                          onClick={() => iroh.abortTransfer(t.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Abort transfer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="w-full bg-bg h-1 rounded-full overflow-hidden mb-1">
                    <div 
                      className={cn(
                        "h-1 rounded-full transition-all duration-300", 
                        t.status === 'completed' ? 'bg-brand' : 
                        t.status === 'failed' ? 'bg-red-400' : 'bg-blue-400'
                      )}
                      style={{ width: `${(t.progress / t.size) * 100}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center text-[8px] opacity-40 uppercase tracking-tighter">
                    <div className="flex gap-2">
                       <span>{t.type}</span>
                       <span>{(t.size / 1024).toFixed(1)} KB</span>
                    </div>
                    {t.downloadUrl && (
                      <a 
                        href={t.downloadUrl} 
                        download={t.name}
                        className="text-brand hover:underline flex items-center gap-0.5"
                      >
                        <Download className="w-2 h-2" /> DL
                      </a>
                    )}
                  </div>
                </div>
              ))}
              {transfers.length === 0 && (
                <div className="p-2 opacity-40 grayscale italic text-[10px] text-center border border-dashed border-border rounded">
                  No active mesh uploads
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Chat Area */}
        <main className={cn(
          "flex-1 flex flex-col bg-bg relative overflow-hidden transition-opacity duration-300",
          mobilePanel !== 'chat' ? "opacity-30 pointer-events-none md:opacity-100 md:pointer-events-auto" : "opacity-100"
        )}>
          {mobilePanel !== 'chat' && (
            <div 
              className="absolute inset-0 z-40 md:hidden" 
              onClick={() => setMobilePanel('chat')}
            />
          )}
          {!activePeer && !activeGroup ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Shield className="w-12 h-12 text-border mb-4 opacity-20" />
              <h2 className="text-sm font-bold opacity-30 uppercase tracking-[0.2em]">ETHOS Isolated</h2>
              <p className="text-[11px] text-text-secondary mt-2 max-w-xs leading-relaxed uppercase tracking-tighter">
                Enter a peer ticket or create a group to start a secure chat.
              </p>
            </div>
          ) : (
            <>
              <header className="h-14 border-b border-border flex items-center justify-between gap-3 px-3 xs:px-6 bg-bg">
                <div className="flex min-w-0 items-center gap-2 xs:gap-3">
                  <h1 className="min-w-0 truncate font-bold text-sm">
                    {activeGroup 
                      ? groups.find(g => g.id === activeGroup)?.name 
                      : (activePeer ? (iroh.getPeerName(activePeer) || `Node_${activePeer.slice(0, 4)}`) : '')}
                  </h1>
                  <span className="shrink-0 max-w-[4.5rem] xs:max-w-[9rem] truncate px-1.5 xs:px-2 py-0.5 rounded bg-surface-rail text-[9px] text-brand border border-brand/20 font-bold uppercase tracking-widest">
                    <span className="xs:hidden">
                      {activeGroup ? 'GROUP' : activePeer ? iroh.getPeerTransportStatus(activePeer).mode.toUpperCase() : 'CHAT'}
                    </span>
                    <span className="hidden xs:inline">
                      {activeGroup ? 'Secure group' : activePeer ? iroh.getPeerTransportStatus(activePeer).label : 'Secure chat'}
                    </span>
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 xs:gap-4 text-[10px] uppercase font-bold">
                  <div className="w-px h-3 bg-border opacity-20"></div>
                  <span className="flex items-center gap-1 text-brand/80" title="Quantum safe">
                    <Shield className="w-3 h-3" />
                    <span className="hidden xs:inline">QUANTUM_SAFE</span>
                  </span>
                  <div className="w-px h-3 bg-border opacity-20"></div>
                  <span className={cn(
                    "flex items-center gap-1",
                    isEphemeral ? "text-orange-400" : "text-gray-500"
                  )}>
                    <Clock className="w-3 h-3" /> Ephemeral {isEphemeral ? 'Active' : 'Off'}
                  </span>
                </div>
              </header>

              <div 
                ref={scrollRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  shouldAutoScrollRef.current = isNearScrollBottom({
                    scrollTop: element.scrollTop,
                    clientHeight: element.clientHeight,
                    scrollHeight: element.scrollHeight,
                  });
                }}
                className="flex-1 p-6 space-y-6 overflow-y-auto terminal-scroll scroll-smooth"
              >
                {messages.filter(m => {
                  if (activeGroup) return m.groupId === activeGroup;
                  return !m.groupId && (m.senderId === activePeer || m.receiverId === activePeer);
                }).map((msg) => (
                  <div 
                    key={msg.id}
                    className={cn(
                      "flex gap-4 max-w-2xl group",
                      msg.senderId === identity?.id ? "ml-auto flex-row-reverse" : ""
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold border border-border",
                      msg.senderId === identity?.id ? "bg-gray-700" : "bg-blue-600"
                    )}>
                      {msg.senderId === identity?.id ? 'U' : (iroh.getPeerName(msg.senderId)?.[0]?.toUpperCase() || 'P')}
                    </div>
                    <div className={cn(
                      "space-y-1",
                      msg.senderId === identity?.id ? "text-right" : ""
                    )}>
                      <div className={cn(
                        "flex items-baseline gap-2",
                        msg.senderId === identity?.id ? "flex-row-reverse" : ""
                      )}>
                        <span className="text-[10px] font-bold uppercase opacity-80 decoration-brand group-hover:underline cursor-default">
                          {msg.senderId === identity?.id ? 'Identity_Local' : (iroh.getPeerName(msg.senderId) || `Node_${msg.senderId.slice(0, 4)}`)}
                        </span>
                        <span className="text-[10px] opacity-30 font-mono">
                          {format(msg.timestamp, 'HH:mm:ss')}
                        </span>
                      </div>
                      <div className="relative">
                        <div className={cn(
                          "p-3 rounded-xl text-sm border transition-all relative overflow-hidden",
                          msg.senderId === identity?.id 
                            ? "bg-brand text-black font-semibold border-brand rounded-tr-none" 
                            : "bg-surface-rail border-border text-text-primary rounded-tl-none",
                          msg.expiresAt && "border-orange-500/50",
                          msg.type === 'file' && "bg-blue-500/10 border-blue-500/30"
                        )}>
                          {msg.type === 'file' ? (
                            <div className="flex items-center gap-3">
                              <FileIcon className="w-5 h-5 text-blue-400" />
                              <div className="flex-1">
                                <div className="font-semibold text-white">{msg.fileName || msg.content}</div>
                                <div className="text-[10px] opacity-60">
                                  {msg.fileSize ? `${(msg.fileSize / 1024).toFixed(1)} KB` : ''}
                                </div>
                              </div>
                              {msg.downloadUrl && (
                                <a 
                                  href={msg.downloadUrl} 
                                  download={msg.fileName || 'file'}
                                  className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-xs font-bold"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                            </div>
                          ) : (
                            msg.content
                          )}
                          
                          {msg.expiresAt && (
                            <div className={cn(
                              "text-[8px] font-mono mt-2 flex items-center gap-1 opacity-70",
                              msg.senderId === identity?.id ? "justify-end text-black" : "justify-start text-orange-400"
                            )}>
                              <Clock className="w-2.5 h-2.5" />
                              SELF_DESTRUCT: {Math.max(0, Math.ceil((msg.expiresAt - Date.now()) / 1000))}s
                            </div>
                          )}
                          
                          {/* Progress bar for ephemeral messages */}
                          {msg.expiresAt && (
                            <motion.div 
                              initial={{ width: "100%" }}
                              animate={{ width: "0%" }}
                              transition={{ duration: (msg.expiresAt - msg.timestamp) / 1000, ease: "linear" }}
                              className={cn(
                                "absolute bottom-0 left-0 h-0.5",
                                msg.senderId === identity?.id ? "bg-black/20" : "bg-orange-500/50"
                              )}
                            />
                          )}
                        </div>
                        
                        {/* Reactions Display */}
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className={cn(
                            "flex gap-1 mt-1",
                            msg.senderId === identity?.id ? "justify-end" : "justify-start"
                          )}>
                            {(Object.entries(msg.reactions) as [string, string[]][]).map(([emoji, users]) => (
                              <div key={emoji} className="bg-bg border border-border px-1.5 py-0.5 rounded-full text-[10px] flex items-center gap-1 shadow-sm">
                                <span>{emoji}</span>
                                <span className="opacity-50">{users.length}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reaction Picker Trigger */}
                        <div className={cn(
                          "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity",
                          msg.senderId === identity?.id ? "right-full mr-2" : "left-full ml-2"
                        )}>
                          <button 
                            onClick={() => setShowEmojiPicker(msg.id)}
                            className="p-1.5 bg-surface-rail border border-border rounded-lg text-text-secondary hover:text-brand"
                          >
                            <Smile className="w-4 h-4" />
                          </button>
                          {showEmojiPicker === msg.id && (
                            <div className="absolute top-8 z-50 shadow-2xl">
                              <EmojiPicker 
                                onEmojiClick={(emoji: EmojiClickData) => handleReaction(msg.id, emoji.emoji)}
                                width={250}
                                height={300}
                                theme={"dark" as any}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input Bar */}
              <footer className="p-4 bg-surface-sidebar border-t border-border">
                <div className="relative flex items-center bg-bg border border-border rounded-lg px-3 xs:px-4 py-2 focus-within:border-brand/40 transition-colors shadow-inner">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!!activeGroup}
                    className="text-text-secondary hover:text-white mr-2 xs:mr-3 transition-colors group disabled:opacity-20"
                  >
                    <Paperclip className="w-5 h-5 group-hover:text-brand" />
                  </button>
                  <input 
                    type="text" 
                    placeholder={activeGroup ? "Message Group..." : "Message Peer..."} 
                    className="bg-transparent flex-1 outline-none text-xs xs:text-sm placeholder-gray-700 font-mono w-0"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSendMessage();
                      }
                    }}
                  />
                  <div className="flex items-center gap-1.5 xs:gap-3">
                    <button 
                      onClick={() => setIsEphemeral(!isEphemeral)}
                      title={isEphemeral ? "Disable Ephemeral (Standard Only)" : "Enable Ephemeral (Burn after 1m)"}
                      className={cn(
                        "flex items-center gap-1.5 px-2 xs:px-3 py-1.5 rounded-lg border transition-all text-[9px] xs:text-[10px] font-bold uppercase tracking-wider",
                        isEphemeral 
                          ? "bg-orange-500/10 border-orange-500/50 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.2)]" 
                          : "bg-surface-rail border-border text-text-secondary hover:text-white"
                      )}
                    >
                      <Clock className={cn("w-3 h-3 xs:w-3.5 xs:h-3.5", isEphemeral ? "animate-pulse" : "opacity-40")} />
                      <span className="hidden xs:inline">{isEphemeral ? 'Ephemeral' : 'Standard'}</span>
                      <span className="xs:hidden">{isEphemeral ? 'EPH' : 'STD'}</span>
                    </button>
                    <button 
                      onClick={handleSendMessage}
                      disabled={!inputText.trim() || isSending}
                      className={cn(
                        "bg-brand text-black w-7 h-7 xs:w-8 xs:h-8 rounded flex items-center justify-center transition-all shadow-[0_0_10px_rgba(0,255,65,0.4)]",
                        inputText.trim() && !isSending ? "hover:opacity-90 active:scale-95 group" : "opacity-30 cursor-not-allowed"
                      )}
                    >
                      {isSending ? (
                        <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      ) : (
                        <Send className={cn(
                          "w-3.5 h-3.5 xs:w-4 xs:h-4 transition-transform",
                          inputText.trim() && "group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        )} />
                      )}
                    </button>
                  </div>
                </div>
              </footer>
            </>
          )}
        </main>

        {/* Right Rail: Node Details */}
        <aside className={cn(
          "w-72 bg-surface-rail border-l border-border p-5 flex flex-col gap-6 overflow-x-hidden overflow-y-auto terminal-scroll overscroll-contain transition-all duration-300 z-30",
          "absolute inset-y-0 right-0 lg:relative lg:translate-x-0 hidden lg:flex",
          mobilePanel === 'metrics' && "translate-x-0 flex !relative h-[calc(100dvh-3rem)]"
        )}>
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-4">Post-Quantum Node</h3>
            <div className="space-y-4">
              <div className="p-3 bg-brand/5 rounded border border-brand/20">
                <div className="text-[9px] text-brand mb-1 uppercase font-bold tracking-widest flex items-center gap-2">
                  <Shield className="w-3 h-3" /> Quantum Status
                </div>
                <div className="text-[11px] font-bold text-brand">Hybrid ML-KEM + P-256</div>
                <div className="text-[9px] opacity-60 mt-1 font-mono leading-tight">
                  Status: ARMORED<br/>
                  Engine: crystals-kyber-js
                </div>
              </div>
              <div>
                <div className="text-[9px] opacity-30 mb-1 font-mono uppercase font-bold tracking-widest">Classical PK</div>
                <div className="font-mono text-[9px] break-all text-text-secondary bg-bg p-2 rounded border border-border/50">
                  {identity?.classicalPublicKey.slice(0, 48)}...
                </div>
              </div>
              <div>
                <div className="text-[9px] opacity-30 mb-1 font-mono uppercase font-bold tracking-widest">Quantum PK</div>
                <div className="font-mono text-[9px] break-all text-text-secondary bg-bg p-2 rounded border border-border/50">
                  {identity?.pqcPublicKey.slice(0, 48)}...
                </div>
              </div>
              <div>
                <div className="text-[9px] opacity-30 mb-1 font-mono uppercase font-bold tracking-widest">Node Ticket</div>
                <div 
                  className="font-mono text-[9px] break-all text-brand bg-bg p-2 rounded border border-border/50 cursor-pointer hover:bg-brand/5"
                  onClick={() => navigator.clipboard.writeText(identity?.id || '')}
                >
                  {identity?.id}
                </div>
              </div>
              <div className="p-3 bg-bg/50 rounded border border-border">
                <div className="text-[9px] opacity-40 mb-3 uppercase font-bold tracking-widest">Network Diagnostics</div>
                <div className="space-y-2">
                  {networkDiagnostics.metrics.map(metric => (
                    <div key={metric.label} className="flex items-center justify-between gap-3 text-[10px] font-mono">
                      <span className="opacity-50 uppercase">{metric.label}</span>
                      <span className="text-brand text-right tabular-nums truncate max-w-[9rem]">{metric.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {activePeer && iroh.getPeerKeys(activePeer) && (
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="text-[9px] uppercase font-bold opacity-30 mb-2 tracking-widest">Active Peer Keys</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="text-[8px] opacity-20 uppercase font-bold mb-1">Peer Classical</div>
                      <div className="font-mono text-[8px] break-all opacity-50 bg-black/20 p-1.5 rounded">
                        {iroh.getPeerKeys(activePeer)?.classical.slice(0, 64)}...
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] opacity-20 uppercase font-bold mb-1">Peer Quantum</div>
                      <div className="font-mono text-[8px] break-all opacity-50 bg-black/20 p-1.5 rounded">
                        {iroh.getPeerKeys(activePeer)?.pqc.slice(0, 64)}...
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mt-auto">
            <div className="p-4 bg-surface-sidebar rounded border border-border relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 rounded-full -mr-16 -mt-16 group-hover:bg-brand/10 transition-colors"></div>
              <div className="relative z-10">
                <h4 className="text-[10px] font-bold uppercase opacity-40 mb-3 tracking-widest">Recent Diagnostics</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="opacity-50">LIVE_RELAYS</span>
                    <span className="text-brand tabular-nums">{signalMeshCount}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="opacity-50">ACTIVE_REACTIONS</span>
                    <span className="text-brand">{messages.reduce((acc: number, m) => acc + (m.reactions ? Object.keys(m.reactions).length : 0), 0)}</span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {networkDiagnostics.recentEntries.length === 0 ? (
                      <div className="text-[10px] text-text-secondary/50 italic">No diagnostics captured yet.</div>
                    ) : (
                      networkDiagnostics.recentEntries.map(entry => (
                        <div key={entry.id} className="rounded bg-black/25 p-2 font-mono text-[9px] leading-snug text-text-secondary">
                          <div className="mb-1 uppercase text-brand/70">{entry.level}</div>
                          <div className="line-clamp-2 break-words">{entry.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>
      
      {/* Add Peer Modal */}
      <AnimatePresence>
        {showAddPeer && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddPeer(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-surface border border-border rounded-xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <Plus className="w-5 h-5 text-brand" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-brand">Add Peer</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-40 mb-2">Peer Ticket Or Display Name</label>
                   <textarea 
                     value={newPeerId}
                     onChange={(e) => setNewPeerId(e.target.value)}
                     onPaste={() => setTimeout(() => handleConnect())}
                     className="w-full bg-bg border border-border rounded px-3 py-2 text-xs font-mono focus:border-brand outline-none transition-colors min-h-[100px] resize-none"
                     placeholder="Enter Display Name (e.g. Alice) or Paste Direct Ticket..."
                   />
                  <p className="text-[9px] opacity-30 mt-2 italic flex flex-col gap-1">
                    <span>• Display-name discovery is unverified and requires confirmation.</span>
                    <span>• Direct peer tickets are the trusted connection path.</span>
                  </p>
                </div>

                <div className="pt-4 border-t border-border flex justify-end gap-3">
                  <button 
                    onClick={() => setShowAddPeer(false)}
                    className="px-4 py-2 text-[10px] uppercase font-bold opacity-50 hover:opacity-100 transition-opacity"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConnect}
                    disabled={!newPeerId.trim() || isConnecting}
                    className="bg-brand text-black px-6 py-2 rounded text-[10px] uppercase font-bold hover:opacity-90 disabled:opacity-30 transition-opacity whitespace-nowrap"
                  >
                    {isConnecting ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unverified Discovery Confirmation Modal */}
      <AnimatePresence>
        {unverifiedDiscovery && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setUnverifiedDiscovery(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
              className="relative w-full max-w-lg bg-surface border border-orange-500/20 rounded-xl p-6 shadow-2xl"
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                  <Shield className="w-5 h-5 text-orange-300" />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-orange-200">
                    Unverified Discovery Result
                  </h2>
                  <p className="text-xs opacity-70 mt-2 leading-relaxed">
                    {getUnverifiedDiscoveryWarning(unverifiedDiscovery.name)}
                  </p>
                </div>
              </div>

              <div className="bg-bg border border-border rounded-lg p-3 mb-5">
                <div className="text-[9px] uppercase tracking-widest opacity-40 mb-2">Found peer ticket</div>
                <div className="font-mono text-[11px] break-all text-brand">{unverifiedDiscovery.peerId}</div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-end">
                <button
                  onClick={() => setUnverifiedDiscovery(null)}
                  className="px-4 py-2 text-[10px] uppercase font-bold opacity-50 hover:opacity-100 transition-opacity"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmUnverifiedDiscovery}
                  disabled={isConnecting}
                  className="bg-orange-400 text-black px-6 py-2 rounded text-[10px] uppercase font-bold hover:opacity-90 disabled:opacity-30 transition-opacity"
                >
                  {isConnecting ? 'Connecting...' : 'I Verified, Connect'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* About Modal */}
      <AnimatePresence>
        {showAbout && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAbout(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto terminal-scroll bg-surface border border-border rounded-xl p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <Info className="w-5 h-5 text-brand" />
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-widest text-brand">About ETHOS</h2>
                    <p className="text-[10px] opacity-40 font-mono mt-1">Secure peer-to-peer messaging // v{APP_VERSION}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAbout(false)}
                  className="text-[10px] uppercase font-bold opacity-50 hover:opacity-100 transition-opacity"
                >
                  Close
                </button>
              </div>

              <div className="space-y-5 text-[11px] leading-relaxed text-text-secondary">
                <section className="p-4 rounded-lg border border-brand/20 bg-brand/5">
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-brand mb-2">What ETHOS Is</h3>
                  <p>
                    ETHOS is a browser-based secure messaging and file transfer app using hybrid quantum-safe encryption:
                    today's standard elliptic-curve cryptography combined with ML-KEM, a post-quantum key exchange selected by NIST.
                    Each browser becomes its own cryptographic node. You share a node ticket, connect to another person, and exchange
                    messages or files through an encrypted tunnel.
                  </p>
                  <p className="mt-2">
                    The core rule is simple: user content must never fall back to plaintext. If a direct connection is unavailable,
                    ETHOS uses encrypted relay transport instead of weakening the security model.
                  </p>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-2">What You Can Do</h3>
                  <ul className="space-y-1 list-disc pl-4">
                    <li>Send end-to-end encrypted one-to-one messages.</li>
                    <li>Create encrypted group chats that persist after reload.</li>
                    <li>Transfer encrypted files between devices.</li>
                    <li>Use encrypted relay fallback when direct WebRTC cannot connect.</li>
                    <li>Use ETHOS without email, phone number, signup, or password account.</li>
                    <li>Keep local chat history encrypted in the browser, with an optional passphrase lock.</li>
                    <li>Copy mobile diagnostics from inside the app for troubleshooting.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-2">How Connections Work</h3>
                  <p>
                    Public relays help peers find and reach each other, but relays are not trusted with message contents.
                    The apps exchange encrypted signaling events, establish a secure session, then use direct WebRTC when possible.
                    If direct transport fails, encrypted relay fallback can keep communication available.
                  </p>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-2">Security Model</h3>
                  <p className="mb-2">
                    ETHOS protects messages against today's attackers while preparing for future quantum computers.
                  </p>
                  <ul className="space-y-1 list-disc pl-4">
                    <li>Hybrid quantum-safe key exchange combines ML-KEM-1024 with ECDH P-256.</li>
                    <li>Messages use a Double Ratchet with AES-256-GCM encryption.</li>
                    <li>Message keys evolve over time for forward secrecy.</li>
                    <li>Messages and files remain encrypted even when relayed.</li>
                    <li>Your node identity is generated and stored locally in this browser.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-2">Local Data</h3>
                  <p>
                    ETHOS stores your local identity, known peers, encrypted group metadata, encrypted chat history, optional history-lock state,
                    and redacted diagnostics in the browser. Chat history and group metadata are encrypted in IndexedDB. If you enable the history lock,
                    saved conversations stay hidden after reload until you enter your passphrase.
                  </p>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-2">Reliability Notes</h3>
                  <p>
                    Mobile browsers can pause tabs in the background, and some networks block direct WebRTC paths.
                    For best results, keep ETHOS open and foregrounded while connecting or transferring files. If a peer is offline
                    or their browser is sleeping, ETHOS will wait instead of spamming relays.
                  </p>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-3">What Changed Recently</h3>
                  <div className="space-y-3">
                    {ABOUT_CHANGELOG.map(entry => (
                      <article key={entry.version} className="rounded-lg border border-border/60 bg-bg/40 p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-text">
                            v{entry.version} · {entry.title}
                          </h4>
                          <span className="font-mono text-[9px] opacity-40">{entry.date}</span>
                        </div>
                        <ul className="space-y-1 list-disc pl-4">
                          {entry.changes.map(change => (
                            <li key={change}>{change}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="p-4 rounded-lg border border-orange-500/20 bg-orange-500/5">
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-orange-300 mb-2">Clear Limits</h3>
                  <p>
                    ETHOS is experimental software and has not been independently audited. Browser storage encryption does not protect
                    against a fully compromised device, browser profile, or active app session. Relays should not read your content,
                    but they may still observe timing and routing metadata.
                  </p>
                  <p className="mt-2">
                    Advanced users can add their own relay to reduce dependence on public relays, but the relay operator may still observe
                    connection timing and routing metadata.
                  </p>
                </section>

                <section className="p-4 rounded-lg border border-brand/20 bg-brand/5">
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-brand mb-2">Verify ETHOS</h3>
                  <p>
                    ETHOS should be verified through public artifacts, not trust-us marketing. The public app includes a warrant canary,
                    cryptographic design note, reproducible-build guide, release manifest, and SHA-256 sums.
                  </p>
                  <p className="mt-2">
                    Public users can inspect the transparency artifacts, verify SHA-256 release receipts, and check GitHub
                    artifact attestations linked from the release manifest.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href="./trust/canary.txt" className="px-3 py-2 rounded border border-border text-[9px] uppercase font-bold hover:border-brand hover:text-brand transition-colors">
                      Canary
                    </a>
                    <a href="./trust/cryptographic-design.md" className="px-3 py-2 rounded border border-border text-[9px] uppercase font-bold hover:border-brand hover:text-brand transition-colors">
                      Crypto Design
                    </a>
                    <a href="./trust/reproducible-builds.md" className="px-3 py-2 rounded border border-border text-[9px] uppercase font-bold hover:border-brand hover:text-brand transition-colors">
                      Build Receipts
                    </a>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-2">Safe-Use Checklist</h3>
                  <ul className="space-y-1 list-disc pl-4">
                    <li>Verify you are using the expected node ticket for a peer.</li>
                    <li>Keep ETHOS open while connecting or transferring files.</li>
                    <li>Enable chat-history lock on shared or high-risk devices.</li>
                    <li>Export your identity only when you intend to move or back it up.</li>
                    <li>Review diagnostics logs before sending them to someone else.</li>
                  </ul>
                </section>

                <section className="p-4 rounded-lg border border-brand/20 bg-brand/5">
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-brand mb-2">Support ETHOS</h3>
                  <p>
                    ETHOS is open source on GitHub. Anyone can inspect the implementation, follow project notes,
                    and reproduce release builds against the public receipts.
                  </p>
                  <div className="mt-3 rounded-lg border border-border/60 bg-bg/50 p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-[9px] uppercase font-bold tracking-widest text-brand">Monero Donation Address</span>
                      <span className="text-[8px] uppercase font-bold opacity-40">XMR Only</span>
                    </div>
                    <div className="font-mono text-[9px] leading-relaxed break-all rounded bg-black/30 border border-border/40 p-2 text-text">
                      {ETHOS_MONERO_DONATION_ADDRESS}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyDonationText(ETHOS_MONERO_DONATION_ADDRESS, 'Monero address')}
                        className="px-3 py-2 rounded bg-brand text-black text-[9px] uppercase font-bold hover:opacity-90 active:scale-[0.96] transition-[opacity,transform] flex items-center gap-2"
                      >
                        <Clipboard className="w-3 h-3" /> Copy Address
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyDonationText(getMoneroDonationUri(), 'Monero URI')}
                        className="px-3 py-2 rounded border border-border text-[9px] uppercase font-bold hover:border-brand hover:text-brand active:scale-[0.96] transition-[border-color,color,transform]"
                      >
                        Copy Wallet URI
                      </button>
                    </div>
                  </div>
                  <p className="mt-3">
                    Donations are voluntary support and do not unlock features. ETHOS does not verify payments in the browser.
                    For better privacy, use Monero from a self-custody wallet instead of sending directly from a KYC exchange.
                  </p>
                </section>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto terminal-scroll bg-surface border border-border rounded-xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <Terminal className="w-5 h-5 text-brand" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-brand">Node Configuration</h2>
              </div>
              
              <div className="space-y-6">
                <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-brand/70">Build Version</span>
                  <span className="text-xs font-mono text-brand bg-bg/80 border border-brand/20 px-2 py-1 rounded">
                    v{APP_VERSION}
                  </span>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-40 mb-2">Display Name</label>
                  <input 
                    type="text" 
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-sm font-mono focus:border-brand outline-none transition-colors"
                    placeholder="Enter node alias..."
                  />
                  <p className="text-[9px] opacity-30 mt-2 italic">This name is broadcasted to peers during the HELO handshake.</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] uppercase font-bold opacity-40">Relay Infrastructure</label>
                    <button 
                      onClick={handleResetRelays}
                      className="text-[9px] uppercase font-bold text-brand hover:underline"
                    >
                      Reset Defaults
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-32 overflow-y-auto terminal-scroll pr-2 border border-border/50 rounded bg-bg/50 p-2">
                    {relays.map(relay => (
                      <div key={relay} className="flex items-center justify-between gap-2 p-1.5 bg-bg border border-border rounded group">
                        <span className="text-[10px] font-mono truncate opacity-60">{relay}</span>
                        <button 
                          onClick={() => handleRemoveRelay(relay)}
                          disabled={relays.length <= 1}
                          className="text-red-500 opacity-0 group-hover:opacity-100 disabled:opacity-0 transition-opacity p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newRelay}
                      onChange={(e) => setNewRelay(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddRelay()}
                      className="flex-1 bg-bg border border-border rounded px-2 py-1.5 text-[10px] font-mono focus:border-brand outline-none"
                      placeholder="wss://custom-relay.io..."
                    />
                    <button 
                      onClick={handleAddRelay}
                      disabled={!newRelay.trim()}
                      className="bg-brand/10 text-brand border border-brand/20 px-3 rounded text-[10px] uppercase font-bold hover:bg-brand/20 disabled:opacity-30"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-[9px] opacity-20 italic font-mono leading-tight">
                    Signaling relays facilitate WebRTC handshakes. Adding multiple relays improves reliability in restricted networks.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center gap-3">
                    <label className="block text-[10px] uppercase font-bold opacity-40 flex items-center gap-2">
                      <Network className="w-3 h-3" /> ICE / TURN Servers
                    </label>
                    <button
                      onClick={handleResetIceServers}
                      className="text-[9px] uppercase font-bold text-brand hover:underline"
                    >
                      Reset Custom
                    </button>
                  </div>

                  <p className="text-[9px] opacity-50 leading-relaxed">
                    Configure STUN/TURN used for direct WebRTC tunnels. Custom servers are tried before hosted
                    deployment defaults. Bundled demo TURN is best-effort only and is used only when no production
                    TURN is configured.
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {ICE_SERVER_PRESETS.map(preset => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyIcePreset(preset.id)}
                        className="px-2.5 py-1.5 rounded border border-border/60 bg-bg text-[9px] uppercase font-bold tracking-wide hover:border-brand/40 hover:text-brand transition-colors"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2 max-h-32 overflow-y-auto terminal-scroll pr-2 border border-border/50 rounded bg-bg/50 p-2">
                    {iceServers.length === 0 ? (
                      <div className="text-[10px] font-mono opacity-40 italic p-1.5">
                        No custom ICE servers saved. Bundled STUN and demo TURN remain available.
                      </div>
                    ) : (
                      iceServers.map(server => (
                        <div key={server.id} className="flex items-start justify-between gap-2 p-1.5 bg-bg border border-border rounded group">
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold truncate">{server.label || 'Custom ICE Server'}</div>
                            <div className="text-[10px] font-mono truncate opacity-60">{server.urls}</div>
                            {(server.username || server.credential) && (
                              <div className="text-[9px] font-mono opacity-40 mt-1">
                                {server.username ? `user: ${server.username}` : 'user: —'}
                                {server.credential ? ' • credential: saved locally' : ''}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveIceServer(server.id)}
                            className="text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1 shrink-0"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="grid gap-2">
                    <input
                      type="text"
                      value={iceDraft.label}
                      onChange={(e) => setIceDraft(current => ({ ...current, label: e.target.value }))}
                      className="w-full bg-bg border border-border rounded px-2 py-1.5 text-[10px] font-mono focus:border-brand outline-none"
                      placeholder="Label (optional)"
                    />
                    <textarea
                      value={iceDraft.urls}
                      onChange={(e) => setIceDraft(current => ({ ...current, urls: e.target.value }))}
                      className="w-full min-h-[72px] bg-bg border border-border rounded px-2 py-1.5 text-[10px] font-mono focus:border-brand outline-none resize-y"
                      placeholder="turn:turn.example.com:3478,turns:turn.example.com:5349"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={iceDraft.username}
                        onChange={(e) => setIceDraft(current => ({ ...current, username: e.target.value }))}
                        className="w-full bg-bg border border-border rounded px-2 py-1.5 text-[10px] font-mono focus:border-brand outline-none"
                        placeholder="TURN username (optional)"
                      />
                      <input
                        type="password"
                        value={iceDraft.credential}
                        onChange={(e) => setIceDraft(current => ({ ...current, credential: e.target.value }))}
                        className="w-full bg-bg border border-border rounded px-2 py-1.5 text-[10px] font-mono focus:border-brand outline-none"
                        placeholder="TURN credential (optional)"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleAddIceServer}
                      disabled={!iceDraft.urls.trim()}
                      className="bg-brand/10 text-brand border border-brand/20 px-3 py-1.5 rounded text-[10px] uppercase font-bold hover:bg-brand/20 disabled:opacity-30"
                    >
                      Add ICE Server
                    </button>
                    <button
                      onClick={handleTestIceServers}
                      disabled={isIceTesting}
                      className="border border-border/60 hover:border-brand/40 text-text-secondary hover:text-brand px-3 py-1.5 rounded text-[10px] uppercase font-bold transition-colors disabled:opacity-30"
                    >
                      {isIceTesting ? 'Testing ICE...' : 'Test ICE Config'}
                    </button>
                  </div>

                  {iceTestMessage && (
                    <p className={cn(
                      'text-[9px] leading-relaxed font-mono border rounded p-2',
                      iceTestMessage.includes('passed')
                        ? 'border-brand/30 text-brand bg-brand/5'
                        : 'border-border/60 text-text-secondary bg-bg/50'
                    )}>
                      {iceTestMessage}
                    </p>
                  )}

                  <p className="text-[9px] opacity-20 italic font-mono leading-tight">
                    TURN credentials stay in local browser storage only. They are not sent over Nostr or included in identity export.
                  </p>
                </div>

                <div className="p-4 bg-bg rounded border border-border">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-[10px] uppercase font-bold opacity-40 tracking-widest flex items-center gap-2">
                      <Terminal className="w-3 h-3" /> Diagnostics
                    </h3>
                    <span className="text-[9px] font-mono opacity-30">{diagnosticEntries.length} lines</span>
                  </div>
                  <p className="text-[9px] opacity-50 mb-4 leading-relaxed">
                    Mobile users can copy recent redacted console and relay logs for troubleshooting. Private keys and large encrypted payloads are filtered before export.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={handleCopyDiagnostics}
                      className="border border-brand/20 hover:bg-brand/5 text-brand text-[10px] uppercase font-bold py-2 rounded flex items-center justify-center gap-2 transition-all"
                    >
                      <Clipboard className="w-3 h-3" /> Copy Log
                    </button>
                    <button
                      onClick={handleClearDiagnostics}
                      className="border border-border/40 hover:bg-white/5 text-text-secondary text-[10px] uppercase font-bold py-2 rounded flex items-center justify-center gap-2 transition-all"
                    >
                      <Trash2 className="w-3 h-3" /> Clear
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto terminal-scroll rounded border border-border/50 bg-black/30 p-2 font-mono text-[9px] leading-relaxed">
                    {diagnosticEntries.length === 0 ? (
                      <div className="opacity-30 italic">No diagnostics captured yet.</div>
                    ) : (
                      diagnosticEntries.slice(-10).map(entry => (
                        <div key={entry.id} className={cn(
                          "break-words",
                          entry.level === 'error' ? 'text-red-400' :
                          entry.level === 'warn' ? 'text-orange-300' :
                          entry.level === 'status' ? 'text-brand' :
                          'text-text-secondary/70'
                        )}>
                          {entry.level.toUpperCase()} {entry.message}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="p-4 bg-bg rounded border border-border">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-[10px] uppercase font-bold opacity-40 tracking-widest flex items-center gap-2">
                      <Lock className="w-3 h-3" /> Chat History
                    </h3>
                    <span className={cn(
                      "text-[9px] font-mono uppercase",
                      historyLockEnabled ? "text-brand" : "opacity-30"
                    )}>
                      {historyLockEnabled ? (isHistoryUnlocked ? 'Unlocked' : 'Locked') : 'Auto'}
                    </span>
                  </div>
                  <p className="text-[9px] opacity-50 mb-4 leading-relaxed">
                    Conversation history is encrypted in IndexedDB. A passphrase lock uses a salted PBKDF2 key and keeps history hidden after reload, but it cannot protect an active compromised browser session.
                  </p>
                  {historyLockEnabled && !isHistoryUnlocked ? (
                    <div className="space-y-2">
                      <input
                        type="password"
                        value={historyPassphrase}
                        onChange={(e) => setHistoryPassphrase(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleUnlockHistory()}
                        className="w-full bg-bg border border-border rounded px-3 py-2 text-xs font-mono focus:border-brand outline-none transition-colors"
                        placeholder="History passphrase..."
                      />
                      <button
                        onClick={handleUnlockHistory}
                        disabled={!historyPassphrase.trim()}
                        className="w-full border border-brand/20 hover:bg-brand/5 text-brand text-[10px] uppercase font-bold py-2 rounded transition-all disabled:opacity-30"
                      >
                        Unlock History
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {!historyLockEnabled && (
                        <input
                          type="password"
                          value={historyPassphrase}
                          onChange={(e) => setHistoryPassphrase(e.target.value)}
                          className="w-full bg-bg border border-border rounded px-3 py-2 text-xs font-mono focus:border-brand outline-none transition-colors"
                          placeholder="New history passphrase (14+ chars)..."
                        />
                      )}
                      <button
                        onClick={historyLockEnabled ? handleDisableHistoryLock : handleEnableHistoryLock}
                        className={cn(
                          "w-full border text-[10px] uppercase font-bold py-2 rounded transition-all",
                          historyLockEnabled
                            ? "border-border/40 hover:bg-white/5 text-text-secondary"
                            : "border-brand/20 hover:bg-brand/5 text-brand"
                        )}
                      >
                        {historyLockEnabled ? 'Disable History Lock' : 'Enable History Lock'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-bg rounded border border-border">
                  <h3 className="text-[10px] uppercase font-bold opacity-40 mb-3 tracking-widest flex items-center gap-2">
                    <Key className="w-3 h-3" /> Backup & Recovery
                  </h3>
                  <p className="text-[9px] opacity-50 mb-4 leading-relaxed">
                    Download your cryptographic identity to move this node to another device. Your private keys are never transmitted to any server.
                  </p>
                  <button 
                    onClick={handleBackupIdentity}
                    className="w-full border border-brand/20 hover:bg-brand/5 text-brand text-[10px] uppercase font-bold py-2 rounded flex items-center justify-center gap-2 transition-all"
                  >
                    <Download className="w-3 h-3" /> Export Identity
                  </button>
                  <input
                    type="file"
                    id="import-identity"
                    className="hidden"
                    accept=".key"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      try {
                        await iroh.importIdentity(text);
                        setIdentity(iroh.getIdentity());
                        setStatus({ type: 'info', message: 'Identity imported. Reloading...' });
                        setTimeout(() => window.location.reload(), 1500);
                      } catch {
                        setStatus({ type: 'error', message: 'Invalid identity bundle' });
                      }
                    }}
                  />
                  <label 
                    htmlFor="import-identity"
                    className="w-full border border-border/20 hover:bg-white/5 text-text-secondary text-[10px] uppercase font-bold py-2 rounded flex items-center justify-center gap-2 transition-all cursor-pointer mt-2"
                  >
                    <Upload className="w-3 h-3" /> Import Identity
                  </label>
                </div>

                <div className="pt-4 border-t border-border mt-4 flex items-center justify-between">
                  <span className="text-[9px] font-mono opacity-20 uppercase tracking-widest">ETHOS Suite // v{APP_VERSION}</span>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowSettings(false)}
                      className="px-4 py-2 text-[10px] uppercase font-bold opacity-50 hover:opacity-100 transition-opacity"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        iroh.setDisplayName(tempName);
                        iroh.updateRelays(relays);
                        iroh.updateIceServers(iceServers);
                        setIdentity(iroh.getIdentity());
                        setShowSettings(false);
                      }}
                      className="bg-brand text-black px-6 py-2 rounded text-[10px] uppercase font-bold hover:opacity-90 transition-opacity"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Status Toasts */}
      <AnimatePresence>
        {status && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className={cn(
              "fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-xl border flex items-center gap-3 shadow-2xl backdrop-blur-md",
              status.type === 'error' ? "bg-red-500/10 border-red-500/20 text-red-500" : 
              status.type === 'warning' ? "bg-orange-500/10 border-orange-500/20 text-orange-500" :
              "bg-brand/10 border-brand/20 text-brand"
            )}
          >
            {status.type === 'error' ? <Terminal className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            <span className="text-[11px] font-bold uppercase tracking-wider">{status.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Group Confirmation Modal */}
      <AnimatePresence>
        {groupDeleteTarget && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGroupDeleteTarget(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 8 }}
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
              className="relative w-full max-w-md bg-surface border border-red-500/20 rounded-xl p-6 shadow-2xl"
            >
              <div className="flex items-start gap-4 mb-5">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest text-red-300">
                    {identity?.id === groupDeleteTarget.ownerId ? 'Delete Group For Everyone' : 'Remove Group Locally'}
                  </h2>
                  <p className="text-[10px] opacity-40 font-mono mt-1 truncate max-w-[18rem]">
                    {groupDeleteTarget.name}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 bg-bg/50 p-4 text-[11px] leading-relaxed text-text-secondary">
                {identity?.id === groupDeleteTarget.ownerId ? (
                  <p>
                    This sends an encrypted delete event to every member and removes the group from this device.
                    Members who are offline may keep their copy until they reconnect and receive a fresh group update.
                  </p>
                ) : (
                  <p>
                    This removes the group only from this device. Other members keep their copy unless the group owner deletes it for everyone.
                  </p>
                )}
              </div>

              <div className="pt-5 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setGroupDeleteTarget(null)}
                  className="px-4 py-2 text-[10px] uppercase font-bold opacity-50 hover:opacity-100 transition-opacity"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteGroup}
                  className="bg-red-400 text-black px-6 py-2 rounded text-[10px] uppercase font-bold hover:bg-red-300 active:scale-[0.96] transition-[background-color,transform]"
                >
                  {identity?.id === groupDeleteTarget.ownerId ? 'Delete For Everyone' : 'Remove Locally'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create Group Modal */}
      <AnimatePresence>
        {showCreateGroup && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateGroup(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-md bg-surface border border-border rounded-xl p-6 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <Users className="w-5 h-5 text-brand" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-brand">Establish Mesh Group</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-40 mb-2">Group Name</label>
                  <input 
                    type="text" 
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full bg-bg border border-border rounded px-3 py-2 text-sm font-mono focus:border-brand outline-none transition-colors"
                    placeholder="Operation Alpha..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-40 mb-2">Select Members</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-2 terminal-scroll">
                    {peers.map(peerId => (
                      <label key={peerId} className="flex items-center gap-3 p-2 rounded bg-bg border border-border cursor-pointer hover:border-brand/40 transition-colors">
                        <input 
                          type="checkbox" 
                          checked={selectedPeers.includes(peerId)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedPeers(prev => [...prev, peerId]);
                            else setSelectedPeers(prev => prev.filter(id => id !== peerId));
                          }}
                          className="accent-brand"
                        />
                        <div className="overflow-hidden">
                          <div className="text-xs font-bold truncate">{iroh.getPeerName(peerId) || `Node_${peerId.slice(0, 4)}`}</div>
                          <div className="text-[8px] opacity-30 font-mono truncate">{peerId}</div>
                        </div>
                      </label>
                    ))}
                    {peers.length === 0 && (
                      <p className="text-[10px] opacity-30 italic text-center py-4 uppercase tracking-tighter">Connect to peers first to create a group</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-border flex justify-end gap-3">
                  <button 
                    onClick={() => setShowCreateGroup(false)}
                    className="px-4 py-2 text-[10px] uppercase font-bold opacity-50 hover:opacity-100 transition-opacity"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleCreateGroup}
                    disabled={!groupName.trim() || selectedPeers.length === 0}
                    className="bg-brand text-black px-6 py-2 rounded text-[10px] uppercase font-bold hover:opacity-90 disabled:opacity-30 transition-opacity"
                  >
                    Instantiate Mesh
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
