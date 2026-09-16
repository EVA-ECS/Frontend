import {
    getUserPublicKey,
    publishOwnPublicKey,
    type PublicKeyResponse,
  } from '../utils/api-client';
  
  const DATABASE_NAME = 'eva-e2ee';
  const DATABASE_VERSION = 1;
  const STORE_NAME = 'identities';
  
  type StoredIdentity = {
    userId: string;
    keyId: string;
    privateKey: CryptoKey;
    publicKey: string;
  };
  
  export type LocalE2eeIdentity =
    StoredIdentity;
  
  export type EncryptedPayloadV1 = {
    version: 1;
    senderId: string;
    recipientId: string;
    senderKeyId: string;
    recipientKeyId: string;
    iv: string;
    ciphertext: string;
  };
  
  function getBrowserCrypto(): Crypto {
    if (
      typeof window === 'undefined' ||
      !window.crypto?.subtle ||
      !window.indexedDB
    ) {
      throw new Error(
        'E2EE benötigt Web Crypto und IndexedDB.'
      );
    }
  
    return window.crypto;
  }
  
  function exactBuffer(
    value: Uint8Array
  ): ArrayBuffer {
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset +
        value.byteLength
    ) as ArrayBuffer;
  }
  
  function toBase64Url(
    value: Uint8Array
  ): string {
    getBrowserCrypto();
  
    let binary = '';
  
    for (
      let offset = 0;
      offset < value.length;
      offset += 0x8000
    ) {
      binary += String.fromCharCode(
        ...value.subarray(
          offset,
          Math.min(
            offset + 0x8000,
            value.length
          )
        )
      );
    }
  
    return window
      .btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  
  function fromBase64Url(
    value: string
  ): Uint8Array {
    getBrowserCrypto();
  
    if (
      !value ||
      value.length % 4 === 1 ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    ) {
      throw new Error(
        'Ungültiger Base64url-Wert.'
      );
    }
  
    const base64 =
      value
        .replace(/-/g, '+')
        .replace(/_/g, '/') +
      '='.repeat(
        (4 - value.length % 4) % 4
      );
  
    const binary =
      window.atob(base64);
  
    return Uint8Array.from(
      binary,
      character =>
        character.charCodeAt(0)
    );
  }
  
  async function calculateKeyId(
    publicKey: string
  ): Promise<string> {
    const digest =
      await getBrowserCrypto()
        .subtle.digest(
          'SHA-256',
          exactBuffer(
            fromBase64Url(publicKey)
          )
        );
  
    return (
      'sha256:' +
      toBase64Url(
        new Uint8Array(digest)
      )
    );
  }
  
  function openDatabase():
    Promise<IDBDatabase> {
    getBrowserCrypto();
  
    return new Promise(
      (resolve, reject) => {
        const request =
          window.indexedDB.open(
            DATABASE_NAME,
            DATABASE_VERSION
          );
  
        request.onupgradeneeded =
          () => {
            const database =
              request.result;
  
            if (
              !database
                .objectStoreNames
                .contains(STORE_NAME)
            ) {
              database
                .createObjectStore(
                  STORE_NAME,
                  {
                    keyPath: 'userId',
                  }
                );
            }
          };
  
        request.onsuccess =
          () => resolve(request.result);
  
        request.onerror =
          () => reject(
            request.error ??
              new Error(
                'IndexedDB konnte nicht geöffnet werden.'
              )
          );
      }
    );
  }
  
  async function readIdentity(
    userId: string
  ): Promise<StoredIdentity | null> {
    const database =
      await openDatabase();
  
    try {
      return await new Promise(
        (resolve, reject) => {
          const request = database
            .transaction(
              STORE_NAME,
              'readonly'
            )
            .objectStore(STORE_NAME)
            .get(userId);
  
          request.onsuccess = () =>
            resolve(
              request.result ??
                null
            );
  
          request.onerror = () =>
            reject(request.error);
        }
      );
    } finally {
      database.close();
    }
  }
  
  async function saveIdentity(
    identity: StoredIdentity
  ): Promise<void> {
    const database =
      await openDatabase();
  
    try {
      await new Promise<void>(
        (resolve, reject) => {
          const transaction =
            database.transaction(
              STORE_NAME,
              'readwrite'
            );
  
          transaction
            .objectStore(STORE_NAME)
            .put(identity);
  
          transaction.oncomplete =
            () => resolve();
  
          transaction.onerror =
            () => reject(
              transaction.error
            );
  
          transaction.onabort =
            () => reject(
              transaction.error
            );
        }
      );
    } finally {
      database.close();
    }
  }
  
  function validatePrivateKey(
    privateKey: CryptoKey
  ): void {
    const algorithm =
      privateKey.algorithm as EcKeyAlgorithm;
  
    if (
      privateKey.type !== 'private' ||
      privateKey.extractable ||
      algorithm.name !== 'ECDH' ||
      algorithm.namedCurve !==
        'P-256' ||
      !privateKey.usages.includes(
        'deriveKey'
      )
    ) {
      throw new Error(
        'Der lokale E2EE-Private-Key ist ungültig.'
      );
    }
  }
  
  async function createIdentity(
    userId: string
  ): Promise<StoredIdentity> {
    const browserCrypto =
      getBrowserCrypto();
  
    const keyPair =
      await browserCrypto.subtle
        .generateKey(
          {
            name: 'ECDH',
            namedCurve: 'P-256',
          },
          false,
          ['deriveKey']
        ) as CryptoKeyPair;
  
    validatePrivateKey(
      keyPair.privateKey
    );
  
    const publicKey =
      toBase64Url(
        new Uint8Array(
          await browserCrypto.subtle
            .exportKey(
              'spki',
              keyPair.publicKey
            )
        )
      );
  
    return {
      userId,
      keyId:
        await calculateKeyId(
          publicKey
        ),
      privateKey:
        keyPair.privateKey,
      publicKey,
    };
  }
  
  async function validateDirectoryKey(
    value: PublicKeyResponse,
    expectedUserId: string
  ): Promise<void> {
    if (
      value.userId !==
        expectedUserId ||
      value.keyId !==
        await calculateKeyId(
          value.publicKey
        )
    ) {
      throw new Error(
        'Das Public-Key-Verzeichnis lieferte einen ungültigen Schlüssel.'
      );
    }
  }
  
  export async function
    ensureE2eeIdentity(
      userId: string,
      accessToken: string
    ): Promise<LocalE2eeIdentity> {
    let identity =
      await readIdentity(userId);
  
    if (identity) {
      validatePrivateKey(
        identity.privateKey
      );
  
      if (
        identity.keyId !==
        await calculateKeyId(
          identity.publicKey
        )
      ) {
        throw new Error(
          'Der lokale E2EE-Schlüsselsatz ist beschädigt.'
        );
      }
    } else {
      identity =
        await createIdentity(userId);
  
      await saveIdentity(identity);
    }
  
    const published =
      await publishOwnPublicKey(
        accessToken,
        identity.publicKey
      );
  
    await validateDirectoryKey(
      published,
      userId
    );
  
    if (
      published.keyId !==
        identity.keyId
    ) {
      throw new Error(
        'Der veröffentlichte Public Key passt nicht zum lokalen Private Key.'
      );
    }
  
    return identity;
  }
  
  async function importPublicKey(
    encodedPublicKey: string
  ): Promise<CryptoKey> {
    return getBrowserCrypto()
      .subtle.importKey(
        'spki',
        exactBuffer(
          fromBase64Url(
            encodedPublicKey
          )
        ),
        {
          name: 'ECDH',
          namedCurve: 'P-256',
        },
        false,
        []
      );
  }
  
  async function deriveAesKey(
    privateKey: CryptoKey,
    publicKey: string,
    usage:
      | 'encrypt'
      | 'decrypt'
  ): Promise<CryptoKey> {
    const importedPublicKey =
      await importPublicKey(
        publicKey
      );
  
    return getBrowserCrypto()
      .subtle.deriveKey(
        {
          name: 'ECDH',
          public:
            importedPublicKey,
        },
        privateKey,
        {
          name: 'AES-GCM',
          length: 256,
        },
        false,
        [usage]
      );
  }
  
  function createAad(
    payload: Pick<
      EncryptedPayloadV1,
      | 'version'
      | 'senderId'
      | 'recipientId'
      | 'senderKeyId'
      | 'recipientKeyId'
    >
  ): Uint8Array {
    return new TextEncoder().encode(
      JSON.stringify([
        payload.version,
        payload.senderId,
        payload.recipientId,
        payload.senderKeyId,
        payload.recipientKeyId,
      ])
    );
  }
  
  export async function
    encryptMessageForUser(
      identity: LocalE2eeIdentity,
      recipientId: string,
      plaintext: string,
      accessToken: string
    ): Promise<string> {
    if (!plaintext.trim()) {
      throw new Error(
        'Die Nachricht darf nicht leer sein.'
      );
    }
  
    const recipientKey =
      await getUserPublicKey(
        accessToken,
        recipientId
      );
  
    await validateDirectoryKey(
      recipientKey,
      recipientId
    );
  
    const header = {
      version: 1 as const,
      senderId: identity.userId,
      recipientId,
      senderKeyId:
        identity.keyId,
      recipientKeyId:
        recipientKey.keyId,
    };
  
    const aesKey =
      await deriveAesKey(
        identity.privateKey,
        recipientKey.publicKey,
        'encrypt'
      );
  
    const iv =
      getBrowserCrypto()
        .getRandomValues(
          new Uint8Array(12)
        );
  
    const ciphertext =
      await getBrowserCrypto()
        .subtle.encrypt(
          {
            name: 'AES-GCM',
            iv: exactBuffer(iv),
            additionalData:
              exactBuffer(
                createAad(header)
              ),
            tagLength: 128,
          },
          aesKey,
          new TextEncoder().encode(
            plaintext
          )
        );
  
    const payload:
      EncryptedPayloadV1 = {
      ...header,
      iv: toBase64Url(iv),
      ciphertext: toBase64Url(
        new Uint8Array(
          ciphertext
        )
      ),
    };
  
    return JSON.stringify(payload);
  }
  
  export async function
    decryptMessageForCurrentUser(
      identity: LocalE2eeIdentity,
      serializedPayload: string,
      accessToken: string
    ): Promise<string> {
    const parsed =
      JSON.parse(
        serializedPayload
      ) as Partial<
        EncryptedPayloadV1
      >;
  
    if (
      parsed.version !== 1 ||
      typeof parsed.senderId !==
        'string' ||
      typeof parsed.recipientId !==
        'string' ||
      typeof parsed.senderKeyId !==
        'string' ||
      typeof parsed.recipientKeyId !==
        'string' ||
      typeof parsed.iv !==
        'string' ||
      typeof parsed.ciphertext !==
        'string'
    ) {
      throw new Error(
        'Ungültiger E2EE-Nachrichtencontainer.'
      );
    }
  
    const payload =
      parsed as EncryptedPayloadV1;
  
    if (
      payload.recipientId !==
        identity.userId ||
      payload.recipientKeyId !==
        identity.keyId
    ) {
      throw new Error(
        'Diese Nachricht ist nicht für den lokalen Schlüssel bestimmt.'
      );
    }
  
    const senderKey =
      await getUserPublicKey(
        accessToken,
        payload.senderId
      );
  
    await validateDirectoryKey(
      senderKey,
      payload.senderId
    );
  
    if (
      senderKey.keyId !==
        payload.senderKeyId
    ) {
      throw new Error(
        'Der Absenderschlüssel stimmt nicht mit der Nachricht überein.'
      );
    }
  
    const iv =
      fromBase64Url(payload.iv);
  
    if (iv.length !== 12) {
      throw new Error(
        'Der AES-GCM-IV ist ungültig.'
      );
    }
  
    const aesKey =
      await deriveAesKey(
        identity.privateKey,
        senderKey.publicKey,
        'decrypt'
      );
  
    try {
      const plaintext =
        await getBrowserCrypto()
          .subtle.decrypt(
            {
              name: 'AES-GCM',
              iv: exactBuffer(iv),
              additionalData:
                exactBuffer(
                  createAad(payload)
                ),
              tagLength: 128,
            },
            aesKey,
            exactBuffer(
              fromBase64Url(
                payload.ciphertext
              )
            )
          );
  
      return new TextDecoder(
        'utf-8',
        { fatal: true }
      ).decode(plaintext);
    } catch {
      throw new Error(
        'Die Nachricht wurde verändert oder mit einem anderen Schlüssel verschlüsselt.'
      );
    }
  }