import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { getProgram } from "../utils/getProgram";
import {
  getAmmPoolPda,
  getSolVaultPda,
  getTokenVaultPda,
} from "../ammService";

// ==================== HELPER FUNCTIONS ====================

/**
 * Convert human-readable amount to base units (multiply by 10^decimals)
 * @param amount Human-readable amount (e.g., 100 tokens)
 * @param decimals Token decimals (default: 9)
 * @returns Base units (e.g., 100_000_000_000)
 */
function toBaseUnits(amount: number | string, decimals: number = 9): string {
  const numAmount = Number(amount);
  const baseUnits = Math.floor(numAmount * Math.pow(10, decimals));
  return baseUnits.toString();
}

/**
 * Calculate expected token output when buying with SOL
 * @param solAmount SOL to spend (in lamports)
 * @param solReserve Current SOL in pool (in lamports)
 * @param tokenReserve Current tokens in pool (in base units)
 * @returns Object with tokensOut, fee, and priceImpact
 */
export function calculateBuyOutput(
  solAmount: number,
  solReserve: number,
  tokenReserve: string,
): {
  tokensOut: string;
  fee: number;
  priceImpact: number;
  newPrice: number;
} {
  // 0.3% fee
  const fee = Math.floor(solAmount * 0.003);
  const solAfterFee = solAmount - fee;

  // Constant product formula: (x + dx) * (y - dy) = x * y
  const tokenReserveBN = BigInt(tokenReserve);
  const tokensOutBN =
    (BigInt(solAfterFee) * tokenReserveBN) /
    (BigInt(solReserve) + BigInt(solAfterFee));

  // Calculate price impact
  const oldPrice = solReserve / (Number(tokenReserveBN) / 1e9);
  const newSolReserve = solReserve + solAmount;
  const newTokenReserve = tokenReserveBN - tokensOutBN;
  const newPrice = newSolReserve / (Number(newTokenReserve) / 1e9);
  const priceImpact = ((newPrice - oldPrice) / oldPrice) * 100;

  return {
    tokensOut: tokensOutBN.toString(),
    fee,
    priceImpact,
    newPrice,
  };
}

/**
 * Calculate expected SOL output when selling tokens
 * @param tokenAmount Tokens to sell (in base units)
 * @param solReserve Current SOL in pool (in lamports)
 * @param tokenReserve Current tokens in pool (in base units)
 * @returns Object with solOut, fee, and priceImpact
 */
export function calculateSellOutput(
  tokenAmount: string,
  solReserve: number,
  tokenReserve: string,
): {
  solOut: number;
  fee: string;
  priceImpact: number;
  newPrice: number;
} {
  const tokenAmountBN = BigInt(tokenAmount);
  const tokenReserveBN = BigInt(tokenReserve);

  // 0.3% fee
  const feeBN = (tokenAmountBN * BigInt(3)) / BigInt(1000);
  const tokensAfterFee = tokenAmountBN - feeBN;

  // Constant product formula
  const solOutBN =
    (tokensAfterFee * BigInt(solReserve)) /
    (tokenReserveBN + tokensAfterFee);
  const solOut = Number(solOutBN);

  // Calculate price impact
  const oldPrice = solReserve / (Number(tokenReserveBN) / 1e9);
  const newSolReserve = solReserve - solOut;
  const newTokenReserve = tokenReserveBN + tokenAmountBN;
  const newPrice = newSolReserve / (Number(newTokenReserve) / 1e9);
  const priceImpact = ((oldPrice - newPrice) / oldPrice) * 100;

  return {
    solOut,
    fee: feeBN.toString(),
    priceImpact,
    newPrice,
  };
}

// ==================== POOL INITIALIZATION ====================

/**
 * Initialize AMM Pool (creates bonding curve for trading)
 * ⚠️ UPDATED: No longer creates LP tokens - just sets up trading pool
 */
