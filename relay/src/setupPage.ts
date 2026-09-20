export type SetupPageState =
  | { kind: 'reveal'; relayUrl: string; authToken: string }
  | { kind: 'claimed'; relayUrl: string }
  | { kind: 'secrets'; relayUrl: string };

export { claimRelayConfig } from './relayConfig';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #111; }
  h1 { font-size: 1.5rem; }
  code, .mono { font-family: ui-monospace, monospace; font-size: 0.9rem; word-break: break-all; }
  .field { background: #f4f4f5; padding: 0.75rem; border-radius: 6px; margin: 0.5rem 0; }
  button { cursor: pointer; margin-top: 0.25rem; padding: 0.35rem 0.75rem; }
  .warn { background: #fef3c7; border: 1px solid #f59e0b; padding: 0.75rem; border-radius: 6px; margin: 1rem 0; }
  ol { padding-left: 1.25rem; }
  .note { color: #52525b; font-size: 0.9rem; margin-top: 1.5rem; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function copyButton(label: string, valueId: string): string {
  return `<button type="button" onclick="navigator.clipboard.writeText(document.getElementById('${valueId}').textContent)">${escapeHtml(label)}</button>`;
}

function renderReveal(state: Extract<SetupPageState, { kind: 'reveal' }>): string {
  const relayUrl = escapeHtml(state.relayUrl);
  const authToken = escapeHtml(state.authToken);
  const tokenJs = JSON.stringify(state.authToken);
  const body = `
<h1>ETHOS Private Relay setup</h1>
<p class="warn"><strong>Important:</strong> This auth token is shown <strong>once</strong>. Open this page yourself right after deploy. Do not share this URL until you have saved the token in ETHOS.</p>
<p>Relay URL (WebSocket)</p>
<div class="field"><span class="mono" id="relay-url">${relayUrl}</span></div>
${copyButton('Copy relay URL', 'relay-url')}
<p>Auth token</p>
<div class="field"><span class="mono" id="auth-token">${authToken}</span></div>
${copyButton('Copy auth token', 'auth-token')}
<h2>Next steps</h2>
<ol>
  <li>Open ETHOS in your browser.</li>
  <li>Go to <strong>Settings</strong>.</li>
  <li>Enable <strong>private relay</strong>.</li>
  <li>Paste the <strong>Relay URL</strong> and <strong>Auth token</strong> above, then save your settings.</li>
</ol>
<p><button type="button" id="claim-btn">I've saved this</button></p>
<p id="claim-error" class="warn" hidden></p>
<script>
(function () {
  var token = ${tokenJs};
  var errEl = document.getElementById('claim-error');
  document.getElementById('claim-btn').addEventListener('click', function () {
    errEl.hidden = true;
    fetch('/v1/setup/claim', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
    }).then(function (response) {
      if (response.ok) {
        location.reload();
        return;
      }
      errEl.textContent = 'Could not confirm. Check your connection and try again.';
      errEl.hidden = false;
    }).catch(function () {
      errEl.textContent = 'Could not confirm. Check your connection and try again.';
      errEl.hidden = false;
    });
  });
})();
</script>`;
  return pageShell('ETHOS Private Relay setup', body);
}

function renderClaimed(state: Extract<SetupPageState, { kind: 'claimed' }>): string {
  const relayUrl = escapeHtml(state.relayUrl);
  const body = `
<h1>Already set up</h1>
<p>This private relay is already configured. Use the same relay URL and auth token in ETHOS <strong>Settings</strong> under <strong>private relay</strong>.</p>
<p>Relay URL: <span class="mono">${relayUrl}</span></p>
<p class="note">The auth token is not shown again for security. If you lost it, use the advanced CLI path in the relay README.</p>`;
  return pageShell('ETHOS Private Relay', body);
}

function renderSecrets(state: Extract<SetupPageState, { kind: 'secrets' }>): string {
  const relayUrl = escapeHtml(state.relayUrl);
  const body = `
<h1>ETHOS Private Relay</h1>
<p>Configured via Cloudflare Secrets. Credentials are managed outside this setup page.</p>
<p>Relay URL: <span class="mono">${relayUrl}</span></p>
<p class="note"><strong>Advanced:</strong> When <code>AUTH_TOKEN</code> is set in Cloudflare, KV bootstrap and token reveal are skipped.</p>`;
  return pageShell('ETHOS Private Relay', body);
}

export function renderSetupPageHtml(state: SetupPageState): string {
  switch (state.kind) {
    case 'reveal':
      return renderReveal(state);
    case 'claimed':
      return renderClaimed(state);
    case 'secrets':
      return renderSecrets(state);
  }
}

/** Convert an https origin to the wss URL clients paste into ETHOS. */
export function httpsOriginToWss(origin: string): string {
  try {
    const u = new URL(origin);
    u.protocol = u.protocol === 'http:' ? 'ws:' : 'wss:';
    return u.origin;
  } catch {
    return origin.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
  }
}
