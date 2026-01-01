// Embedding service for Offscreen Document
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
// Uses sandbox iframe for embedding computation to bypass CSP restrictions

let sandboxIframe: HTMLIFrameElement | null = null;
let sandboxReady = false;
const pendingRequests = new Map<
  string,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }
>();

function ensureSandbox(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sandboxReady && sandboxIframe) {
      resolve();
      return;
    }

    if (sandboxIframe) {
      // Already loading
      const checkReady = setInterval(() => {
        if (sandboxReady) {
          clearInterval(checkReady);
          resolve();
        }
      }, 100);
      return;
    }

    console.log('[Embedding] Creating sandbox iframe...');
    sandboxIframe = document.createElement('iframe');
    sandboxIframe.src = chrome.runtime.getURL('src/sandbox/sandbox.html');
    sandboxIframe.style.display = 'none';
    document.body.appendChild(sandboxIframe);

    sandboxIframe.onload = () => {
      console.log('[Embedding] Sandbox iframe loaded');
      sandboxReady = true;
      resolve();
    };

    sandboxIframe.onerror = () => {
      reject(new Error('Failed to load sandbox iframe'));
    };
  });
}

// Listen for messages from sandbox
window.addEventListener('message', (event) => {
  const { action, requestId, success, embeddings, error } = event.data;

  if (action === 'preload_response' || action === 'compute_response') {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      pendingRequests.delete(requestId);
      if (success) {
        pending.resolve(embeddings || true);
      } else {
        pending.reject(new Error(error || 'Unknown error'));
      }
    }
  }
});

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function ensureInitialized(): Promise<void> {
  await ensureSandbox();

  const requestId = generateRequestId();

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, {
      resolve: () => resolve(),
      reject,
    });

    sandboxIframe?.contentWindow?.postMessage(
      {
        action: 'preload',
        requestId,
      },
      '*'
    );

    // Timeout after 60 seconds for model loading
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Preload timeout'));
      }
    }, 60000);
  });
}

export async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  await ensureSandbox();

  const requestId = generateRequestId();

  return new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve: resolve as (value: unknown) => void, reject });

    sandboxIframe?.contentWindow?.postMessage(
      {
        action: 'compute',
        texts,
        requestId,
      },
      '*'
    );

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('Compute timeout'));
      }
    }, 30000);
  });
}

export interface EmbeddingRequest {
  action: 'compute_embedding';
  texts: string[];
  requestId: string;
}

export interface EmbeddingResponse {
  action: 'embedding_response';
  success: true;
  requestId: string;
  embeddings: number[][];
}

export interface EmbeddingErrorResponse {
  action: 'embedding_response';
  success: false;
  requestId: string;
  error: string;
}

export async function handleEmbeddingRequest(
  request: EmbeddingRequest
): Promise<EmbeddingResponse | EmbeddingErrorResponse> {
  try {
    const embeddings = await computeEmbeddings(request.texts);
    return {
      action: 'embedding_response',
      success: true,
      requestId: request.requestId,
      embeddings,
    };
  } catch (error) {
    return {
      action: 'embedding_response',
      success: false,
      requestId: request.requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
