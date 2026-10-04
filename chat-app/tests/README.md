# Unit tests

Requires Node.js 22.13 or later. From `chat-app`, install the locked test dependencies with `npm ci`.

- `npm test` and `npm run test:coverage`: Jest unit tests with coverage; fail below 80% statements, branches, functions or lines.
- `npm run test:unit`: the same tests without coverage.
- `npx tsc --noEmit`: check application and test types.

The repository root provides the same three npm test commands and forwards them to `chat-app`.
All unit-test sources and test helpers are in `tests/unit`. The six original chat/encryption cases were migrated from Node's test runner to Jest. Robin's API, storage, auth and UI cases were adapted from `origin/festure/tests` and extended for the current interfaces.

Jest measures every TypeScript/JavaScript file in `src`, including files a test never imports. Type declarations, tests, dependencies and generated files are excluded. Terminal, HTML (`tests/coverage/index.html`), JSON and LCOV reports remain available if a coverage threshold fails. Reports are ignored by Git.

The Jest/Expo preset is pinned to 57.0.4 and the React Native test preset to 0.86.2 to match this checkout. Only test dependencies were added; runtime versions remain unchanged. React Native Testing Library 14 uses the current `test-renderer` package and async render/event APIs.
The test environment preserves Node's real Web Crypto primitives and structuredClone so in-memory IndexedDB can retain non-exportable CryptoKeys. HTTP, Redis-facing APIs and WebSocket delivery are stubbed; encryption uses real Web Crypto. Unexpected HTTP calls fail. Tests require no Docker, live services or real credentials.

Playwright application tests remain separate under `tests/e2e` and run with `npm run test:e2e`; Jest never includes them. Unit tests do not establish full browser/native or live-service acceptance.
