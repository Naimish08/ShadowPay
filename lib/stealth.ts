/**
 * @module stealth
 * @description ERC-5564 scheme-1 cryptographic engine for stealth address payments on Ethereum.
 *
 * Scheme 1 uses the secp256k1 elliptic curve — the same curve Ethereum uses for wallet keys.
 * This module is pure cryptography: no blockchain calls, no I/O, no side effects.
 *
 * Exports (named only, no default):
 *   SCHEME_ID, encodeMetaAddress, parseMetaAddress, generateStealthAddress,
 *   checkViewTag, deriveStealthPrivateKey, pubKeyToEthAddress, generateAnnouncement
 */

import * as secp from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** The secp256k1 curve order n, cached once for repeated use. */
const CURVE_ORDER: bigint = secp.Point.CURVE().n;

/**
 * Converts a Uint8Array to a BigInt using the exact method mandated by this module:
 * BigInt('0x' + hex-encoded bytes).  Never use any other conversion path.
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt("0x" + Buffer.from(bytes).toString("hex"));
}

/**
 * Reduces a BigInt scalar into the range [0, CURVE_ORDER) using secp256k1's
 * modular-reduction helper.  Always call this before scalar arithmetic.
 */
function modN(scalar: bigint): bigint {
  return secp.etc.mod(scalar, CURVE_ORDER);
}

// ---------------------------------------------------------------------------
// Public constant
// ---------------------------------------------------------------------------

/**
 * ERC-5564 scheme identifier for secp256k1.
 * Passed into on-chain announcements so the registry knows which curve was used.
 */
export const SCHEME_ID = 1 as const;

// ---------------------------------------------------------------------------
// Meta-address encoding / decoding
// ---------------------------------------------------------------------------

/**
 * Encodes a recipient's two compressed public keys into a single meta-address string.
 *
 * Called by: the recipient once, when they publish their payment identity.
 *
 * @param spendPubKeyHex - 66-char hex string of the compressed spend public key (33 bytes).
 *   The corresponding private key is required to move funds out of any stealth address.
 * @param viewPubKeyHex  - 66-char hex string of the compressed view public key (33 bytes).
 *   The corresponding private key is only needed to scan for incoming payments.
 * @returns A meta-address string of the form `st:eth:0x{spendPubKey}{viewPubKey}`.
 */
export function encodeMetaAddress(
  spendPubKeyHex: string,
  viewPubKeyHex: string,
): string {
  return `st:eth:0x${spendPubKeyHex}${viewPubKeyHex}`;
}

/**
 * Parses a meta-address string back into its two constituent compressed public keys.
 *
 * Called by: the sender before generating a stealth address, and by tests.
 *
 * @param metaAddress - A string previously produced by `encodeMetaAddress`.
 * @returns An object `{ spendPubKey, viewPubKey }` where each value is a 66-char hex string.
 * @throws {Error} If the prefix is not `st:eth:0x` or the total length is wrong.
 */
export function parseMetaAddress(metaAddress: string): {
  spendPubKey: string;
  viewPubKey: string;
} {
  const PREFIX = "st:eth:0x";

  if (!metaAddress.startsWith(PREFIX)) {
    throw new Error(
      `parseMetaAddress: invalid prefix. Expected "${PREFIX}", ` +
        `received "${metaAddress.slice(0, PREFIX.length)}"`,
    );
  }

  const body = metaAddress.slice(PREFIX.length);

  // Two compressed public keys: 33 bytes each → 66 hex chars each → 132 total
  const EXPECTED_LEN = 132;
  if (body.length !== EXPECTED_LEN) {
    throw new Error(
      `parseMetaAddress: invalid body length. Expected ${EXPECTED_LEN} hex chars ` +
        `(two 33-byte compressed keys), received ${body.length}`,
    );
  }

  return {
    spendPubKey: body.slice(0, 66),
    viewPubKey: body.slice(66, 132),
  };
}

