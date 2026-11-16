const TOKEN_CIPHERTEXT_VERSION = 1
const TOKEN_KEY_BYTES = 32
const TOKEN_NONCE_BYTES = 12
const BASE64URL_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

type TokenCiphertextEnvelope = {
  v: number
  kid: string
  n: string
  c: string
}

export type PoeTokenEncryptionConfig = {
  activeKeyId: string
  keys: ReadonlyMap<string, CryptoKey>
}

export type EncryptedPoeToken = {
  ciphertext: string
  keyId: string
  version: number
}

export type DecryptedPoeToken = {
  plaintext: string
  keyId: string
  version: number
  needsRotation: boolean
}

function encodeBase64Url(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Invalid base64url value')
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))

  try {
    const binary = atob(`${normalized}${padding}`)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new Error('Invalid base64url value')
  }
}

function parseEnvelope(ciphertext: string): TokenCiphertextEnvelope {
  let value: unknown
  try {
    value = JSON.parse(ciphertext)
  } catch {
    throw new Error('Invalid PoE token ciphertext envelope')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid PoE token ciphertext envelope')
  }

  const record = value as Record<string, unknown>
  if (
    record.v !== TOKEN_CIPHERTEXT_VERSION ||
    typeof record.kid !== 'string' ||
    !KEY_ID_PATTERN.test(record.kid) ||
    typeof record.n !== 'string' ||
    typeof record.c !== 'string'
  ) {
    throw new Error('Invalid PoE token ciphertext envelope')
  }

  const nonce = decodeBase64Url(record.n)
  const encryptedBytes = decodeBase64Url(record.c)
  if (nonce.byteLength !== TOKEN_NONCE_BYTES || encryptedBytes.byteLength <= 16) {
    throw new Error('Invalid PoE token ciphertext envelope')
  }

  return {
    v: record.v,
    kid: record.kid,
    n: record.n,
    c: record.c,
  }
}

function additionalData(version: number, keyId: string, context: string): Uint8Array<ArrayBuffer> {
  if (!context) throw new Error('PoE token encryption context is required')
  return textEncoder.encode(`poe-party:poe-oauth-token:v${version}:${keyId}:${context}`)
}

export async function createPoeTokenEncryptionConfig(
  activeKeyIdValue: string | undefined,
  serializedKeyRing: string | undefined,
): Promise<PoeTokenEncryptionConfig> {
  const activeKeyId = activeKeyIdValue?.trim() ?? ''
  if (!KEY_ID_PATTERN.test(activeKeyId)) {
    throw new Error('POE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID is missing or invalid')
  }
  if (!serializedKeyRing?.trim()) {
    throw new Error('POE_TOKEN_ENCRYPTION_KEYS is missing')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(serializedKeyRing)
  } catch {
    throw new Error('POE_TOKEN_ENCRYPTION_KEYS must be a JSON object')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('POE_TOKEN_ENCRYPTION_KEYS must be a JSON object')
  }

  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.length === 0) throw new Error('POE_TOKEN_ENCRYPTION_KEYS cannot be empty')

  const keys = new Map<string, CryptoKey>()
  for (const [keyId, encodedKey] of entries) {
    if (!KEY_ID_PATTERN.test(keyId) || typeof encodedKey !== 'string') {
      throw new Error('POE_TOKEN_ENCRYPTION_KEYS contains an invalid entry')
    }
    if (!BASE64URL_KEY_PATTERN.test(encodedKey)) {
      throw new Error('PoE token encryption keys must be unpadded base64url AES-256 keys')
    }

    const keyBytes = decodeBase64Url(encodedKey)
    if (keyBytes.byteLength !== TOKEN_KEY_BYTES || encodeBase64Url(keyBytes) !== encodedKey) {
      throw new Error('PoE token encryption keys must decode to exactly 32 bytes')
    }

    let cryptoKey: CryptoKey
    try {
      cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
        'encrypt',
        'decrypt',
      ])
    } finally {
      keyBytes.fill(0)
    }
    keys.set(keyId, cryptoKey)
  }

  if (!keys.has(activeKeyId)) {
    throw new Error('The active PoE token encryption key is not present in the key ring')
  }

  return { activeKeyId, keys }
}

let environmentConfig: Promise<PoeTokenEncryptionConfig> | undefined

export function getPoeTokenEncryptionConfig(): Promise<PoeTokenEncryptionConfig> {
  environmentConfig ??= createPoeTokenEncryptionConfig(
    Deno.env.get('POE_TOKEN_ENCRYPTION_ACTIVE_KEY_ID'),
    Deno.env.get('POE_TOKEN_ENCRYPTION_KEYS'),
  )
  return environmentConfig
}

export async function encryptPoeToken(
  plaintext: string,
  context: string,
  config: PoeTokenEncryptionConfig,
): Promise<EncryptedPoeToken> {
  if (!plaintext) throw new Error('Cannot encrypt an empty PoE token')

  const key = config.keys.get(config.activeKeyId)
  if (!key) throw new Error('The active PoE token encryption key is unavailable')

  const nonce = crypto.getRandomValues(new Uint8Array(TOKEN_NONCE_BYTES))
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: additionalData(TOKEN_CIPHERTEXT_VERSION, config.activeKeyId, context),
      tagLength: 128,
    },
    key,
    textEncoder.encode(plaintext),
  )

  const envelope: TokenCiphertextEnvelope = {
    v: TOKEN_CIPHERTEXT_VERSION,
    kid: config.activeKeyId,
    n: encodeBase64Url(nonce),
    c: encodeBase64Url(new Uint8Array(encrypted)),
  }

  return {
    ciphertext: JSON.stringify(envelope),
    keyId: config.activeKeyId,
    version: TOKEN_CIPHERTEXT_VERSION,
  }
}

export async function decryptPoeToken(
  ciphertext: string,
  context: string,
  config: PoeTokenEncryptionConfig,
): Promise<DecryptedPoeToken> {
  const envelope = parseEnvelope(ciphertext)
  const key = config.keys.get(envelope.kid)
  if (!key) throw new Error('The PoE token ciphertext key is unavailable')

  let decrypted: ArrayBuffer
  try {
    decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBase64Url(envelope.n),
        additionalData: additionalData(envelope.v, envelope.kid, context),
        tagLength: 128,
      },
      key,
      decodeBase64Url(envelope.c),
    )
  } catch {
    throw new Error('PoE token ciphertext authentication failed')
  }

  let plaintext: string
  try {
    plaintext = textDecoder.decode(decrypted)
  } catch {
    throw new Error('PoE token ciphertext contains invalid text')
  }
  if (!plaintext) throw new Error('PoE token ciphertext decrypted to an empty value')

  return {
    plaintext,
    keyId: envelope.kid,
    version: envelope.v,
    needsRotation: envelope.kid !== config.activeKeyId,
  }
}

export async function fingerprintPoeRefreshToken(refreshToken: string): Promise<string> {
  if (!refreshToken) throw new Error('Cannot fingerprint an empty PoE refresh token')
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(refreshToken))
  return `sha256:v1:${encodeBase64Url(new Uint8Array(digest))}`
}
