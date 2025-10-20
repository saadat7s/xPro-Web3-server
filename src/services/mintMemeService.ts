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

// === Initialize Protocol State (unsigned) ===
export async function createInitializeProtocolStateTransaction(
  adminPublicKey: PublicKey,
  feeLamports: number,
) {
  const { program, connection } = getProgram();

  const [protocolState] = getProtocolStatePda(program.programId);
  const [feeVault] = getFeeVaultPda(program.programId);

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .initializeProtocolState(new anchor.BN(feeLamports))
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
      message: "Initialize protocol state transaction created successfully!",
      transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
      accounts: {
        protocolState: protocolState.toString(),
        feeVault: feeVault.toString(),
        authority: adminPublicKey.toString(),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating initialize protocol state transaction: ${error.message || error}`,
    };
  }
}

// === Reset Protocol State (unsigned) ===
export async function createResetProtocolStateTransaction(adminPublicKey: PublicKey) {
  const { program, connection } = getProgram();

  const [protocolState] = getProtocolStatePda(program.programId);

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .resetProtocolState()
      .accounts({
        protocolState,
        authority: adminPublicKey,
      })
      .transaction();

    transaction.feePayer = adminPublicKey;
    transaction.recentBlockhash = blockhash;

    return {
      success: true,
      message: "Reset protocol state transaction created successfully!",
      transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
      accounts: {
        protocolState: protocolState.toString(),
        authority: adminPublicKey.toString(),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating reset protocol state transaction: ${error.message || error}`,
    };
  }
}

// === Mint Meme Token (unsigned) ===
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
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating mint meme token transaction: ${error.message || error}`,
    };
  }
}

// === Create Associated Token Account (Token-2022, unsigned) ===
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


