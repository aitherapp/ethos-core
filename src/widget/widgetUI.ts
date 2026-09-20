import { APP_VERSION } from '../version';
import {
  type WidgetConnectionStatus,
  widgetStatusDotClass,
  widgetStatusLabel,
} from './connectionStatus';
import { WidgetConfig } from './widgetCore';

export interface WidgetUI {
  container: HTMLElement;
  shadowRoot: ShadowRoot;
  toggleButton: HTMLButtonElement;
  chatWindow: HTMLElement;
  messageLog: HTMLElement;
  inputField: HTMLInputElement;
  sendButton: HTMLButtonElement;
  setConnectionStatus: (status: WidgetConnectionStatus) => void;
}

export function createWidgetDOM(config: WidgetConfig): WidgetUI {
  const container = document.createElement('div');
  container.id = 'ethos-widget-root';
  document.body.appendChild(container);

  const shadowRoot = container.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    
    .ethos-launcher {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      border-radius: 30px;
      background: ${config.primaryColor};
      color: #ffffff;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .ethos-launcher:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }
    .ethos-launcher svg {
      width: 28px;
      height: 28px;
      fill: currentColor;
    }

    .ethos-chat-window {
      position: fixed;
      bottom: 90px;
      right: 20px;
      width: 360px;
      max-width: calc(100vw - 40px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16);
      display: flex;
      flex-direction: column;
      z-index: 99999;
      opacity: 0;
      transform: translateY(20px) scale(0.95);
      pointer-events: none;
      transition: opacity 0.25s ease, transform 0.25s ease;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }

    .ethos-chat-window.open {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .ethos-header {
      background: ${config.primaryColor};
      color: #ffffff;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ethos-header-title {
      font-weight: 600;
      font-size: 16px;
    }
    .ethos-header-subtitle {
      font-size: 12px;
      opacity: 0.8;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
    }
    .ethos-online-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }
    .ethos-online-dot--connecting { background: #f59e0b; }
    .ethos-online-dot--direct { background: #22c55e; }
    .ethos-online-dot--relay { background: #3b82f6; }
    .ethos-online-dot--offline { background: #9ca3af; }

    .ethos-messages {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: #f9fafb;
    }

    .ethos-msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
      word-break: break-word;
    }
    .ethos-msg.owner {
      align-self: flex-start;
      background: #ffffff;
      color: #1f2937;
      border: 1px solid #e5e7eb;
    }
    .ethos-msg.visitor {
      align-self: flex-end;
      background: ${config.primaryColor};
      color: #ffffff;
    }

    .ethos-input-area {
      padding: 12px;
      background: #ffffff;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 8px;
    }
    .ethos-input {
      flex: 1;
      border: 1px solid #d1d5db;
      border-radius: 20px;
      padding: 10px 16px;
      font-size: 14px;
      outline: none;
    }
    .ethos-input:focus {
      border-color: ${config.primaryColor};
    }
    .ethos-send-btn {
      background: ${config.primaryColor};
      color: #ffffff;
      border: none;
      border-radius: 20px;
      padding: 0 16px;
      font-weight: 600;
      cursor: pointer;
      font-size: 14px;
    }

    .ethos-footer {
      padding: 8px;
      text-align: center;
      background: #f3f4f6;
      font-size: 11px;
      color: #6b7280;
      border-top: 1px solid #f3f4f6;
    }
    .ethos-footer a {
      color: #4b5563;
      text-decoration: none;
      font-weight: 600;
    }
    .ethos-footer a:hover {
      text-decoration: underline;
    }
  `;

  const toggleButton = document.createElement('button');
  toggleButton.className = 'ethos-launcher';
  toggleButton.innerHTML = `
    <svg viewBox="0 0 24 24">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/>
    </svg>
  `;

  const chatWindow = document.createElement('div');
  chatWindow.className = 'ethos-chat-window';

  const header = document.createElement('div');
  header.className = 'ethos-header';
  header.innerHTML = `
    <div>
      <div class="ethos-header-title">${config.title}</div>
      <div class="ethos-header-subtitle">
        <span class="ethos-online-dot ethos-online-dot--connecting"></span>
        <span class="ethos-header-status-text">Connecting…</span>
      </div>
    </div>
  `;

  const statusDot = header.querySelector('.ethos-online-dot') as HTMLSpanElement;
  const statusText = header.querySelector('.ethos-header-status-text') as HTMLSpanElement;

  function setConnectionStatus(status: WidgetConnectionStatus): void {
    statusDot.className = widgetStatusDotClass(status);
    statusText.textContent = widgetStatusLabel(status);
  }

  const messageLog = document.createElement('div');
  messageLog.className = 'ethos-messages';

  if (config.greeting) {
    const greetingMsg = document.createElement('div');
    greetingMsg.className = 'ethos-msg owner';
    greetingMsg.textContent = config.greeting;
    messageLog.appendChild(greetingMsg);
  }

  const inputArea = document.createElement('div');
  inputArea.className = 'ethos-input-area';

  const inputField = document.createElement('input');
  inputField.className = 'ethos-input';
  inputField.placeholder = 'Write a message...';

  const sendButton = document.createElement('button');
  sendButton.className = 'ethos-send-btn';
  sendButton.textContent = 'Send';

  inputArea.appendChild(inputField);
  inputArea.appendChild(sendButton);

  const footer = document.createElement('div');
  footer.className = 'ethos-footer';
  footer.innerHTML = `
    ETHOS widget v${APP_VERSION} · <a href="https://github.com/aitherapp/ethos-core" target="_blank" rel="noopener noreferrer">GitHub</a>
  `;

  chatWindow.appendChild(header);
  chatWindow.appendChild(messageLog);
  chatWindow.appendChild(inputArea);
  chatWindow.appendChild(footer);

  shadowRoot.appendChild(style);
  shadowRoot.appendChild(toggleButton);
  shadowRoot.appendChild(chatWindow);

  toggleButton.addEventListener('click', () => {
    chatWindow.classList.toggle('open');
  });

  return {
    container,
    shadowRoot,
    toggleButton,
    chatWindow,
    messageLog,
    inputField,
    sendButton,
    setConnectionStatus,
  };
}
