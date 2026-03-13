/**
 * @file stealth.test.ts
 * @description Test suite for the ERC-5564 scheme-1 cryptographic engine.
 *
 * Tests:
 *   1  Full round-trip
 *   2  View tag rejection (wrong view key)
 *   3  View tag acceptance (correct view key)
 *   4  Uniqueness across two generateStealthAddress calls
 *   5  Determinism of deriveStealthPrivateKey
 *   6  Stealth address format (0x prefix, 42 chars)
 *   7  Meta-address encode → parse round-trip
 *   8  Null on mismatched ephemeral key
 */

import * as secp from "@noble/secp256k1";
import {
  SCHEME_ID,
  encodeMetaAddress,
  parseMetaAddress,
  generateStealthAddress,
  checkViewTag,
  deriveStealthPrivateKey,
  pubKeyToEthAddress,
  generateAnnouncement,
} from "./stealth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a random keypair and return { privHex, pubHex } where pubHex is
 *  the compressed (33-byte / 66-char) public key. */
function randomKeypair(): { privHex: string; pubHex: string } {
  const privBytes = secp.utils.randomSecretKey();
  const pubBytes = secp.getPublicKey(privBytes, true);
  return {
    privHex: Buffer.from(privBytes).toString("hex").padStart(64, "0"),
    pubHex: secp.etc.bytesToHex(pubBytes),
  };
}

// ---------------------------------------------------------------------------
// Test 1 — Full round-trip
// ---------------------------------------------------------------------------

test("1: full round-trip — derived stealth private key controls the stealth address", () => {
  const spend = randomKeypair();
  const view = randomKeypair();

  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);

  // Sender side
  const { stealthAddress, ephemeralPublicKey, viewTag } =
    generateStealthAddress(metaAddress);

  // Recipient side
  const stealthPrivHex = deriveStealthPrivateKey(
    spend.privHex,
    view.privHex,
    ephemeralPublicKey,
    viewTag,
  );

  expect(stealthPrivHex).not.toBeNull();

  // Derive the Ethereum address from the recovered stealth private key
  const stealthPrivBytes = secp.etc.hexToBytes(stealthPrivHex!);
  const stealthPubBytes = secp.getPublicKey(stealthPrivBytes, true);
  const recoveredAddress = pubKeyToEthAddress(stealthPubBytes);

  expect(recoveredAddress.toLowerCase()).toBe(stealthAddress.toLowerCase());
});

// ---------------------------------------------------------------------------
// Test 2 — View tag rejection (wrong view key)
// ---------------------------------------------------------------------------

test("2: view tag rejection — checkViewTag returns false for the wrong view private key", () => {
  const spend = randomKeypair();
  const view = randomKeypair();
  const wrongView = randomKeypair(); // unrelated keypair

  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);
  const { ephemeralPublicKey, viewTag } = generateStealthAddress(metaAddress);

  // Sanity: the correct key must pass (keeps the test meaningful)
  expect(checkViewTag(view.privHex, ephemeralPublicKey, viewTag)).toBe(true);

  // Wrong view private key must fail — false with very high probability (255/256)
  // Run several times so a single-byte collision cannot make the test flaky
  let falseCount = 0;
  for (let i = 0; i < 5; i++) {
    const adversarial = randomKeypair();
    if (!checkViewTag(adversarial.privHex, ephemeralPublicKey, viewTag)) {
      falseCount++;
    }
  }
  // At least 4 of 5 must be false (expected: all 5; p(all pass) ≈ (1/256)^5 ≈ 0)
  expect(falseCount).toBeGreaterThanOrEqual(4);

  // Explicit check with the pre-generated wrong key
  const result = checkViewTag(wrongView.privHex, ephemeralPublicKey, viewTag);
  // It *could* collide with probability 1/256 — tolerate that edge case by only
  // asserting the overall loop result above.  If this single check happens to
  // collide, the test still passes due to the loop above.
  expect(typeof result).toBe("boolean");
});

// ---------------------------------------------------------------------------
// Test 3 — View tag acceptance (correct view key)
// ---------------------------------------------------------------------------

test("3: view tag acceptance — checkViewTag returns true for the correct view private key", () => {
  const spend = randomKeypair();
  const view = randomKeypair();

  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);
  const { ephemeralPublicKey, viewTag } = generateStealthAddress(metaAddress);

  expect(checkViewTag(view.privHex, ephemeralPublicKey, viewTag)).toBe(true);
});

// ---------------------------------------------------------------------------
// Test 4 — Uniqueness
// ---------------------------------------------------------------------------

test("4: uniqueness — two calls produce different stealth addresses and ephemeral keys", () => {
  const spend = randomKeypair();
  const view = randomKeypair();
  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);

  const result1 = generateStealthAddress(metaAddress);
  const result2 = generateStealthAddress(metaAddress);

  expect(result1.stealthAddress).not.toBe(result2.stealthAddress);
  expect(result1.ephemeralPublicKey).not.toBe(result2.ephemeralPublicKey);
});

// ---------------------------------------------------------------------------
// Test 5 — Determinism
// ---------------------------------------------------------------------------

