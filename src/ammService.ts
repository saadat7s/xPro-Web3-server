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
import { getProgram } from "./service";

// ⚠️ UPDATED: Removed lpMint and lpSupply - bonding curve model doesn't use LP tokens
interface AmmPool {
  isInitialized: boolean;
  tokenMint: PublicKey;
  solVault: PublicKey;
  tokenVault: PublicKey;
  realSolReserve: anchor.BN;
  realTokenReserve: anchor.BN;
  virtualSolReserve: anchor.BN;
  virtualTokenReserve: anchor.BN;
}

// AMM Seeds
const AMM_POOL_SEED = "amm_pool";
// ❌ REMOVED: LP_MINT_SEED - bonding curve model doesn't use LP tokens
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

// ❌ REMOVED: getLpMintPda - bonding curve model doesn't use LP tokens

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
 * ⚠️ UPDATED: No longer accepts parameters - uses FIXED values from Rust program
 * Fixed: 0.02 SOL + 800M tokens (pump.fun style)
 */
export async function initializeAmmPool(
  tokenMintAddress: string,
) {
  console.log("🏊 [initializeAmmPool] Starting pool initialization...");
  console.log("   Token mint:", tokenMintAddress);
  console.log("   Using FIXED parameters: 0.02 SOL + 800M tokens");

  const { program, adminKeypair } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  // Derive AMM PDAs
  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  // Derive minting vault PDAs
  console.log("🔑 [initializeAmmPool] Deriving minting vault PDAs...");
  
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), tokenMint.toBuffer()],
    program.programId
  );
  console.log("   Vault PDA:", vaultPda.toBase58());

  const vaultTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    vaultPda,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("   Vault Token Account:", vaultTokenAccount.toBase58());

  console.log("🏊 [initializeAmmPool] Account summary:");
  console.log("   Pool PDA:", poolPda.toBase58());
  console.log("   SOL Vault PDA:", solVaultPda.toBase58());
  console.log("   Token Vault PDA:", tokenVaultPda.toBase58());
  console.log("   Minting Vault PDA:", vaultPda.toBase58());
  console.log("   Minting Vault Token Account:", vaultTokenAccount.toBase58());

  try {
    console.log("🏊 [initializeAmmPool] Sending transaction...");

    // ⚠️ IMPORTANT: initializeAmmPool() takes NO parameters
    const tx = await program.methods
      .initializeAmmPool()
      .accounts({
        initializer: adminKeypair.publicKey,
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
      .rpc();

    console.log("✅ [initializeAmmPool] Pool initialized successfully!");
    console.log("   Transaction:", tx);

    return {
      success: true,
      transactionId: tx,
      poolAddress: poolPda.toBase58(),
      solVault: solVaultPda.toBase58(),
      tokenVault: tokenVaultPda.toBase58(),
      vaultUsed: vaultPda.toBase58(),
      initialSol: 0.02, // Fixed value
      initialTokens: "800000000", // Fixed value
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
 * ❌ DEPRECATED: Add liquidity to an existing pool
 * This function no longer works - the bonding curve model doesn't use LP tokens
 * Users buy/sell directly with the pool instead
 */
// export async function addLiquidity(
//   tokenMintAddress: string,
//   solAmount: number,
//   maxTokenAmount: number | string,
//   minLpAmount: number | string = 0,
// ) {
//   // This function is deprecated - bonding curve model doesn't support adding liquidity
//   throw new Error("addLiquidity is not supported in the bonding curve model");
// }

// /**
//  * Remove liquidity from pool
//  */
// export async function removeLiquidity(
//   tokenMintAddress: string,
//   lpAmount: number | string,
//   minSolAmount: number = 0,
//   minTokenAmount: number | string = 0,
// ) {
//   console.log("💧 [removeLiquidity] Removing liquidity...");

//   const { program, adminKeypair } = getProgram();
//   const tokenMint = new PublicKey(tokenMintAddress);

//   const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
//   const [lpMintPda] = getLpMintPda(tokenMint, program.programId);
//   const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
//   const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

//   const userTokenAccount = getAssociatedTokenAddressSync(
//     tokenMint,
//     adminKeypair.publicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID
//   );

//   const userLpAccount = getAssociatedTokenAddressSync(
//     lpMintPda,
//     adminKeypair.publicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID
//   );

//   try {
//     const tx = await program.methods
//       .removeLiquidityFromPool(
//         new anchor.BN(lpAmount.toString()),
//         new anchor.BN(minSolAmount),
//         new anchor.BN(minTokenAmount.toString())
//       )
//       .accounts({
//         user: adminKeypair.publicKey,
//         pool: poolPda,
//         tokenMint,
//         lpMint: lpMintPda,
//         solVault: solVaultPda,
//         tokenVault: tokenVaultPda,
//         userTokenAccount,
//         userLpAccount,
//         tokenProgram: TOKEN_2022_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .rpc();

//     console.log("✅ [removeLiquidity] Liquidity removed successfully!");
//     console.log("   Transaction:", tx);

//     return {
//       success: true,
//       transactionId: tx,
//       lpAmount: lpAmount.toString(),
//     };
//   } catch (error: any) {
//     console.error("❌ [removeLiquidity] Error:", error);
//     throw error;
//   }
// }

// /**
//  * Swap SOL for tokens
//  */
// export async function swapSolForTokens(
//   tokenMintAddress: string,
//   solAmount: number,
//   minTokenAmount: number | string,
// ) {
//   console.log("🔄 [swapSolForTokens] Swapping SOL for tokens...");
//   console.log("   SOL amount:", solAmount);
//   console.log("   Min token amount:", minTokenAmount);

//   const { program, adminKeypair } = getProgram();
//   const tokenMint = new PublicKey(tokenMintAddress);
//   const solLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

//   const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
//   const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
//   const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

//   const userTokenAccount = getAssociatedTokenAddressSync(
//     tokenMint,
//     adminKeypair.publicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID
//   );

//   try {
//     const tx = await program.methods
//       .swapSolToTokens(
//         new anchor.BN(solLamports),
//         new anchor.BN(minTokenAmount.toString())
//       )
//       .accounts({
//         user: adminKeypair.publicKey,
//         pool: poolPda,
//         tokenMint,
//         solVault: solVaultPda,
//         tokenVault: tokenVaultPda,
//         userTokenAccount,
//         tokenProgram: TOKEN_2022_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .rpc();

//     console.log("✅ [swapSolForTokens] Swap successful!");
//     console.log("   Transaction:", tx);

//     return {
//       success: true,
//       transactionId: tx,
//       inputAmount: solAmount,
//       inputToken: "SOL",
//     };
//   } catch (error: any) {
//     console.error("❌ [swapSolForTokens] Error:", error);
//     throw error;
//   }
// }

// /**
//  * Swap tokens for SOL
//  */
// export async function swapTokensForSol(
//   tokenMintAddress: string,
//   tokenAmount: number | string,
//   minSolAmount: number,
// ) {
//   console.log("🔄 [swapTokensForSol] Swapping tokens for SOL...");

//   const { program, adminKeypair } = getProgram();
//   const tokenMint = new PublicKey(tokenMintAddress);

//   const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
//   const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
//   const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

//   const userTokenAccount = getAssociatedTokenAddressSync(
//     tokenMint,
//     adminKeypair.publicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID
//   );

//   try {
//     const tx = await program.methods
//       .swapTokensToSol(
//         new anchor.BN(tokenAmount.toString()),
//         new anchor.BN(minSolAmount)
//       )
//       .accounts({
//         user: adminKeypair.publicKey,
//         pool: poolPda,
//         tokenMint,
//         solVault: solVaultPda,
//         tokenVault: tokenVaultPda,
//         userTokenAccount,
//         tokenProgram: TOKEN_2022_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .rpc();

//     console.log("✅ [swapTokensForSol] Swap successful!");
//     console.log("   Transaction:", tx);

//     return {
//       success: true,
//       transactionId: tx,
//       inputAmount: tokenAmount.toString(),
//       inputToken: "TOKEN",
//     };
//   } catch (error: any) {
//     console.error("❌ [swapTokensForSol] Error:", error);
//     throw error;
//   }
// }

/**
 * Get pool information
 * ⚠️ UPDATED: Removed lpMint and lpSupply - bonding curve model doesn't use LP tokens
 */
export async function getPoolInfo(tokenMintAddress: string) {
  console.log("📊 [getPoolInfo] Fetching pool info...");

  const { program } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);

  try {
    const poolAccount = await program.account.ammPool.fetch(poolPda) as any;

    // ⚠️ IMPORTANT: Rust struct uses real_sol_reserve, real_token_reserve, virtual_sol_reserve, virtual_token_reserve
    const realSolReserve = poolAccount.realSolReserve || poolAccount.real_sol_reserve;
    const realTokenReserve = poolAccount.realTokenReserve || poolAccount.real_token_reserve;
    const virtualSolReserve = poolAccount.virtualSolReserve || poolAccount.virtual_sol_reserve;
    const virtualTokenReserve = poolAccount.virtualTokenReserve || poolAccount.virtual_token_reserve;

    const poolInfo = {
      address: poolPda.toBase58(),
      tokenMint: poolAccount.tokenMint.toBase58(),
      solVault: poolAccount.solVault.toBase58(),
      tokenVault: poolAccount.tokenVault.toBase58(),
      // Real reserves (actual amounts in vaults)
      realSolReserve: realSolReserve.toString(),
      realTokenReserve: realTokenReserve.toString(),
      realSolReserveInSol: Number(realSolReserve.toString()) / LAMPORTS_PER_SOL,
      realTokenReserveFormatted: Number(realTokenReserve.toString()) / 1e9,
      // Virtual reserves (for price calculation)
      virtualSolReserve: virtualSolReserve.toString(),
      virtualTokenReserve: virtualTokenReserve.toString(),
      virtualSolReserveInSol: Number(virtualSolReserve.toString()) / LAMPORTS_PER_SOL,
      virtualTokenReserveFormatted: Number(virtualTokenReserve.toString()) / 1e9,
      // For backward compatibility, expose as solReserve/tokenReserve (using real reserves)
      solReserve: realSolReserve.toString(),
      tokenReserve: realTokenReserve.toString(),
      solReserveInSol: Number(realSolReserve.toString()) / LAMPORTS_PER_SOL,
      tokenReserveFormatted: Number(realTokenReserve.toString()) / 1e9,
      isInitialized: poolAccount.isInitialized,
    };

    console.log("✅ [getPoolInfo] Pool info retrieved:", poolInfo);
    return poolInfo;
  } catch (error) {
    console.error("❌ [getPoolInfo] Error:", error);
    return null;
  }
}

// /**
//  * Calculate price from pool reserves
//  */
// export function calculatePrice(solReserve: number, tokenReserve: number): number {
//   return solReserve / tokenReserve;
// }

// /**
//  * Calculate expected output for a swap (with fee)
//  */
// export function calculateSwapOutput(
//   inputAmount: number,
//   inputReserve: number,
//   outputReserve: number,
//   feeNumerator: number = 3,
//   feeDenominator: number = 1000
// ): number {
//   const inputAfterFee = inputAmount * (1 - feeNumerator / feeDenominator);
//   const output = (inputAfterFee * outputReserve) / (inputReserve + inputAfterFee);
//   return output;
// }