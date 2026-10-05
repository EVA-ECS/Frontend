# EVA Frontend

The Expo application is in `chat-app`. Install its locked dependencies with `npm --prefix chat-app ci`.
From this repository root, `npm test` and `npm run test:coverage` run the Jest unit tests with coverage; `npm run test:unit` runs without coverage.
See [test setup, isolation and reports](chat-app/tests/README.md). Playwright application tests remain separate.
