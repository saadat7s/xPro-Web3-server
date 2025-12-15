import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

import {
  getProtocolStatePda,
  getFeeVaultPda,
  getMemeTokenStatePda,
  getVaultPda,
} from "../helpers";
import { getProgram } from "../utils/getProgram";

// === Check Protocol State Status ===
export async function checkProtocolStateStatus(): Promise<{
  isInitialized: boolean;
  protocolState?: string;
  authority?: string;
  feeLamports?: string;
}> {
  const { program } = getProgram();

  try {
    const [protocolState] = getProtocolStatePda(program.programId);

    // Try to fetch the protocol state account
    const protocolStateAccount = await program.account.protocolState.fetch(protocolState) as any;

    return {
      isInitialized: true,
      protocolState: protocolState.toString(),
      authority: protocolStateAccount.authority.toString(),
      feeLamports: protocolStateAccount.feeLamports.toString(),
    };
  } catch (error: any) {
    // If account doesn't exist or can't be fetched, protocol is not initialized
    if (error.message?.includes("Account does not exist") || 
        error.message?.includes("AccountNotInitialized") ||
        error.code === "AccountNotFound") {
      return {
        isInitialized: false,
      };
    }
    
    // Re-throw unexpected errors
    throw error;
  }
}

// === Initialize Protocol State (unsigned) ===
// ⚠️ UPDATED: No longer accepts feeLamports parameter - it's hardcoded in contract to 0.01 SOL
export async function createInitializeProtocolStateTransaction(
  adminPublicKey: PublicKey,
) {
  const { program, connection } = getProgram();

  const [protocolState] = getProtocolStatePda(program.programId);
  const [feeVault] = getFeeVaultPda(program.programId);

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .initializeProtocolState() // ✅ No parameters - fee is hardcoded to 0.01 SOL
      .accounts({
        protocolState: protocolState,
        authority: adminPublicKey,
        feeVault: feeVault,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    transaction.feePayer = adminPublicKey;
    transaction.recentBlockhash = blockhash;

    return {
      success: true,
      message: "Initialize protocol state transaction created successfully! (Fee: 0.01 SOL)",
      transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
      accounts: {
        protocolState: protocolState.toString(),
        feeVault: feeVault.toString(),
        authority: adminPublicKey.toString(),
      },
      metadata: {
        mintFee: "0.01 SOL (10,000,000 lamports)",
        note: "Mint fee is hardcoded in the smart contract",
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating initialize protocol state transaction: ${error.message || error}`,
    };
  }
}

// ❌ REMOVED: Reset Protocol State function - no longer exists in contract
// The mint fee is now fixed at 0.01 SOL and cannot be changed

// === Mint Meme Token (unsigned) ===
// ✅ UNCHANGED: Still costs 0.01 SOL, but now it's enforced by the contract
export async function createMintMemeTokenTransaction(minterPublicKey: PublicKey, memeId: Buffer) {
  const { program, connection } = getProgram();

  const finalMemeId = memeId;

  // PDAs
  const [mintPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("meme_mint"), finalMemeId],
    program.programId,
  );
  const [protocolState] = getProtocolStatePda(program.programId);
  const [memeTokenState] = getMemeTokenStatePda(finalMemeId, program.programId);
  const [vault] = getVaultPda(mintPDA, program.programId);
  const [feeVault] = getFeeVaultPda(program.programId);

  // Token-2022 ATAs
  const minterTokenAccount = getAssociatedTokenAddressSync(
    mintPDA,
    minterPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );
  const vaultTokenAccount = getAssociatedTokenAddressSync(
    mintPDA,
    vault,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .mintMemeToken(Array.from(finalMemeId))
      .accounts({
        minter: minterPublicKey,
        memeTokenState,
        mint: mintPDA,
        vault,
        minterTokenAccount,
        vaultTokenAccount,
        feeVault,
        protocolState,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .transaction();

    transaction.feePayer = minterPublicKey;
    transaction.recentBlockhash = blockhash;

    return {
      success: true,
      message: "Mint meme token transaction created successfully!",
      transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
      accounts: {
        memeId: Buffer.from(finalMemeId).toString("hex"),
        mint: mintPDA.toString(),
        minter: minterPublicKey.toString(),
        memeTokenState: memeTokenState.toString(),
        vault: vault.toString(),
        minterTokenAccount: minterTokenAccount.toString(),
        vaultTokenAccount: vaultTokenAccount.toString(),
        feeVault: feeVault.toString(),
        protocolState: protocolState.toString(),
      },
      metadata: {
        fee: "0.01 SOL (10,000,000 lamports)",
        totalSupply: "1,000,000,000 tokens",
        distribution: {
          creator: "0.1% (1,000,000 tokens)",
          vault: "99.9% (999,000,000 tokens)",
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating mint meme token transaction: ${error.message || error}`,
    };
  }
}

// === Create Associated Token Account (Token-2022, unsigned) ===
// ✅ UNCHANGED: Utility function still needed
export async function createCreateAssociatedTokenAccountTransaction(
  payerPublicKey: PublicKey,
  mint: PublicKey,
  owner: PublicKey,
) {
  const { connection } = getProgram();

  try {
    const associatedTokenAddress = getAssociatedTokenAddressSync(
      mint,
      owner,
      owner instanceof PublicKey ? false : false,
      TOKEN_2022_PROGRAM_ID,
    );

    const ix = createAssociatedTokenAccountInstruction(
      payerPublicKey,
      associatedTokenAddress,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = new Transaction().add(ix);
    transaction.feePayer = payerPublicKey;
    transaction.recentBlockhash = blockhash;

    return {
      success: true,
      message: "Create associated token account transaction created successfully!",
      transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
      accounts: {
        associatedTokenAccount: associatedTokenAddress.toString(),
        owner: owner.toString(),
        mint: mint.toString(),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating create ATA transaction: ${error.message || error}`,
    };
  }
}