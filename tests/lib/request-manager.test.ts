import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  create,
  cancel,
  cancelAll,
  get,
  complete,
  getActiveCount,
} from '../../src/lib/request-manager';

/**
 * **Feature: knowledge-lens, Property 15: Request cancellation stops processing**
 * **Validates: Requirements 9.2**
 *
 * For any active API request, calling cancel with its requestId SHALL cause
 * the request to abort and not invoke further callbacks.
 */
describe('Property 15: Request cancellation stops processing', () => {
  beforeEach(() => {
    // Clean up any lingering requests between tests
    cancelAll();
  });

  it('cancelled request has aborted signal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (requestCount) => {
        // Create multiple requests
        const requests = Array.from({ length: requestCount }, () => create());

        // Pick a random request to cancel
        const targetIndex = Math.floor(Math.random() * requestCount);
        const targetRequest = requests[targetIndex];

        // Signal should not be aborted before cancel
        expect(targetRequest.controller.signal.aborted).toBe(false);

        // Cancel the request
        const cancelled = cancel(targetRequest.id);

        // Verify cancellation succeeded and signal is aborted
        expect(cancelled).toBe(true);
        expect(targetRequest.controller.signal.aborted).toBe(true);

        // Clean up remaining requests
        cancelAll();
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('cancelled request is removed from active tracking', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), (requestCount) => {
        const requests = Array.from({ length: requestCount }, () => create());
        const initialCount = getActiveCount();

        // Cancel each request one by one
        for (const request of requests) {
          cancel(request.id);
        }

        // All requests should be removed
        return getActiveCount() === 0 && initialCount === requestCount;
      }),
      { numRuns: 100 }
    );
  });

  it('cancel returns false for non-existent request', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (fakeId) => {
          // Ensure no collision with real request IDs
          const nonExistentId = `fake_${fakeId}_${Date.now()}`;
          return cancel(nonExistentId) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('cancelAll aborts all active requests', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 15 }), (requestCount) => {
        const requests = Array.from({ length: requestCount }, () => create());

        // All signals should start non-aborted
        const allNotAbortedBefore = requests.every(
          (r) => !r.controller.signal.aborted
        );

        cancelAll();

        // All signals should be aborted after cancelAll
        const allAbortedAfter = requests.every(
          (r) => r.controller.signal.aborted
        );

        // No active requests should remain
        const noActiveRequests = getActiveCount() === 0;

        return allNotAbortedBefore && allAbortedAfter && noActiveRequests;
      }),
      { numRuns: 100 }
    );
  });

  it('abort signal prevents callback execution', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), (requestCount) => {
        const requests = Array.from({ length: requestCount }, () => create());
        const callbackResults: boolean[] = [];

        // Set up abort listeners that track if callback would run
        for (const request of requests) {
          let shouldRun = true;

          request.controller.signal.addEventListener('abort', () => {
            shouldRun = false;
          });

          // Cancel the request
          cancel(request.id);

          // After cancel, the callback flag should be false
          callbackResults.push(!shouldRun);
        }

        // All callbacks should have been prevented
        return callbackResults.every((result) => result === true);
      }),
      { numRuns: 100 }
    );
  });

  it('get returns undefined after cancellation', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (requestCount) => {
        const requests = Array.from({ length: requestCount }, () => create());

        for (const request of requests) {
          // Request should exist before cancel
          const beforeCancel = get(request.id) !== undefined;

          cancel(request.id);

          // Request should not exist after cancel
          const afterCancel = get(request.id) === undefined;

          if (!beforeCancel || !afterCancel) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