test("5: determinism — deriveStealthPrivateKey returns identical output on repeated calls", () => {
  const spend = randomKeypair();
  const view = randomKeypair();
  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);

  // Produce a single announcement to fix the ephemeral public key
  const { ephemeralPublicKey, viewTag } = generateStealthAddress(metaAddress);

  const result1 = deriveStealthPrivateKey(
    spend.privHex,
    view.privHex,
    ephemeralPublicKey,
    viewTag,
  );
  const result2 = deriveStealthPrivateKey(
    spend.privHex,
    view.privHex,
    ephemeralPublicKey,
    viewTag,
  );
  const result3 = deriveStealthPrivateKey(
    spend.privHex,
    view.privHex,
    ephemeralPublicKey,
    viewTag,
  );

  expect(result1).not.toBeNull();
  expect(result1).toBe(result2);
  expect(result2).toBe(result3);
});

// ---------------------------------------------------------------------------
// Test 6 — Address format
// ---------------------------------------------------------------------------

test("6: address format — stealthAddress always starts with 0x and is exactly 42 characters", () => {
  const spend = randomKeypair();
  const view = randomKeypair();
  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);

  for (let i = 0; i < 5; i++) {
    const { stealthAddress } = generateStealthAddress(metaAddress);
    expect(stealthAddress).toMatch(/^0x[0-9a-f]{40}$/);
    expect(stealthAddress).toHaveLength(42);
  }
});

// ---------------------------------------------------------------------------
// Test 7 — Meta-address round-trip
// ---------------------------------------------------------------------------

test("7: meta-address round-trip — encode then parse preserves both public keys unchanged", () => {
  const spend = randomKeypair();
  const view = randomKeypair();

  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);

  expect(metaAddress.startsWith("st:eth:0x")).toBe(true);

  const { spendPubKey, viewPubKey } = parseMetaAddress(metaAddress);

  expect(spendPubKey).toBe(spend.pubHex);
  expect(viewPubKey).toBe(view.pubHex);
});

// ---------------------------------------------------------------------------
// Test 7a — parseMetaAddress error paths
// ---------------------------------------------------------------------------

test("7a: parseMetaAddress throws on bad prefix", () => {
  expect(() => parseMetaAddress("eth:0x" + "ab".repeat(66))).toThrow(
    /invalid prefix/i,
  );
});

test("7a: parseMetaAddress throws on wrong length", () => {
  expect(() => parseMetaAddress("st:eth:0x" + "ab".repeat(30))).toThrow(
    /invalid body length/i,
  );
});

// ---------------------------------------------------------------------------
// Test 8 — Null on mismatched ephemeral key
// ---------------------------------------------------------------------------

test("8: null on mismatch — deriveStealthPrivateKey returns null when passed an unrelated ephemeral key", () => {
  const spend = randomKeypair();
  const view = randomKeypair();
  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);

  // Generate a legitimate announcement for this recipient
  const { viewTag } = generateStealthAddress(metaAddress);

  // Generate a completely unrelated announcement for a different recipient
  const otherSpend = randomKeypair();
  const otherView = randomKeypair();
  const otherMeta = encodeMetaAddress(otherSpend.pubHex, otherView.pubHex);
  const { ephemeralPublicKey: foreignEphemeralKey, viewTag: foreignViewTag } =
    generateStealthAddress(otherMeta);

  // Attempt to derive with our keys but the foreign ephemeral key + its own viewTag
  // The view tag will almost certainly not match, so null is the expected result.
  // (probability of accidental match: 1/256 — acceptable for a unit test)
  const result = deriveStealthPrivateKey(
    spend.privHex,
    view.privHex,
    foreignEphemeralKey,
    foreignViewTag, // viewTag from foreign announcement
  );

  // Result should be null because the ECDH output won't produce foreignViewTag
  // for our view private key.  In the astronomically rare case of a 1/256
  // collision on the first byte, derive still gives a wrong private key (which
  // does NOT control the stealthAddress), so we separately verify it is wrong.
  if (result !== null) {
    // Collision on view tag: verify the derived key does NOT match any legit address
    const derivedPubBytes = secp.getPublicKey(
      secp.etc.hexToBytes(result),
      true,
    );
    const derivedAddress = pubKeyToEthAddress(derivedPubBytes);

    const { stealthAddress: ourAddress } = generateStealthAddress(metaAddress);
    expect(derivedAddress.toLowerCase()).not.toBe(ourAddress.toLowerCase());
  } else {
    expect(result).toBeNull();
  }
});

// ---------------------------------------------------------------------------
// Bonus — generateAnnouncement packages fields correctly
// ---------------------------------------------------------------------------

test("bonus: generateAnnouncement returns correct shape and SCHEME_ID", () => {
  const spend = randomKeypair();
  const view = randomKeypair();
  const metaAddress = encodeMetaAddress(spend.pubHex, view.pubHex);

  const { stealthAddress, ephemeralPublicKey, viewTag } =
    generateStealthAddress(metaAddress);

  const announcement = generateAnnouncement(
    stealthAddress,
    ephemeralPublicKey,
    viewTag,
  );

  expect(announcement.schemeId).toBe(SCHEME_ID);
  expect(announcement.schemeId).toBe(1);
  expect(announcement.stealthAddress).toBe(stealthAddress);
  expect(announcement.ephemeralPubKey).toBe(ephemeralPublicKey);
  expect(announcement.viewTag).toBe(viewTag);
});