export async function createInitializeAmmPoolTransaction(
  initializerPublicKey: PublicKey,
  tokenMintAddress: string,
  initialSolAmount: number, // in SOL (e.g., 0.02)
  initialTokenAmount: number | string, // in human-readable tokens (e.g., 800_000_000)
) {
  const { program, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  const initialSolLamports = Math.floor(initialSolAmount * LAMPORTS_PER_SOL);
  const initialTokenBaseUnits = toBaseUnits(initialTokenAmount, 9);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  // Minting vault PDA
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), tokenMint.toBuffer()],
    program.programId,
  );

  const vaultTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    vaultPda,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .initializeAmmPool(
        new anchor.BN(initialSolLamports),
        new anchor.BN(initialTokenBaseUnits),
      )
      .accounts({
        initializer: initializerPublicKey,
        tokenMint,
        pool: poolPda,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        vault: vaultPda,
        vaultTokenAccount: vaultTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    transaction.feePayer = initializerPublicKey;
    transaction.recentBlockhash = blockhash;

    // Calculate initial price
    const initialPrice =
      initialSolLamports / (Number(initialTokenBaseUnits) / 1e9);

    return {
      success: true,
      message: "Initialize AMM pool transaction created successfully! Trading will be enabled.",
      transaction: transaction
        .serialize({ requireAllSignatures: false })
        .toString("base64"),
      accounts: {
        pool: poolPda.toString(),
        solVault: solVaultPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        vault: vaultPda.toString(),
        vaultTokenAccount: vaultTokenAccount.toString(),
        tokenMint: tokenMint.toString(),
      },
      metadata: {
        initialSolAmount: `${initialSolAmount} SOL (${initialSolLamports} lamports)`,
        initialTokenAmount: `${initialTokenAmount} tokens (${initialTokenBaseUnits} base units)`,
        initialPrice: `${initialPrice.toExponential(8)} SOL per token`,
        note: "No LP tokens issued - this is a bonding curve",
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating initialize AMM pool transaction: ${error.message || error}`,
    };
  }
}

// ❌ REMOVED: Add Liquidity function - no longer exists in bonding curve model
// ❌ REMOVED: Remove Liquidity function - no longer exists in bonding curve model

// ==================== TRADING FUNCTIONS ====================

/**
 * Buy Tokens (Swap SOL to Tokens)
 * User sends SOL → receives tokens based on bonding curve
 */
export async function createSwapSolForTokensTransaction(
  userPublicKey: PublicKey,
  tokenMintAddress: string,
  solAmount: number, // in SOL (e.g., 0.01)
  minTokenAmount: number | string, // in human-readable tokens (slippage protection)
) {
  const { program, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);
  const solLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const minTokenBaseUnits = toBaseUnits(minTokenAmount, 9);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    userPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .swapSolToTokens(
        new anchor.BN(solLamports),
        new anchor.BN(minTokenBaseUnits),
      )
      .accounts({
        user: userPublicKey,
        pool: poolPda,
        tokenMint,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        userTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    transaction.feePayer = userPublicKey;
    transaction.recentBlockhash = blockhash;

    return {
      success: true,
      message: "Buy tokens transaction created successfully!",
      transaction: transaction
        .serialize({ requireAllSignatures: false })
        .toString("base64"),
      accounts: {
        pool: poolPda.toString(),
        tokenMint: tokenMint.toString(),
        solVault: solVaultPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        userTokenAccount: userTokenAccount.toString(),
      },
      metadata: {
        solAmount: `${solAmount} SOL (${solLamports} lamports)`,
        minTokenAmount: `${minTokenAmount} tokens (${minTokenBaseUnits} base units)`,
        fee: "0.3% of SOL input",
        action: "BUY",
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating buy tokens transaction: ${error.message || error}`,
    };
  }
}

/**
 * Sell Tokens (Swap Tokens to SOL)
 * User sends tokens → receives SOL based on bonding curve
 */
export async function createSwapTokensForSolTransaction(
  userPublicKey: PublicKey,
  tokenMintAddress: string,
  tokenAmount: number | string, // in human-readable tokens (e.g., 1000)
  minSolAmount: number, // in SOL (slippage protection, e.g., 0.001)
) {
  const { program, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);
  const tokenBaseUnits = toBaseUnits(tokenAmount, 9);
  const minSolLamports = Math.floor(minSolAmount * LAMPORTS_PER_SOL);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    userPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .swapTokensToSol(
        new anchor.BN(tokenBaseUnits),
        new anchor.BN(minSolLamports),
      )
      .accounts({
        user: userPublicKey,
        pool: poolPda,
        tokenMint,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        userTokenAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    transaction.feePayer = userPublicKey;
    transaction.recentBlockhash = blockhash;

    return {
      success: true,
      message: "Sell tokens transaction created successfully!",
      transaction: transaction
        .serialize({ requireAllSignatures: false })
        .toString("base64"),
      accounts: {
        pool: poolPda.toString(),
        tokenMint: tokenMint.toString(),
        solVault: solVaultPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        userTokenAccount: userTokenAccount.toString(),
      },
      metadata: {
        tokenAmount: `${tokenAmount} tokens (${tokenBaseUnits} base units)`,
        minSolAmount: `${minSolAmount} SOL (${minSolLamports} lamports)`,
        fee: "0.3% of token input",
        action: "SELL",
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating sell tokens transaction: ${error.message || error}`,
    };
  }
}

// ==================== UTILITY EXPORTS ====================

export { toBaseUnits };