// ---------------------------------------------------------------------------
// Address derivation utility
// ---------------------------------------------------------------------------

/**
 * Derives an Ethereum address from a secp256k1 public key.
 *
 * Called by: `generateStealthAddress` (sender side) and by tests when verifying
 * that a derived stealth private key controls the expected stealth address.
 *
 * @param pubKeyBytes - Either a 33-byte compressed public key (02/03 prefix) or a
 *   65-byte uncompressed public key (04 prefix).
 * @returns A 0x-prefixed lowercase 42-character Ethereum address string.
 * @throws {Error} If `pubKeyBytes.length` is neither 33 nor 65.
 */
export function pubKeyToEthAddress(pubKeyBytes: Uint8Array): string {
  let body64: Uint8Array;

  if (pubKeyBytes.length === 33) {
    // Decompress: Point.fromBytes → toBytes(false) gives 65-byte uncompressed form.
    const point = secp.Point.fromBytes(pubKeyBytes);
    const uncompressed = point.toBytes(false); // 65 bytes: 0x04 || x(32) || y(32)
    body64 = uncompressed.slice(1); // strip the 0x04 prefix → 64 bytes
  } else if (pubKeyBytes.length === 65) {
    body64 = pubKeyBytes.slice(1); // strip the 0x04 prefix → 64 bytes
  } else {
    throw new Error(
      `pubKeyToEthAddress: unsupported key length ${pubKeyBytes.length}. ` +
        `Expected 33 (compressed) or 65 (uncompressed).`,
    );
  }

  // Ethereum address = last 20 bytes of Keccak-256(64-byte public key body)
  const digest = keccak_256(body64);
  const addressBytes = digest.slice(12); // bytes [12..31] are the 20-byte address
  return "0x" + Buffer.from(addressBytes).toString("hex");
}

// ---------------------------------------------------------------------------
// Sender-side: stealth address generation
// ---------------------------------------------------------------------------

/**
 * Generates a one-time stealth address for a payment to the given recipient meta-address.
 *
 * Called by: the sender's backend on every payment, before broadcasting the transaction.
 *
 * Derivation (scheme 1 / secp256k1):
 *   ephemeralPrivKey          = random 32 bytes
 *   ephemeralPubKey           = ephemeralPrivKey × G
 *   sharedSecretPoint         = recipientViewPubKey × ephemeralPrivKey  (ECDH)
 *   sharedSecretBytes         = compress(sharedSecretPoint)             (33 bytes)
 *   hashedSecret              = Keccak256(sharedSecretBytes)            (32 bytes)
 *   viewTag                   = hashedSecret[0]
 *   tweakScalar               = BigInt(hashedSecret) mod curveOrder
 *   stealthPubKey             = recipientSpendPubKey + (tweakScalar × G)
 *   stealthAddress            = EthAddress(stealthPubKey)
 *
 * @param recipientMetaAddress - The recipient's published meta-address (`st:eth:0x…`).
 * @returns An object containing:
 *   - `stealthAddress`    – the 0x-prefixed address to send ETH to.
 *   - `ephemeralPublicKey`– hex-encoded compressed 33-byte ephemeral public key.
 *     Must be published in the on-chain announcement.
 *   - `viewTag`           – first byte of the hashed shared secret (0–255).
 *     Must be published in the on-chain announcement.
 */
