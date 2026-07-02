import { ArrowRight, FileKey2, Heart, Lock, Network, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { ETHOS_MONERO_DONATION_ADDRESS } from './lib/donations';
import { getAppLaunchHash } from './lib/appRoute';

const features = [
  {
    title: 'No account or phone number',
    body: 'Each browser creates its own cryptographic node. Share a peer ticket when you want to connect.',
    icon: ShieldCheck,
  },
  {
    title: 'Hybrid quantum-safe sessions',
    body: 'ETHOS combines ECDH P-256 with ML-KEM-1024 and keeps message keys evolving over time.',
    icon: Lock,
  },
  {
    title: 'Encrypted relay fallback',
    body: 'When WebRTC fails, messages and small transfers can still move through encrypted relay transport.',
    icon: Network,
  },
  {
    title: 'Encrypted groups and files',
    body: 'One-to-one chat, group chat, file transfer, and local history use the same no-plaintext-fallback rule.',
    icon: FileKey2,
  },
];

const comparisonRows = [
  {
    label: 'Best fit',
    ethos: 'Accountless private chat from a browser',
    signal: 'Mature private messenger',
    whatsapp: 'Mass-market encrypted messenger',
  },
  {
    label: 'Signup',
    ethos: 'No account, phone number, or email',
    signal: 'Phone number required to register',
    whatsapp: 'Phone number required',
  },
  {
    label: 'Default content encryption',
    ethos: 'End-to-end encrypted',
    signal: 'End-to-end encrypted',
    whatsapp: 'End-to-end encrypted',
  },
  {
    label: 'Quantum-safe layer',
    ethos: 'Hybrid ECDH + ML-KEM-1024 in ETHOS sessions',
    signal: 'PQXDH adds post-quantum key agreement',
    whatsapp: 'No confirmed post-quantum message layer',
  },
  {
    label: 'Transport model',
    ethos: 'Direct WebRTC when possible, encrypted relay fallback when needed',
    signal: 'Service-operated messaging infrastructure',
    whatsapp: 'Meta-operated messaging infrastructure',
  },
  {
    label: 'Local data',
    ethos: 'Encrypted browser history with optional passphrase lock',
    signal: 'Device-local encrypted app storage',
    whatsapp: 'Device-local app storage plus optional backups',
  },
  {
    label: 'Maturity',
    ethos: 'Experimental, not independently audited',
    signal: 'Mature and widely scrutinized',
    whatsapp: 'Mature and widely deployed',
  },
];

const trustLinks = [
  {
    title: 'Warrant canary',
    href: './trust/canary.txt',
    body: 'A weekly public statement about compelled backdoors, key disclosure, targeted malicious builds, and privacy compromise.',
  },
  {
    title: 'Cryptographic design',
    href: './trust/cryptographic-design.md',
    body: 'The public design note for ETHOS key exchange, message encryption, relay metadata limits, local data, and audit status.',
  },
  {
    title: 'Reproducible builds',
    href: './trust/reproducible-builds.md',
    body: 'How supporters with source access can rebuild the app and compare it against public release hashes.',
  },
];

const launchApp = () => {
  window.location.hash = getAppLaunchHash();
};

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-bg text-gray-100">
      <section className="relative border-b border-brand/15">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,255,65,0.18),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(0,255,136,0.12),transparent_24%)]" />
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#00ff41_1px,transparent_1px),linear-gradient(90deg,#00ff41_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 sm:px-10 lg:px-12">
          <nav className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src="./ethos-icon.svg" alt="" className="h-9 w-9 rounded-xl border border-brand/20 bg-black/40 p-1.5" />
              <div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.35em] text-brand">ETHOS</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-gray-500">Secure peer-to-peer messaging</div>
              </div>
            </div>
            <button
              type="button"
              onClick={launchApp}
              className="rounded-full border border-brand/30 bg-brand px-5 py-2 text-[10px] font-black uppercase tracking-[0.22em] text-black shadow-[0_0_30px_rgba(0,255,65,0.2)] transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]"
            >
              Launch
            </button>
          </nav>

          <div className="grid flex-1 items-center gap-12 py-20 lg:grid-cols-[1.08fr_0.92fr]">
            <div>
              <p className="mb-5 inline-flex rounded-full border border-brand/20 bg-brand/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-brand">
                Browser-based private messaging
              </p>
              <h1 className="max-w-4xl text-balance text-5xl font-black uppercase tracking-[-0.08em] text-white sm:text-7xl lg:text-8xl">
                Encrypted messaging without accounts.
              </h1>
              <p className="mt-7 max-w-2xl text-pretty text-sm leading-7 text-gray-300 sm:text-base">
                ETHOS is a secure web app for one-to-one chat, group chat, and file transfer. It uses
                hybrid quantum-safe key exchange, direct WebRTC when possible, and encrypted relay fallback
                when networks get in the way.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={launchApp}
                  className="group inline-flex items-center justify-center gap-3 rounded-xl bg-brand px-6 py-4 text-xs font-black uppercase tracking-[0.24em] text-black transition-[opacity,transform] hover:opacity-90 active:scale-[0.96]"
                >
                  Launch ETHOS <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <a
                  href="#security"
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-black/30 px-6 py-4 text-xs font-bold uppercase tracking-[0.24em] text-gray-200 transition-colors hover:border-brand hover:text-brand"
                >
                  Read Security Model
                </a>
                <a
                  href="#verify"
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-black/30 px-6 py-4 text-xs font-bold uppercase tracking-[0.24em] text-gray-200 transition-colors hover:border-brand hover:text-brand"
                >
                  Verify ETHOS
                </a>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-8 rounded-[3rem] bg-brand/10 blur-3xl" />
              <div className="relative rounded-[2rem] border border-brand/20 bg-black/70 p-5 shadow-2xl">
                <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
                  <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-brand">Secure Tunnel Preview</div>
                  <div className="h-2 w-2 rounded-full bg-brand shadow-[0_0_18px_#00ff41]" />
                </div>
                <div className="space-y-3">
                  {['Generate local node identity', 'Exchange peer ticket', 'Confirm hybrid PQ session', 'Send encrypted messages/files'].map((item, index) => (
                    <div key={item} className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface/70 p-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 font-mono text-[10px] font-bold text-brand">
                        0{index + 1}
                      </div>
                      <div className="text-xs font-bold uppercase tracking-[0.14em] text-gray-200">{item}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-xl border border-orange-400/20 bg-orange-400/5 p-4 text-[11px] leading-relaxed text-orange-100/80">
                  Honest limit: ETHOS is experimental and not independently audited. Relays should not read content,
                  but may still observe timing and routing metadata.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-6 py-20 sm:px-10 md:grid-cols-2 lg:grid-cols-4 lg:px-12">
        {features.map(feature => {
          const Icon = feature.icon;
          return (
            <article key={feature.title} className="rounded-2xl border border-border bg-surface/60 p-6">
              <Icon className="mb-5 h-6 w-6 text-brand" />
              <h2 className="text-sm font-black uppercase tracking-[0.16em] text-white">{feature.title}</h2>
              <p className="mt-3 text-xs leading-6 text-gray-400">{feature.body}</p>
            </article>
          );
        })}
      </section>

      <section id="security" className="border-y border-border bg-black/35">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 sm:px-10 lg:grid-cols-2 lg:px-12">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-brand">Trust model</p>
            <h2 className="mt-4 text-3xl font-black uppercase tracking-[-0.05em] text-white sm:text-5xl">
              Strong claims, clear limits.
            </h2>
          </div>
          <div className="space-y-5 text-sm leading-7 text-gray-300">
            <p>
              ETHOS never adds a plaintext fallback. User content is encrypted before it leaves the browser,
              including when public relays are used for resilient delivery.
            </p>
            <p>
              It does not claim to hide all metadata, protect a fully compromised device, or replace mature
              audited messengers for high-risk users today. Advanced users can add trusted relays for more
              control over the relay path.
            </p>
          </div>
        </div>
      </section>

      <section id="verify" className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-12">
        <div className="mb-10 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-brand">Verify ETHOS</p>
            <h2 className="mt-4 max-w-3xl text-3xl font-black uppercase tracking-[-0.05em] text-white sm:text-5xl">
              Don't trust us. Check the paper trail.
            </h2>
          </div>
          <p className="text-sm leading-7 text-gray-300">
            ETHOS is not asking you to accept a privacy slogan. Public users can inspect the canary,
            cryptographic design, and release receipts. Supporters with source access can go further:
            inspect the implementation and reproduce release builds.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {trustLinks.map(link => (
            <a
              key={link.href}
              href={link.href}
              className="group rounded-2xl border border-brand/20 bg-black/45 p-6 transition-[border-color,transform] hover:-translate-y-1 hover:border-brand"
            >
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-white group-hover:text-brand">{link.title}</h3>
              <p className="mt-4 text-xs leading-6 text-gray-400">{link.body}</p>
              <span className="mt-5 inline-flex font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-brand">
                Open artifact
              </span>
            </a>
          ))}
        </div>
      </section>

      <section id="compare" className="mx-auto max-w-7xl px-6 py-20 sm:px-10 lg:px-12">
        <div className="mb-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-brand">Comparison</p>
            <h2 className="mt-4 max-w-3xl text-3xl font-black uppercase tracking-[-0.05em] text-white sm:text-5xl">
              ETHOS is different, not a Signal replacement.
            </h2>
          </div>
          <p className="max-w-xl text-xs leading-6 text-gray-400">
            This comparison uses public product behavior and security documentation. Signal and WhatsApp are
            mature messengers; ETHOS is experimental software built for accountless browser sessions.
          </p>
        </div>

        <div className="overflow-hidden rounded-[1.75rem] border border-brand/20 bg-black/45 shadow-[0_0_50px_rgba(0,255,65,0.08)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-left">
              <caption className="sr-only">Comparison between ETHOS, Signal, and WhatsApp</caption>
              <thead>
                <tr className="border-b border-brand/20 bg-brand/10">
                  <th scope="col" className="w-[18%] px-5 py-5 font-mono text-[10px] uppercase tracking-[0.24em] text-gray-400">
                    Category
                  </th>
                  <th scope="col" className="w-[30%] px-5 py-5 font-mono text-[10px] uppercase tracking-[0.24em] text-brand">
                    ETHOS
                  </th>
                  <th scope="col" className="w-[26%] px-5 py-5 font-mono text-[10px] uppercase tracking-[0.24em] text-gray-300">
                    Signal
                  </th>
                  <th scope="col" className="w-[26%] px-5 py-5 font-mono text-[10px] uppercase tracking-[0.24em] text-gray-300">
                    WhatsApp
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(row => (
                  <tr key={row.label} className="border-b border-border/70 last:border-b-0">
                    <th scope="row" className="px-5 py-5 align-top text-[11px] font-black uppercase tracking-[0.16em] text-white">
                      {row.label}
                    </th>
                    <td className="border-l border-brand/10 bg-brand/[0.03] px-5 py-5 align-top text-sm leading-6 text-gray-100">
                      {row.ethos}
                    </td>
                    <td className="border-l border-border/70 px-5 py-5 align-top text-sm leading-6 text-gray-300">
                      {row.signal}
                    </td>
                    <td className="border-l border-border/70 px-5 py-5 align-top text-sm leading-6 text-gray-300">
                      {row.whatsapp}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-20 sm:px-10 lg:grid-cols-3 lg:px-12">
        <article className="rounded-2xl border border-border bg-surface/60 p-6">
          <Smartphone className="mb-5 h-6 w-6 text-brand" />
          <h2 className="text-sm font-black uppercase tracking-[0.16em]">Works In The Browser</h2>
          <p className="mt-3 text-xs leading-6 text-gray-400">Use ETHOS on mobile and desktop browsers without creating an account or managing infrastructure.</p>
        </article>
        <article className="rounded-2xl border border-border bg-surface/60 p-6">
          <Users className="mb-5 h-6 w-6 text-brand" />
          <h2 className="text-sm font-black uppercase tracking-[0.16em]">Groups From Peer Tickets</h2>
          <p className="mt-3 text-xs leading-6 text-gray-400">Group membership is stored locally and group messages fan out over secure per-peer channels.</p>
        </article>
        <article className="rounded-2xl border border-brand/25 bg-brand/5 p-6">
          <Heart className="mb-5 h-6 w-6 text-brand" />
          <h2 className="text-sm font-black uppercase tracking-[0.16em]">Support With Monero</h2>
          <p className="mt-3 break-all font-mono text-[10px] leading-5 text-gray-300">{ETHOS_MONERO_DONATION_ADDRESS}</p>
        </article>
      </section>

      <footer className="border-t border-border px-6 py-10 sm:px-10 lg:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono uppercase tracking-[0.2em]">ETHOS Core // no account secure messaging</p>
          <div className="flex flex-wrap gap-4">
            <button type="button" onClick={launchApp} className="text-brand hover:underline">Launch app</button>
            <a href="#security" className="hover:text-brand">Security model</a>
            <a href="#verify" className="hover:text-brand">Verify ETHOS</a>
            <a href="./trust/canary.txt" className="hover:text-brand">Canary</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
