import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { getProgram } from "./service";

interface AmmPool {
  isInitialized: number;
  tokenMint: PublicKey;
  lpMint: PublicKey;
  solVault: PublicKey;
  tokenVault: PublicKey;
  solReserve: anchor.BN;
  tokenReserve: anchor.BN;
  lpSupply: anchor.BN;
}

// AMM Seeds
const AMM_POOL_SEED = "amm_pool";
const LP_MINT_SEED = "lp_mint";
const POOL_SOL_VAULT_SEED = "pool_sol_vault";
const POOL_TOKEN_VAULT_SEED = "pool_token_vault";

// Helper: Derive AMM Pool PDA
export function getAmmPoolPda(tokenMint: PublicKey, programId: PublicKey): [PublicKey, number] {
  console.log("🏊 [getAmmPoolPda] Deriving AMM pool PDA for token:", tokenMint.toBase58());
  
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(AMM_POOL_SEED), tokenMint.toBuffer()],
    programId
  );
  
  console.log("🏊 [getAmmPoolPda] Pool PDA:", pda.toBase58(), "bump:", bump);
  return [pda, bump];
}

// Helper: Derive LP Mint PDA
export function getLpMintPda(tokenMint: PublicKey, programId: PublicKey): [PublicKey, number] {
  console.log("🪙 [getLpMintPda] Deriving LP mint PDA for token:", tokenMint.toBase58());
  
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(LP_MINT_SEED), tokenMint.toBuffer()],
    programId
  );
  
  console.log("🪙 [getLpMintPda] LP Mint PDA:", pda.toBase58(), "bump:", bump);
  return [pda, bump];
}

// Helper: Derive SOL Vault PDA
export function getSolVaultPda(tokenMint: PublicKey, programId: PublicKey): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_SOL_VAULT_SEED), tokenMint.toBuffer()],
    programId
  );
  return [pda, bump];
}

// Helper: Derive Token Vault PDA
export function getTokenVaultPda(tokenMint: PublicKey, programId: PublicKey): [PublicKey, number] {
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_TOKEN_VAULT_SEED), tokenMint.toBuffer()],
    programId
  );
  return [pda, bump];
}

/**
 * Initialize a new AMM pool
 */
