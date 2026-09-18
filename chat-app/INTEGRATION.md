# Private chat: receiving and history

This change builds on the reviewed E2EE implementation already merged into
`dev` (`a8451a6`). It does not introduce a new encryption protocol or group chat.

## What changes for a user

- Messages are decrypted on receipt and displayed in the selected private chat.
- Selecting a conversation or reconnecting loads saved history, including the
  sender's own messages. Older messages can be loaded using the pagination cursor.
- History, live messages and optimistic sends are merged without duplicate rows.
- `published` means RabbitMQ accepted publication, not that the message was saved
  or read. Missing acknowledgements become `unconfirmed`; automatic resend is
  deliberately avoided.
- A replaced browser tab stops reconnecting. Missing/mismatched browser keys
  produce a warning and do not silently overwrite the account's existing key.

## Relevant code

| File | Responsibility |
| --- | --- |
| `src/chat/use-private-chat.ts` | WebSocket, send acknowledgements, receiving, history loading |
| `src/chat/messages.ts` | Validate participants, merge/deduplicate messages |
| `src/e2ee/e2ee.ts` | Existing encryption, own-message decryption, protect existing keys |
| `src/utils/api-client.ts` | Authenticated history request |
| `src/components/chat-workspace.tsx` | Connect the existing UI to the chat hook and show errors/history |

Gateway PR https://github.com/EVA-ECS/Gateway/pull/11 supplies the matching
`GET /api/chat/history/{otherUserId}` endpoint and actual encrypted event fields.
Full live delivery also needs the Storage -> Delivery path and the coordinated
Docker configuration (Docker PR 28). Docker's opt-in demo currently has an
unpublished Storage source-build dependency; coordinate it with Zein.

Private keys belong to the browser profile and origin. Changing between
`localhost:8081`, `localhost:18081` and `127.0.0.1` does not move keys.
Do not clear browser storage as a troubleshooting shortcut.

## Reproduce the code checks

Use Node 24 (Expo 57 requires at least Node 22.13):

```sh
npm ci
npm test
npm run typecheck
npm run lint
docker build --build-arg EXPO_PUBLIC_GATEWAY_URL=http://localhost:18080 -t eva-frontend-review .
```

Publication checks: 5 unit tests passed, TypeScript and ESLint passed, and the
Docker build exported all 7 web routes. npm reported 14 moderate vulnerabilities;
no breaking `audit fix --force` changes are included.

`npm run test:e2e` is opt-in and normally skips. Its real multi-user scenario was
previously exercised against the isolated school/demo integration. Running it
with `EVA_ALLOW_TEST_WRITES=1`, `EVA_E2E_ENV_FILE` and a matching
`EVA_E2E_PROJECT_HOST` creates/deletes disposable demo accounts and messages and
briefly stops isolated test containers. Do not run it against production. Traces
and videos are disabled because authentication responses contain tokens.

## Coordinate with the existing test PR

Robin's Frontend PRs 7/8 add Jest tests. This PR does not import or remove that
unmerged work. Both edit package.json/package-lock.json: reconcile the dependencies
and keep both test suites when merging. Our unit tests live in `tests/chat.test.ts`;
the browser scenario lives in `tests/e2e`. No claims are made about tests that are
not yet merged into this branch.
