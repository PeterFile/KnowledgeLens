// Sandbox page for embedding computation
// Sandbox pages have relaxed CSP allowing dynamic script loading from CDN
// Communication with extension pages via window.postMessage

import type { FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let initPromise: Promise<void> | null = null;

type TransformersModule = typeof import('@huggingface/transformers');

let transformersPromise: Promise<TransformersModule> | null = null;
let transformersConfigured = false;

async function loadTransformers(): Promise<TransformersModule> {
  if (!transformersPromise) {
    transformersPromise = import('@huggingface/transformers');
  }
  return transformersPromise;
}

async function configureTransformersEnv(): Promise<void> {
  if (transformersConfigured) return;
  const { env } = await loadTransformers();

  // Configure transformers.js to use local ONNX Runtime WASM files
  // This bypasses CSP restrictions on dynamic CDN imports
  env.allowLocalModels = false;
  // Disable browser cache - sandbox pages cannot access Cache Storage
  // without 'allow-same-origin' flag
  env.useBrowserCache = false;

  // Get the extension's base URL for WASM files
  // In sandbox context, we need to construct the path manually
  const extensionOrigin = new URL(document.location.href).origin;
  const wasmPath = `${extensionOrigin}/assets/onnx/`;

  // Configure ONNX Runtime to use local WASM files
  // Use optional chaining and ensure the path is set
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = wasmPath;
  }

  console.log('[Sandbox] WASM path configured:', wasmPath);
  transformersConfigured = true;
}

async function initializeModel(): Promise<void> {
  if (embeddingPipeline) return;

  console.log('[Sandbox] Initializing embedding model...');

  try {
    await configureTransformersEnv();
    const { pipeline } = await loadTransformers();
    // @ts-expect-error - transformers.js types are too complex
    embeddingPipeline = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      device: 'webgpu',
    });
    console.log('[Sandbox] Model loaded with WebGPU');
  } catch (error) {
    console.warn('[Sandbox] WebGPU failed, falling back to WASM:', error);
    try {
      await configureTransformersEnv();
      const { pipeline } = await loadTransformers();
      embeddingPipeline = await pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8',
      });
      console.log('[Sandbox] Model loaded with WASM');
    } catch (wasmError) {
      console.error('[Sandbox] WASM also failed:', wasmError);
      throw wasmError;
    }
  }
}

async function ensureInitialized(): Promise<void> {
  if (embeddingPipeline) return;
  if (!initPromise) {
    initPromise = initializeModel();
  }
  await initPromise;
}

async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  await ensureInitialized();
  if (!embeddingPipeline) throw new Error('Model not initialized');

  const results: number[][] = [];

  for (const text of texts) {
    const output = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    });
    results.push(Array.from(output.data as Float32Array));
  }

  return results;
}

// Listen for messages from parent (offscreen document)
window.addEventListener('message', async (event) => {
  const { action, texts, requestId } = event.data;

  if (action === 'preload') {
    try {
      await ensureInitialized();
      window.parent.postMessage({ action: 'preload_response', success: true, requestId }, '*');
    } catch (error) {
      window.parent.postMessage(
        {
          action: 'preload_response',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId,
        },
        '*'
      );
    }
  }

  if (action === 'compute') {
    try {
      const embeddings = await computeEmbeddings(texts);
      window.parent.postMessage(
        {
          action: 'compute_response',
          success: true,
          embeddings,
          requestId,
        },
        '*'
      );
    } catch (error) {
      window.parent.postMessage(
        {
          action: 'compute_response',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          requestId,
        },
        '*'
      );
    }
  }
});

console.log('[Sandbox] Embedding sandbox loaded');
