import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
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
 * ⚠️ UPDATED: Fixed parameters (0.02 SOL + 800M tokens) - no parameters needed!
 * The Rust program uses FIXED_INITIAL_SOL (0.02 SOL) and FIXED_INITIAL_TOKENS (800M tokens)
 */
export async function createInitializeAmmPoolTransaction(
  initializerPublicKey: PublicKey,
  tokenMintAddress: string,
) {
  const { program, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  // Fixed constants from Rust program
  const FIXED_INITIAL_SOL = 20_000_000; // 0.02 SOL in lamports
  const FIXED_INITIAL_TOKENS = 800_000_000_000_000_000; // 800M tokens in base units

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

    // ⚠️ IMPORTANT: initializeAmmPool() takes NO parameters - it uses fixed values from the contract
    const transaction = await program.methods
      .initializeAmmPool()
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

    // Calculate initial price using virtual reserves (for display purposes)
    const INITIAL_VIRTUAL_SOL_RESERVES = 30_000_000_000; // 30 SOL
    const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000_000_000_000; // 1.073B tokens
    const virtualSolReserve = INITIAL_VIRTUAL_SOL_RESERVES + FIXED_INITIAL_SOL;
    const initialPrice = virtualSolReserve / (Number(INITIAL_VIRTUAL_TOKEN_RESERVES) / 1e9);

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
        initialSolAmount: `0.02 SOL (${FIXED_INITIAL_SOL} lamports) - FIXED`,
        initialTokenAmount: `800,000,000 tokens (${FIXED_INITIAL_TOKENS} base units) - FIXED`,
        initialPrice: `${initialPrice.toExponential(8)} SOL per token (using virtual reserves)`,
        note: "Pool uses fixed parameters (pump.fun style). No LP tokens issued - this is a bonding curve.",
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
 * ⚠️ UPDATED: minTokenAmount is now optional (defaults to 0 = no slippage protection)
 * ⚠️ UPDATED: Automatically creates token account if it doesn't exist
 */
export async function createSwapSolForTokensTransaction(
  userPublicKey: PublicKey,
  tokenMintAddress: string,
  solAmount: number, // in SOL (e.g., 0.01)
  minTokenAmount?: number, // ⭐ Optional parameter - in human-readable tokens (slippage protection)
): Promise<{
  success: boolean;
  transaction?: string;
  accounts?: any;
  metadata?: any;
  message: string;
}> {
  const { program, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  // Get pool and vault PDAs
  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  // Get user's token account address
  const userTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    userPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // Check if token account exists
  const accountInfo = await connection.getAccountInfo(userTokenAccount);

  // Build transaction
  const transaction = new Transaction();

  // Add create ATA instruction if needed
  if (!accountInfo) {
    console.log("🔧 Creating token account...");
    const createAtaIx = createAssociatedTokenAccountInstruction(
      userPublicKey,
      userTokenAccount,
      userPublicKey,
      tokenMint,
      TOKEN_2022_PROGRAM_ID,
    );
    transaction.add(createAtaIx);
  }

  // Convert amounts to base units
  const solLamports = new anchor.BN(Math.floor(solAmount * LAMPORTS_PER_SOL));

  // ⭐ Use provided minTokenAmount or default to 0 (no slippage check)
  const minTokensBaseUnits = minTokenAmount
    ? new anchor.BN(Math.floor(minTokenAmount * 1e9))
    : new anchor.BN(0); // 0 = no slippage protection

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    // Create swap instruction
    const swapIx = await program.methods
      .swapSolToTokens(solLamports, minTokensBaseUnits)
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
      .instruction();

    transaction.add(swapIx);

    // Set recent blockhash and fee payer
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;

    // Serialize
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      success: true,
      transaction: serializedTx.toString("base64"),
      accounts: {
        pool: poolPda.toString(),
        tokenMint: tokenMint.toString(),
        solVault: solVaultPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        userTokenAccount: userTokenAccount.toString(),
      },
      metadata: {
        solAmount: `${solAmount} SOL (${solLamports.toString()} lamports)`,
        minTokenAmount: minTokenAmount
          ? `${minTokenAmount} tokens (${minTokensBaseUnits.toString()} base units)`
          : "No minimum (pump.fun mode)",
        slippageProtection: minTokenAmount ? "ENABLED" : "DISABLED",
        fee: "0.3% of SOL input",
        action: "BUY",
        accountCreated: !accountInfo,
      },
      message: !accountInfo
        ? "Buy transaction created (includes token account creation)"
        : "Buy transaction created successfully!",
    };
  } catch (error: any) {
    console.error("Error creating buy transaction:", error);
    return {
      success: false,
      message: error.message || "Failed to create buy transaction",
    };
  }
}

/**
 * Sell Tokens (Swap Tokens to SOL)
 * User sends tokens → receives SOL based on bonding curve
 * ⚠️ UPDATED: minSolAmount is now optional (defaults to 0 = no slippage protection)
 */
export async function createSwapTokensForSolTransaction(
  userPublicKey: PublicKey,
  tokenMintAddress: string,
  tokenAmount: number | string, // in human-readable tokens (e.g., 1000)
  minSolAmount?: number, // ⭐ Optional parameter - in SOL (slippage protection, e.g., 0.001)
): Promise<{
  success: boolean;
  transaction?: string;
  accounts?: any;
  metadata?: any;
  message: string;
}> {
  const { program, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  // Get pool and vault PDAs
  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  // Get user's token account
  const userTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    userPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  // Convert amounts to base units
  const tokenBaseUnits = toBaseUnits(tokenAmount, 9);

  // ⭐ Use provided minSolAmount or default to 0 (no slippage check)
  const minSolLamports = minSolAmount
    ? new anchor.BN(Math.floor(minSolAmount * LAMPORTS_PER_SOL))
    : new anchor.BN(0); // 0 = no slippage protection

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    // Create swap instruction
    const swapIx = await program.methods
      .swapTokensToSol(new anchor.BN(tokenBaseUnits), minSolLamports)
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
      .instruction();

    const transaction = new Transaction().add(swapIx);

    // Set recent blockhash and fee payer
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;

    // Serialize
    const serializedTx = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      success: true,
      transaction: serializedTx.toString("base64"),
      accounts: {
        pool: poolPda.toString(),
        tokenMint: tokenMint.toString(),
        solVault: solVaultPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        userTokenAccount: userTokenAccount.toString(),
      },
      metadata: {
        tokenAmount: `${tokenAmount} tokens (${tokenBaseUnits} base units)`,
        minSolAmount: minSolAmount
          ? `${minSolAmount} SOL (${minSolLamports.toString()} lamports)`
          : "No minimum (pump.fun mode)",
        slippageProtection: minSolAmount ? "ENABLED" : "DISABLED",
        fee: "0.3% of token input",
        action: "SELL",
      },
      message: "Sell transaction created successfully!",
    };
  } catch (error: any) {
    console.error("Error creating sell transaction:", error);
    return {
      success: false,
      message: error.message || "Failed to create sell transaction",
    };
  }
}

// ==================== UTILITY EXPORTS ====================

export { toBaseUnits };