export function generateStealthAddress(recipientMetaAddress: string): {
  stealthAddress: string;
  ephemeralPublicKey: string;
  viewTag: number;
} {
  const { spendPubKey: spendPubKeyHex, viewPubKey: viewPubKeyHex } =
    parseMetaAddress(recipientMetaAddress);

  const spendPubKeyBytes = secp.etc.hexToBytes(spendPubKeyHex);
  const viewPubKeyBytes = secp.etc.hexToBytes(viewPubKeyHex);

  // Step 1: Random ephemeral keypair (never reused)
  const ephemeralPrivKey = secp.utils.randomSecretKey(); // 32 bytes
  const ephemeralPubKey = secp.getPublicKey(ephemeralPrivKey, true); // 33 bytes compressed

  // Step 2: ECDH — ephemeralPrivKey × viewPubKey → 33-byte compressed shared secret point
  const sharedSecretBytes = secp.getSharedSecret(
    ephemeralPrivKey,
    viewPubKeyBytes,
    true,
  );

  // Step 3: Hash the shared secret point
  const hashedSecret = keccak_256(sharedSecretBytes); // 32 bytes

  // Step 4: View tag is the first byte of the hash
  const viewTag = hashedSecret[0];

  // Step 5: Tweak scalar reduced into [0, n)
  const tweakScalar = modN(bytesToBigInt(hashedSecret));

  // Step 6: stealthPubKey = spendPubKey + (tweakScalar × G)
  const spendPubKeyPoint = secp.Point.fromBytes(spendPubKeyBytes);
  const tweakPoint = secp.Point.BASE.multiply(tweakScalar);
  const stealthPubKeyPoint = spendPubKeyPoint.add(tweakPoint);
  const stealthPubKeyBytes = stealthPubKeyPoint.toBytes(true); // 33 bytes compressed

  // Step 7: Derive Ethereum address from stealth public key
  const stealthAddress = pubKeyToEthAddress(stealthPubKeyBytes);

  return {
    stealthAddress,
    ephemeralPublicKey: secp.etc.bytesToHex(ephemeralPubKey),
    viewTag,
  };
}

// ---------------------------------------------------------------------------
// Recipient-side: view-tag check (cheap preliminary scan filter)
// ---------------------------------------------------------------------------

/**
 * Performs the cheap preliminary view-tag check described in ERC-5564.
 *
 * Called by: the recipient (or a watch-only scanning service) on every announcement
 * before attempting full key derivation.  On average this allows 255 out of 256
 * foreign announcements to be discarded after a single ECDH + hash, giving a ~256×
 * speedup over naïve full derivation for every announcement.
 *
 * Derivation:
 *   sharedSecretPoint = ephemeralPubKey × viewPrivKey  (ECDH, mirrors sender)
 *   hashedSecret      = Keccak256(compress(sharedSecretPoint))
 *   return hashedSecret[0] === expectedViewTag
 *
 * @param viewPrivKeyHex      - 64-char hex string of the recipient's view private key.
 * @param ephemeralPubKeyHex  - 66-char hex string of the compressed ephemeral public key
 *   taken directly from the on-chain announcement.
 * @param expectedViewTag     - The view tag byte (0–255) taken from the announcement.
 * @returns `true` if the first byte matches, `false` otherwise.
 */
export function checkViewTag(
  viewPrivKeyHex: string,
  ephemeralPubKeyHex: string,
  expectedViewTag: number,
): boolean {
  const viewPrivKeyBytes = secp.etc.hexToBytes(viewPrivKeyHex);
  const ephemeralPubKeyBytes = secp.etc.hexToBytes(ephemeralPubKeyHex);

  // ECDH: viewPrivKey × ephemeralPubKey → 33-byte compressed shared secret
  const sharedSecretBytes = secp.getSharedSecret(
    viewPrivKeyBytes,
    ephemeralPubKeyBytes,
    true,
  );

  // Hash and compare only the first byte
  const hashedSecret = keccak_256(sharedSecretBytes);
  return hashedSecret[0] === expectedViewTag;
}

// ---------------------------------------------------------------------------
// Recipient-side: full stealth private key derivation
// ---------------------------------------------------------------------------

