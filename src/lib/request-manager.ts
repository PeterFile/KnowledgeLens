export interface ActiveRequest {
  id: string;
  controller: AbortController;
  startTime: number;
}

const activeRequests = new Map<string, ActiveRequest>();

let requestCounter = 0;

function generateId(): string {
  return `req_${Date.now()}_${++requestCounter}`;
}

/**
 * Create a new tracked request with AbortController.
 */
export function create(requestId?: string): ActiveRequest {
  const id = requestId || generateId();
  const controller = new AbortController();
  const request: ActiveRequest = {
    id,
    controller,
    startTime: Date.now(),
  };
  activeRequests.set(id, request);
  return request;
}

/**
 * Cancel a specific request by ID.
 * Returns true if the request was found and cancelled.
 */
export function cancel(id: string): boolean {
  const request = activeRequests.get(id);
  if (!request) return false;

  request.controller.abort();
  activeRequests.delete(id);
  return true;
}

/**
 * Cancel all active requests.
 */
export function cancelAll(): void {
  for (const request of activeRequests.values()) {
    request.controller.abort();
  }
  activeRequests.clear();
}

/**
 * Get an active request by ID.
 */
export function get(id: string): ActiveRequest | undefined {
  return activeRequests.get(id);
}

/**
 * Remove a completed request from tracking.
 * Call this when a request completes successfully.
 */
export function complete(id: string): void {
  activeRequests.delete(id);
}

/**
 * Get the count of active requests.
 */
export function getActiveCount(): number {
  return activeRequests.size;
}
