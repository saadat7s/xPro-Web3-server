import { PublicKey } from "@solana/web3.js";
import { randomUUID } from "crypto";
import * as anchor from "@coral-xyz/anchor";

export const MEME_TOKEN_STATE_SEED = "meme_token_state";
export const PROTOCOL_STATE_SEED = "protocol_state_v2";
export const FEE_VAULT_SEED = "fee_vault";
export const VAULT_SEED = "vault";

// === Helper: Generate random meme_id ===
export function generateMemeId(): Buffer {
  const memeId = anchor.utils.bytes.utf8.encode(randomUUID()).slice(0, 32) as Buffer;
  return memeId;
}

// === Helper: Derive protocol state PDA ===
export function getProtocolStatePda(programId: PublicKey): [PublicKey, number] {
  const result = PublicKey.findProgramAddressSync([
    Buffer.from(PROTOCOL_STATE_SEED),
  ], programId);
  return result;
}

// === Helper: Derive fee vault PDA ===
export function getFeeVaultPda(programId: PublicKey): [PublicKey, number] {
  const result = PublicKey.findProgramAddressSync([
    Buffer.from(FEE_VAULT_SEED),
  ], programId);
  return result;
}

// === Helper: Derive meme token state PDA ===
export function getMemeTokenStatePda(memeId: Buffer, programId: PublicKey): [PublicKey, number] {
  const result = PublicKey.findProgramAddressSync([
    Buffer.from(MEME_TOKEN_STATE_SEED),
    memeId,
  ], programId);
  return result;
}

// === Helper: Derive vault PDA for a specific mint ===
export function getVaultPda(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  const result = PublicKey.findProgramAddressSync([
    Buffer.from(VAULT_SEED),
    mint.toBuffer(),
  ], programId);
  return result;
}

// === Converters and Utility helpers ===
export function memeIdToString(memeId: Buffer | number[]): string {
  const buffer = Buffer.isBuffer(memeId) ? memeId : Buffer.from(memeId);
  return buffer.toString('utf8').replace(/\0/g, '');
}

export function stringToMemeId(str: string): Buffer {
  const buffer = Buffer.alloc(32);
  Buffer.from(str, 'utf8').copy(buffer);
  return buffer;
}

export function lamportsToSol(lamports: number): number {
  return lamports / anchor.web3.LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * anchor.web3.LAMPORTS_PER_SOL);
}