/**
 * Derives the stealth private key that controls the stealth address from a given
 * announcement.  Runs `checkViewTag` first as a fast-fail guard.
 *
 * Called by: the recipient after `checkViewTag` passes, to claim funds.
 *
 * Derivation (scheme 1 / secp256k1):
 *   sharedSecretPoint = ephemeralPubKey × viewPrivKey  (ECDH)
 *   sharedSecretBytes = compress(sharedSecretPoint)
 *   hashedSecret      = Keccak256(sharedSecretBytes)
 *   tweakScalar       = BigInt(hashedSecret) mod curveOrder
 *   stealthPrivKey    = (spendPrivKey + tweakScalar) mod curveOrder
 *
 * The resulting `stealthPrivKey` controls the address produced by `generateStealthAddress`
 * because adding a scalar to a private key is equivalent to adding scalar×G to its
 * corresponding public key.
 *
 * @param spendPrivKeyHex     - 64-char hex string of the recipient's spend private key.
 * @param viewPrivKeyHex      - 64-char hex string of the recipient's view private key.
 * @param ephemeralPubKeyHex  - 66-char hex string of the compressed ephemeral public key
 *   from the on-chain announcement.
 * @param viewTag             - The view tag byte from the announcement; used for a
 *   preliminary fast-fail check before running full ECDH derivation.
 * @returns The stealth private key as a 64-char zero-padded lowercase hex string, or
 *   `null` if the view tag does not match (this announcement is not for this recipient).
 *   This function never throws on a view-tag mismatch.
 */
export function deriveStealthPrivateKey(
  spendPrivKeyHex: string,
  viewPrivKeyHex: string,
  ephemeralPubKeyHex: string,
  viewTag: number,
): string | null {
  // Fast-fail: if the view tag doesn't match, this payment is not for us
  if (!checkViewTag(viewPrivKeyHex, ephemeralPubKeyHex, viewTag)) {
    return null;
  }

  const viewPrivKeyBytes = secp.etc.hexToBytes(viewPrivKeyHex);
  const ephemeralPubKeyBytes = secp.etc.hexToBytes(ephemeralPubKeyHex);
  const spendPrivKeyBytes = secp.etc.hexToBytes(spendPrivKeyHex);

  // ECDH: viewPrivKey × ephemeralPubKey → 33-byte compressed shared secret
  const sharedSecretBytes = secp.getSharedSecret(
    viewPrivKeyBytes,
    ephemeralPubKeyBytes,
    true,
  );

  // Hash
  const hashedSecret = keccak_256(sharedSecretBytes);

  // Tweak scalar reduced into [0, n)
  const tweakScalar = modN(bytesToBigInt(hashedSecret));

  // Spend private key scalar reduced into [0, n)
  const spendPrivScalar = modN(bytesToBigInt(spendPrivKeyBytes));

  // Stealth private key: (spendPrivKey + tweakScalar) mod n
  const stealthPrivScalar = modN(spendPrivScalar + tweakScalar);

  // Return as 64-char zero-padded lowercase hex
  return stealthPrivScalar.toString(16).padStart(64, "0");
}

// ---------------------------------------------------------------------------
// Announcement packaging
// ---------------------------------------------------------------------------

/**
 * Packages the three pieces of information the on-chain ERC-5564 registry needs.
 *
 * Called by: the sender immediately after broadcasting the payment transaction,
 * before calling the registry's `announce` function.
 *
 * @param stealthAddress     - The 0x-prefixed Ethereum address the ETH was sent to.
 * @param ephemeralPubKeyHex - 66-char hex string of the ephemeral public key used
 *   to generate the stealth address.
 * @param viewTag            - The view-tag byte (0–255) derived during generation.
 * @returns An object ready to be passed as arguments to the registry contract call:
 *   `{ schemeId, stealthAddress, ephemeralPubKey, viewTag }`.
 */
export function generateAnnouncement(
  stealthAddress: string,
  ephemeralPubKeyHex: string,
  viewTag: number,
): {
  schemeId: number;
  stealthAddress: string;
  ephemeralPubKey: string;
  viewTag: number;
} {
  return {
    schemeId: SCHEME_ID,
    stealthAddress,
    ephemeralPubKey: ephemeralPubKeyHex,
    viewTag,
  };
}
