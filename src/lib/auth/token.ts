import type { SessionPayload } from "./types";

export const SESSION_COOKIE_NAME = "kraftman_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function getSecretKey(): string {
  const secret =
    process.env.AUTH_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.DELHIVERY_API_TOKEN?.trim() ||
    "kraftman-delhivery-one-secure-session-key-2026-fixed";
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(secretStr: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretStr);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

/**
 * Creates a signed JWT-like HMAC-SHA256 session token
 */
export async function signSessionToken(payload: Omit<SessionPayload, "iat" | "exp">): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SESSION_MAX_AGE_SECONDS;
  const fullPayload: SessionPayload = {
    ...payload,
    iat,
    exp,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encoder = new TextEncoder();

  const headerPart = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadPart = base64UrlEncode(encoder.encode(JSON.stringify(fullPayload)));
  const dataToSign = `${headerPart}.${payloadPart}`;

  const key = await getHmacKey(getSecretKey(), "sign");
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(dataToSign)
  );

  const signaturePart = base64UrlEncode(new Uint8Array(signatureBuffer));
  return `${dataToSign}.${signaturePart}`;
}

/**
 * Verifies and parses a signed session token.
 * Pure Web Crypto: safe in Edge middleware and Node.js.
 */
export async function verifySessionToken(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerPart, payloadPart, signaturePart] = parts;
  const dataToVerify = `${headerPart}.${payloadPart}`;

  try {
    const encoder = new TextEncoder();
    const key = await getHmacKey(getSecretKey(), "verify");
    const signatureBytes = base64UrlDecode(signaturePart);

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes as unknown as BufferSource,
      encoder.encode(dataToVerify)
    );

    if (!isValid) return null;

    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadPart));
    const payload = JSON.parse(payloadJson) as SessionPayload;

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      return null;
    }

    if (!payload.sub || !payload.username) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Hash a user PIN with a cryptographically secure random salt using SHA-256.
 * Format: "<salt_hex>:<sha256_hex>"
 */
export async function hashPin(pin: string, existingSalt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = existingSalt ?? Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const data = encoder.encode(`${salt}:${pin.trim()}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${salt}:${hashHex}`;
}

/**
 * Constant-time comparison of candidate PIN against stored salt:hash
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!pin || !storedHash) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHash] = parts;

  const candidate = await hashPin(pin, salt);
  const candidateHash = candidate.split(":")[1];

  if (!candidateHash || candidateHash.length !== expectedHash.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < candidateHash.length; i++) {
    diff |= candidateHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}