export async function initializeAmmPool(
  tokenMintAddress: string,
  initialSolAmount: number,      // in SOL
  initialTokenAmount: number,    // in token base units (with decimals)
) {
  console.log("🏊 [initializeAmmPool] Starting pool initialization...");
  console.log("   Token mint:", tokenMintAddress);
  console.log("   Initial SOL:", initialSolAmount, "SOL");
  console.log("   Initial tokens:", initialTokenAmount);

  const { program, adminKeypair, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  // Convert SOL to lamports
  const initialSolLamports = Math.floor(initialSolAmount * LAMPORTS_PER_SOL);

  // Derive all PDAs
  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [lpMintPda] = getLpMintPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  // Get user's token account
  const initializerTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  // Get user's LP token account
  const initializerLpAccount = getAssociatedTokenAddressSync(
    lpMintPda,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  console.log("🏊 [initializeAmmPool] Account summary:");
  console.log("   Pool PDA:", poolPda.toBase58());
  console.log("   LP Mint PDA:", lpMintPda.toBase58());
  console.log("   SOL Vault PDA:", solVaultPda.toBase58());
  console.log("   Token Vault PDA:", tokenVaultPda.toBase58());
  console.log("   Initializer token account:", initializerTokenAccount.toBase58());
  console.log("   Initializer LP account:", initializerLpAccount.toBase58());

  try {
    console.log("🏊 [initializeAmmPool] Sending transaction...");

    const tx = await program.methods
      .initializeAmmPool(
        new anchor.BN(initialSolLamports),
        new anchor.BN(initialTokenAmount)
      )
      .accounts({
        initializer: adminKeypair.publicKey,
        tokenMint,
        pool: poolPda,
        lpMint: lpMintPda,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        initializerTokenAccount,
        initializerLpAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ [initializeAmmPool] Pool initialized successfully!");
    console.log("   Transaction:", tx);

    return {
      success: true,
      transactionId: tx,
      poolAddress: poolPda.toBase58(),
      lpMintAddress: lpMintPda.toBase58(),
      solVault: solVaultPda.toBase58(),
      tokenVault: tokenVaultPda.toBase58(),
      initialSol: initialSolAmount,
      initialTokens: initialTokenAmount,
    };
  } catch (error: any) {
    console.error("❌ [initializeAmmPool] Error:", error);
    if (error.logs) {
      console.error("Transaction logs:");
      error.logs.forEach((log: string, i: number) => console.error(`  ${i + 1}: ${log}`));
    }
    throw error;
  }
}

/**
 * Add liquidity to an existing pool
 */
export async function addLiquidity(
  tokenMintAddress: string,
  solAmount: number,           // in SOL
  maxTokenAmount: number,      // in token base units
  minLpAmount: number = 0,     // minimum LP tokens to receive
) {
  console.log("💧 [addLiquidity] Adding liquidity...");
  console.log("   Token mint:", tokenMintAddress);
  console.log("   SOL amount:", solAmount);
  console.log("   Max token amount:", maxTokenAmount);

  const { program, adminKeypair } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);
  const solLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  // Derive PDAs
  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [lpMintPda] = getLpMintPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const userLpAccount = getAssociatedTokenAddressSync(
    lpMintPda,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  try {
    const tx = await program.methods
      .addLiquidityToPool(
        new anchor.BN(solLamports),
        new anchor.BN(maxTokenAmount),
        new anchor.BN(minLpAmount)
      )
      .accounts({
        user: adminKeypair.publicKey,
        pool: poolPda,
        lpMint: lpMintPda,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        userTokenAccount,
        userLpAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ [addLiquidity] Liquidity added successfully!");
    console.log("   Transaction:", tx);

    return {
      success: true,
      transactionId: tx,
      solAmount,
      tokenAmount: maxTokenAmount, // You can calculate exact amount from pool state
    };
  } catch (error: any) {
    console.error("❌ [addLiquidity] Error:", error);
    if (error.logs) {
      error.logs.forEach((log: string) => console.error(log));
    }
    throw error;
  }
}

/**
 * Remove liquidity from pool
 */
export async function removeLiquidity(
  tokenMintAddress: string,
  lpAmount: number,
  minSolAmount: number = 0,
  minTokenAmount: number = 0,
) {
  console.log("💧 [removeLiquidity] Removing liquidity...");

  const { program, adminKeypair } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [lpMintPda] = getLpMintPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  const userLpAccount = getAssociatedTokenAddressSync(
    lpMintPda,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  try {
    const tx = await program.methods
      .removeLiquidityFromPool(
        new anchor.BN(lpAmount),
        new anchor.BN(minSolAmount),
        new anchor.BN(minTokenAmount)
      )
      .accounts({
        user: adminKeypair.publicKey,
        pool: poolPda,
        lpMint: lpMintPda,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        userTokenAccount,
        userLpAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ [removeLiquidity] Liquidity removed successfully!");
    console.log("   Transaction:", tx);

    return {
      success: true,
      transactionId: tx,
      lpAmount,
    };
  } catch (error: any) {
    console.error("❌ [removeLiquidity] Error:", error);
    throw error;
  }
}

/**
 * Swap SOL for tokens
 */
export async function swapSolForTokens(
  tokenMintAddress: string,
  solAmount: number,        // in SOL
  minTokenAmount: number,   // minimum tokens to receive (slippage protection)
) {
  console.log("🔄 [swapSolForTokens] Swapping SOL for tokens...");
  console.log("   SOL amount:", solAmount);
  console.log("   Min token amount:", minTokenAmount);

  const { program, adminKeypair } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);
  const solLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  try {
    const tx = await program.methods
      .swapSolToTokens(
        new anchor.BN(solLamports),
        new anchor.BN(minTokenAmount)
      )
      .accounts({
        user: adminKeypair.publicKey,
        pool: poolPda,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ [swapSolForTokens] Swap successful!");
    console.log("   Transaction:", tx);

    return {
      success: true,
      transactionId: tx,
      inputAmount: solAmount,
      inputToken: "SOL",
    };
  } catch (error: any) {
    console.error("❌ [swapSolForTokens] Error:", error);
    throw error;
  }
}

/**
 * Swap tokens for SOL
 */
export async function swapTokensForSol(
  tokenMintAddress: string,
  tokenAmount: number,
  minSolAmount: number,
) {
  console.log("🔄 [swapTokensForSol] Swapping tokens for SOL...");

  const { program, adminKeypair } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID
  );

  try {
    const tx = await program.methods
      .swapTokensToSol(
        new anchor.BN(tokenAmount),
        new anchor.BN(minSolAmount)
      )
      .accounts({
        user: adminKeypair.publicKey,
        pool: poolPda,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        userTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log("✅ [swapTokensForSol] Swap successful!");
    console.log("   Transaction:", tx);

    return {
      success: true,
      transactionId: tx,
      inputAmount: tokenAmount,
      inputToken: "TOKEN",
    };
  } catch (error: any) {
    console.error("❌ [swapTokensForSol] Error:", error);
    throw error;
  }
}

/**
 * Get pool information
 */
export async function getPoolInfo(tokenMintAddress: string) {
  console.log("📊 [getPoolInfo] Fetching pool info...");

  const { program } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);

  try {
    const poolAccount = await program.account.ammPool.fetch(poolPda) as unknown as AmmPool;

    const poolInfo = {
      address: poolPda.toBase58(),
      tokenMint: poolAccount.tokenMint.toBase58(),
      lpMint: poolAccount.lpMint.toBase58(),
      solVault: poolAccount.solVault.toBase58(),
      tokenVault: poolAccount.tokenVault.toBase58(),
      solReserve: poolAccount.solReserve.toString(),
      tokenReserve: poolAccount.tokenReserve.toString(),
      lpSupply: poolAccount.lpSupply.toString(),
      solReserveInSol: poolAccount.solReserve.toNumber() / LAMPORTS_PER_SOL,
      tokenReserveFormatted: poolAccount.tokenReserve.toNumber() / 1e9, // Assuming 9 decimals
      isInitialized: poolAccount.isInitialized,
    };

    console.log("✅ [getPoolInfo] Pool info retrieved:", poolInfo);
    return poolInfo;
  } catch (error) {
    console.error("❌ [getPoolInfo] Error:", error);
    return null;
  }
}

/**
 * Calculate price from pool reserves
 */
export function calculatePrice(solReserve: number, tokenReserve: number): number {
  // Price in SOL per token
  return solReserve / tokenReserve;
}

/**
 * Calculate expected output for a swap (with fee)
 */
export function calculateSwapOutput(
  inputAmount: number,
  inputReserve: number,
  outputReserve: number,
  feeNumerator: number = 3,
  feeDenominator: number = 1000
): number {
  // Apply fee
  const inputAfterFee = inputAmount * (1 - feeNumerator / feeDenominator);
  
  // Constant product formula: output = (input * outputReserve) / (inputReserve + input)
  const output = (inputAfterFee * outputReserve) / (inputReserve + inputAfterFee);
  
  return output;
}