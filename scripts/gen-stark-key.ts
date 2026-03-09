#!/usr/bin/env npx tsx
/**
 * Generate a StarkEx key pair for EdgeX.
 * Usage: npx tsx scripts/gen-stark-key.ts
 */
import { randomBytes } from 'node:crypto';
import { Point } from '@scure/starknet';

const EC_ORDER = Point.Fn.ORDER;

// Generate a random private key within the Stark curve order
let privKey: bigint;
do {
  const raw = randomBytes(32);
  let n = 0n;
  for (const b of raw) n = (n << 8n) | BigInt(b);
  privKey = n % EC_ORDER;
} while (privKey === 0n);

// Derive public key
const pubPoint = Point.BASE.multiply(privKey);

const privHex = '0x' + privKey.toString(16).padStart(64, '0');
const pubXHex = '0x' + pubPoint.x.toString(16).padStart(64, '0');
const pubYHex = '0x' + pubPoint.y.toString(16).padStart(64, '0');

console.log('=== EdgeX Stark Key Pair ===\n');
console.log(`Private Key : ${privHex}`);
console.log(`Public Key X: ${pubXHex}`);
console.log(`Public Key Y: ${pubYHex}`);
console.log(`\nSet these as environment variables:`);
console.log(`  export EDGEX_STARK_PRIVATE_KEY="${privHex}"`);
