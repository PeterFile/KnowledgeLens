// Embedding service for Offscreen Document
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let initPromise: Promise<void> | null = null;

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

async function initializeModel(): Promise<void> {
  if (embeddingPipeline) return;

  console.log('[Embedding] Initializing model...');

  try {
    // @ts-expect-error - transformers.js types are complex
    embeddingPipeline = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      device: 'webgpu',
    });
    console.log('[Embedding] Model loaded with WebGPU');
  } catch (error) {
    console.warn('[Embedding] WebGPU failed, falling back to WASM:', error);
    embeddingPipeline = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
    });
    console.log('[Embedding] Model loaded with WASM');
  }
}

export async function ensureInitialized(): Promise<void> {
  if (embeddingPipeline) return;
  if (!initPromise) {
    initPromise = initializeModel();
  }
  await initPromise;
}

export async function computeEmbeddings(texts: string[]): Promise<number[][]> {
  await ensureInitialized();
  if (!embeddingPipeline) throw new Error('Model not initialized');

  const results: number[][] = [];

  for (const text of texts) {
    const output = await embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    });
    // output.data is Float32Array, convert to number[]
    results.push(Array.from(output.data as Float32Array));
  }

  return results;
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
