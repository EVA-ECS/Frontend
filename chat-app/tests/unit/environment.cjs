const { TestEnvironment } = require('jest-environment-node');
// Preserve Node's real browser-compatible primitives before Expo installs native shims.
// fake-indexeddb must clone CryptoKeys with structuredClone, not a JSON-based shim.
const primitives = { structuredClone, TextEncoder, TextDecoder, URL, URLSearchParams,
  crypto: require('node:crypto').webcrypto };
module.exports = class extends TestEnvironment {
  async setup() {
    await super.setup();
    this.global.__unitPrimitives = primitives;
  }
};
