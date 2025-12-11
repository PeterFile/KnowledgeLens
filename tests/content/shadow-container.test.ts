import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { createShadowContainer, destroyAllShadowContainers } from '../../src/content/shadow-container';

/**
 * **Feature: knowledge-lens, Property 16: Shadow DOM style isolation**
 * **Validates: Requirements 2.1, 2.2**
 *
 * For any CSS rules applied to the host page, the Floating Bubble and Sidebar
 * styles SHALL remain unaffected when rendered inside Shadow DOM.
 *
 * Note: This test validates the structural requirements for Shadow DOM isolation:
 * 1. Shadow root is created with proper encapsulation mode
 * 2. Host element has style reset (all: initial) to prevent inheritance
 * 3. Styles are properly injected into shadow root (not document)
 * 4. Shadow DOM boundary exists between host page and extension UI
 *
 * Full style isolation behavior is a browser feature that requires real browser testing.
 */
describe('Property 16: Shadow DOM style isolation', () => {
  beforeEach(() => {
    // Clean up any existing containers
    destroyAllShadowContainers();
  });

  afterEach(() => {
    // Clean up after each test
    destroyAllShadowContainers();
  });

  // Generate random container IDs
  const containerIdArb = fc.string({ minLength: 1, maxLength: 20 })
    .map((s) => `shadow-${s.replace(/[^a-zA-Z0-9]/g, 'x')}`);

  // Generate random class names for testing style injection
  const classNameArb = fc.constantFrom(
    'flex', 'hidden', 'p-4', 'bg-white', 'rounded-lg', 'shadow-lg',
    'text-sm', 'font-medium', 'items-center', 'justify-between'
  );

  it('shadow root is created for each container', () => {
    fc.assert(
      fc.property(containerIdArb, (id) => {
        const container = createShadowContainer(id);

        // Shadow root must exist
        const hasShadowRoot = container.shadow !== null && container.shadow !== undefined;

        // Shadow root must be attached to host
        const shadowAttached = container.host.shadowRoot === container.shadow;

        container.destroy();

        return hasShadowRoot && shadowAttached;
      }),
      { numRuns: 100 }
    );
  });

  it('host element has style reset to prevent inheritance', () => {
    fc.assert(
      fc.property(containerIdArb, (id) => {
        const container = createShadowContainer(id);

        // Host element must have 'all: initial' to reset inherited styles
        const hostStyle = container.host.style.cssText;
        const hasStyleReset = hostStyle.includes('all: initial');

        container.destroy();

        return hasStyleReset;
      }),
      { numRuns: 100 }
    );
  });

  it('styles are injected into shadow root not document', () => {
    fc.assert(
      fc.property(containerIdArb, (id) => {
        const documentStylesBefore = document.querySelectorAll('style').length;

        const container = createShadowContainer(id);

        // Styles should be in shadow root
        const shadowStyles = container.shadow.querySelectorAll('style');
        const hasStylesInShadow = shadowStyles.length > 0;

        // Document should not have new styles from shadow container
        const documentStylesAfter = document.querySelectorAll('style').length;
        const noNewDocumentStyles = documentStylesAfter === documentStylesBefore;

        container.destroy();

        return hasStylesInShadow && noNewDocumentStyles;
      }),
      { numRuns: 100 }
    );
  });

  it('shadow DOM contains expected utility classes', () => {
    fc.assert(
      fc.property(containerIdArb, classNameArb, (id, className) => {
        const container = createShadowContainer(id);

        // Get all style content from shadow root
        const styleElements = container.shadow.querySelectorAll('style');
        const styleContent = Array.from(styleElements)
          .map((el) => el.textContent || '')
          .join('');

        // The class should be defined in shadow styles
        const hasClass = styleContent.includes(`.${className}`);

        container.destroy();

        return hasClass;
      }),
      { numRuns: 100 }
    );
  });

  it('elements inside shadow DOM are not queryable from document', () => {
    fc.assert(
      fc.property(containerIdArb, (id) => {
        const container = createShadowContainer(id);

        // Create element with unique class inside shadow DOM
        const uniqueClass = `unique-test-${Date.now()}`;
        const testElement = document.createElement('div');
        testElement.className = uniqueClass;
        container.shadow.appendChild(testElement);

        // Element should NOT be findable from document
        const foundFromDocument = document.querySelector(`.${uniqueClass}`);
        const notFoundFromDocument = foundFromDocument === null;

        // Element SHOULD be findable from shadow root
        const foundFromShadow = container.shadow.querySelector(`.${uniqueClass}`);
        const foundInShadow = foundFromShadow === testElement;

        container.destroy();

        return notFoundFromDocument && foundInShadow;
      }),
      { numRuns: 100 }
    );
  });

  it('multiple shadow containers have independent shadow roots', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), (numContainers) => {
        const containers: ReturnType<typeof createShadowContainer>[] = [];

        // Create multiple shadow containers
        for (let i = 0; i < numContainers; i++) {
          const containerId = `test-shadow-${i}-${Date.now()}`;
          const container = createShadowContainer(containerId);
          containers.push(container);
        }

        // Each container should have its own shadow root
        const shadowRoots = containers.map((c) => c.shadow);
        const allUnique = shadowRoots.every((sr, i) =>
          shadowRoots.every((other, j) => i === j || sr !== other)
        );

        // Each shadow root should have styles
        const allHaveStyles = containers.every((c) =>
          c.shadow.querySelectorAll('style').length > 0
        );

        // Clean up
        containers.forEach((c) => c.destroy());

        return allUnique && allHaveStyles;
      }),
      { numRuns: 50 }
    );
  });

  it('shadow root is created in open mode for debugging', () => {
    fc.assert(
      fc.property(containerIdArb, (id) => {
        const container = createShadowContainer(id);

        // Shadow root should be accessible (open mode)
        const isOpenMode = container.shadow.mode === 'open';

        container.destroy();

        return isOpenMode;
      }),
      { numRuns: 100 }
    );
  });

  it('host element is attached to document body', () => {
    fc.assert(
      fc.property(containerIdArb, (id) => {
        const container = createShadowContainer(id);

        // Host should be in the document
        const isInDocument = document.body.contains(container.host);

        // Host should have the correct ID
        const hasCorrectId = container.host.id === id;

        container.destroy();

        return isInDocument && hasCorrectId;
      }),
      { numRuns: 100 }
    );
  });

  it('destroy removes host element from document', () => {
    fc.assert(
      fc.property(containerIdArb, (id) => {
        const container = createShadowContainer(id);

        // Verify host is in document before destroy
        const inDocumentBefore = document.body.contains(container.host);

        container.destroy();

        // Host should be removed after destroy
        const inDocumentAfter = document.getElementById(id) !== null;

        return inDocumentBefore && !inDocumentAfter;
      }),
      { numRuns: 100 }
    );
  });

  it('recreating container with same ID replaces old one', () => {
    fc.assert(
      fc.property(containerIdArb, (id) => {
        // Create first container
        const container1 = createShadowContainer(id);
        const host1 = container1.host;

        // Create second container with same ID
        const container2 = createShadowContainer(id);
        const host2 = container2.host;

        // Old host should be removed
        const oldHostRemoved = !document.body.contains(host1);

        // New host should be in document
        const newHostInDocument = document.body.contains(host2);

        // They should be different elements
        const differentElements = host1 !== host2;

        container2.destroy();

        return oldHostRemoved && newHostInDocument && differentElements;
      }),
      { numRuns: 100 }
    );
  });
});
