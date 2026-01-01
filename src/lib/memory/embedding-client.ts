// Embedding client for communicating with Offscreen Document
// Requirements: 3.5, 3.6, 3.7

type InitState = 'idle' | 'initializing' | 'ready' | 'error';

interface PendingRequest {
  texts: string[];
  resolve: (embeddings: number[][]) => void;
  reject: (error: Error) => void;
}

const OFFSCREEN_URL = 'src/offscreen/offscreen.html';
const REQUEST_TIMEOUT = 30000;

let initState: InitState = 'idle';
let initPromise: Promise<void> | null = null;
const pendingQueue: PendingRequest[] = [];
const inflightRequests = new Map<
  string,
  {
    resolve: (embeddings: number[][]) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }
>();

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: 'Compute text embeddings using WebGPU',
  });
}

async function initialize(): Promise<void> {
  if (initState === 'ready') return;
  if (initState === 'initializing' && initPromise) return initPromise;

  initState = 'initializing';
  initPromise = (async () => {
    try {
      await ensureOffscreenDocument();

      // Preload the model
      await chrome.runtime.sendMessage({ action: 'preload_embedding' });

      initState = 'ready';
      processQueue();
    } catch (error) {
      initState = 'error';
      throw error;
    }
  })();

  return initPromise;
}

function processQueue(): void {
  while (pendingQueue.length > 0 && initState === 'ready') {
    const request = pendingQueue.shift()!;
    sendRequest(request.texts).then(request.resolve).catch(request.reject);
  }
}

async function sendRequest(texts: string[]): Promise<number[][]> {
  const requestId = generateRequestId();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      inflightRequests.delete(requestId);
      reject(new Error('Embedding request timeout'));
    }, REQUEST_TIMEOUT);

    inflightRequests.set(requestId, { resolve, reject, timeout });

    chrome.runtime.sendMessage({
      action: 'compute_embedding',
      texts,
      requestId,
    });
  });
}

// Listen for responses from offscreen document
chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== 'embedding_response') return;

  const request = inflightRequests.get(message.requestId);
  if (!request) return;

  clearTimeout(request.timeout);
  inflightRequests.delete(message.requestId);

  if (message.success) {
    request.resolve(message.embeddings);
  } else {
    request.reject(new Error(message.error));
  }
});

export async function computeEmbedding(text: string): Promise<number[]> {
  const results = await computeEmbeddings([text]);
  return results[0];
}

export async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  if (initState === 'ready') {
    return sendRequest(texts);
  }

  if (initState === 'idle' || initState === 'error') {
    initialize().catch(console.error);
  }

  // Queue the request
  return new Promise((resolve, reject) => {
    pendingQueue.push({ texts, resolve, reject });
  });
}

export function isReady(): boolean {
  return initState === 'ready';
}

export function getState(): InitState {
  return initState;
}

export async function preload(): Promise<void> {
  await initialize();
}
