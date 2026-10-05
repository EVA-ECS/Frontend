const primitives = (globalThis as typeof globalThis & { __unitPrimitives: Record<string, unknown> }).__unitPrimitives;
for (const [name, value] of Object.entries(primitives)) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}
// All HTTP requests must be explicitly stubbed by a test. Never contact a service.
beforeEach(() => {
  globalThis.fetch = jest.fn(() => Promise.reject(new Error('Unexpected HTTP request in unit test')));
});
afterEach(() => jest.restoreAllMocks());
