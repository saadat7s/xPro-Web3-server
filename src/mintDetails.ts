import { getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError, getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getProgram } from "./service";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { getVaultPda } from "./service";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { memeIdToString } from "./helpers";
import { stringToMemeId } from "./helpers";
import { getMemeTokenStatePda } from "./helpers";
import { BN } from "@coral-xyz/anchor";

// === Get Token Balance for any token account ===
export async function getTokenBalance(tokenAccountAddress: PublicKey): Promise<{
  balance: string;
  balanceNumber: number;
  decimals: number;
  mint: PublicKey;
} | null> {
  const { connection } = getProgram();

  try {
    const tokenAccount = await getAccount(
      connection,
      tokenAccountAddress,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );

    return {
      balance: tokenAccount.amount.toString(),
      balanceNumber: Number(tokenAccount.amount),
      decimals: 9, // We set this to 9 in our mint
      mint: tokenAccount.mint,
    };
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError ||
      error instanceof TokenInvalidAccountOwnerError) {
      console.log(`Token account ${tokenAccountAddress.toBase58()} not found or invalid`);
      return null;
    }
    console.error("Error fetching token balance:", error);
    return null;
  }
}

// === Get Meme Token Distribution Balances ===
// ⚠️ UPDATED: Changed from 2% to 0.1% for minter validation
export async function getMemeTokenDistribution(memeId: Buffer): Promise<{
  mint: PublicKey;
  totalSupply: string;
  minterBalance: {
    address: PublicKey;
    balance: string;
    balanceNumber: number;
    percentage: number;
  } | null;
  vaultBalance: {
    address: PublicKey;
    balance: string;
    balanceNumber: number;
    percentage: number;
  } | null;
  distributionSummary: {
    totalDistributed: number;
    minterShare: number;
    vaultShare: number;
    isCorrectDistribution: boolean;
  };
} | null> {
  const { program, adminKeypair } = getProgram();

  try {
    // Derive addresses
    const [mintPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("meme_mint"), memeId],
      program.programId
    );

    const [vault] = getVaultPda(mintPDA, program.programId);

    const minterTokenAccount = getAssociatedTokenAddressSync(
      mintPDA,
      adminKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const vaultTokenAccount = getAssociatedTokenAddressSync(
      mintPDA,
      vault,
      true, // allowOwnerOffCurve for PDA
      TOKEN_2022_PROGRAM_ID
    );

    // Get balances
    const minterBalance = await getTokenBalance(minterTokenAccount);
    const vaultBalance = await getTokenBalance(vaultTokenAccount);

    const TOTAL_SUPPLY = 1_000_000_000_000_000_000; // From Rust code

    let distributionSummary = {
      totalDistributed: 0,
      minterShare: 0,
      vaultShare: 0,
      isCorrectDistribution: false,
    };

    if (minterBalance && vaultBalance) {
      const minterNum = minterBalance.balanceNumber;
      const vaultNum = vaultBalance.balanceNumber;
      const total = minterNum + vaultNum;

      distributionSummary = {
        totalDistributed: total,
        minterShare: (minterNum / total) * 100,
        vaultShare: (vaultNum / total) * 100,
        // ✅ UPDATED: Changed from 2% to 0.1% (and 98% to 99.9%)
        isCorrectDistribution: total === TOTAL_SUPPLY &&
          Math.abs((minterNum / total) * 100 - 0.1) < 0.001 &&
          Math.abs((vaultNum / total) * 100 - 99.9) < 0.001,
      };
    }

    return {
      mint: mintPDA,
      totalSupply: TOTAL_SUPPLY.toString(),
      minterBalance: minterBalance ? {
        address: minterTokenAccount,
        balance: minterBalance.balance,
        balanceNumber: minterBalance.balanceNumber,
        percentage: distributionSummary.minterShare,
      } : null,
      vaultBalance: vaultBalance ? {
        address: vaultTokenAccount,
        balance: vaultBalance.balance,
        balanceNumber: vaultBalance.balanceNumber,
        percentage: distributionSummary.vaultShare,
      } : null,
      distributionSummary,
    };
  } catch (error) {
    console.error("Error getting meme token distribution:", error);
    return null;
  }
}

// === Get All Minted Tokens (requires you to track meme IDs) ===
export async function getAllMemeTokenBalances(memeIds: Buffer[]): Promise<Array<{
  memeId: string;
  memeIdHex: string;
  distribution: any;
}>> {
  const results = [];

  for (const memeId of memeIds) {
    const distribution = await getMemeTokenDistribution(memeId);

    results.push({
      memeId: memeIdToString(memeId),
      memeIdHex: memeId.toString('hex'),
      distribution,
    });
  }

  return results;
}

// === Format token amount for display ===
export function formatTokenAmount(amount: string, decimals: number = 9): string {
  const num = BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const wholePart = num / divisor;
  const fractionalPart = num % divisor;

  if (fractionalPart === 0n) {
    return wholePart.toString();
  } else {
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    return `${wholePart.toString()}.${trimmedFractional}`;
  }
}

// === Convenience function for the recent mint ===
export async function getRecentMintDistribution(memeIdString: string) {
  const memeIdBuffer = stringToMemeId(memeIdString);
  const distribution = await getMemeTokenDistribution(memeIdBuffer);

  if (!distribution) {
    return null;
  }

  return {
    mint: distribution.mint.toBase58(),
    totalSupply: formatTokenAmount(distribution.totalSupply),
    minter: distribution.minterBalance ? {
      address: distribution.minterBalance.address.toBase58(),
      balance: formatTokenAmount(distribution.minterBalance.balance),
      percentage: distribution.minterBalance.percentage.toFixed(4) + '%',
    } : null,
    vault: distribution.vaultBalance ? {
      address: distribution.vaultBalance.address.toBase58(),
      balance: formatTokenAmount(distribution.vaultBalance.balance),
      percentage: distribution.vaultBalance.percentage.toFixed(4) + '%',
    } : null,
    summary: {
      totalDistributed: formatTokenAmount(distribution.distributionSummary.totalDistributed.toString()),
      isCorrect: distribution.distributionSummary.isCorrectDistribution,
      minterShare: distribution.distributionSummary.minterShare.toFixed(4) + '%',
      vaultShare: distribution.distributionSummary.vaultShare.toFixed(4) + '%',
    }
  };
}

// === Get minted tokens by a specific user ===
// ⚠️ UPDATED: Added poolDetails with virtual reserves for pump.fun-style market cap calculation
export async function getMintedTokensByUser(userPublicKey: PublicKey): Promise<Array<{
  memeId: string;
  memeIdHex: string;
  mint: string;
  minter: string;
  createdAt: string;
  isInitialized: boolean;
  poolDetails?: {
    isInitialized: boolean;
    solReserve: string; // Real SOL reserve (for liquidity)
    tokenReserve: string; // Real token reserve
    virtualSolReserve: string; // Virtual SOL reserve (for market cap)
    virtualTokenReserve: string; // Virtual token reserve
    currentPrice: string;
  };
}>> {
  const { program } = getProgram();

  try {
    const memeTokenStates = await program.account.memeTokenState.all();
    let userTokens = [];

    // Filter tokens minted by the specified user
    for (const state of memeTokenStates) {
      const account = state.account as any;
      
      if (!account.minter.equals(userPublicKey)) {
        continue;
      }

      const poolDetails = await getAmmPool(account.mint);

      userTokens.push({
        memeId: memeIdToString(account.memeId),
        memeIdHex: account.memeId.toString('hex'),
        mint: account.mint.toBase58(),
        minter: account.minter.toBase58(),
        createdAt: account.createdAt.toString(),
        isInitialized: account.isInitialized === 1,
        poolDetails: poolDetails ? {
          isInitialized: poolDetails.isInitialized,
          solReserve: poolDetails.solReserve.toString(), // Real SOL reserve
          tokenReserve: poolDetails.tokenReserve.toString(), // Real token reserve
          virtualSolReserve: poolDetails.virtualSolReserve.toString(), // Virtual SOL reserve (for market cap)
          virtualTokenReserve: poolDetails.virtualTokenReserve.toString(), // Virtual token reserve
          currentPrice: poolDetails.currentPrice,
        } : undefined,
      });
    }

    return userTokens;
  } catch (error) {
    console.error("Error fetching minted tokens by user:", error);
    return [];
  }
}

// === Get all minted tokens (from all users) ===
// ⚠️ UPDATED: Added virtual reserves for pump.fun-style market cap calculation
export async function getAllMintedTokens(): Promise<Array<{
  memeId: string;
  memeIdHex: string;
  mint: string;
  minter: string;
  createdAt: string;
  isInitialized: boolean;
  poolDetails?: {
    isInitialized: boolean;
    solReserve: string; // Real SOL reserve (for liquidity)
    tokenReserve: string; // Real token reserve
    virtualSolReserve: string; // Virtual SOL reserve (for market cap)
    virtualTokenReserve: string; // Virtual token reserve
    currentPrice: string;
  };
}>> {
  const { program } = getProgram();

  try {
    const memeTokenStates = await program.account.memeTokenState.all();
    let allTokens = [];

    for (const state of memeTokenStates) {
      let account = state.account as any;

      const poolDetails = await getAmmPool(account.mint);

      let token = {
        memeId: memeIdToString(account.memeId),
        memeIdHex: account.memeId.toString('hex'),
        mint: account.mint.toBase58(),
        minter: account.minter.toBase58(),
        createdAt: account.createdAt.toString(),
        isInitialized: account.isInitialized,
        poolDetails: poolDetails ? {
          isInitialized: poolDetails.isInitialized,
          solReserve: poolDetails.solReserve.toString(), // Real SOL reserve
          tokenReserve: poolDetails.tokenReserve.toString(), // Real token reserve
          virtualSolReserve: poolDetails.virtualSolReserve.toString(), // Virtual SOL reserve (for market cap)
          virtualTokenReserve: poolDetails.virtualTokenReserve.toString(), // Virtual token reserve
          currentPrice: poolDetails.currentPrice,
        } : undefined,
      };

      allTokens.push(token);
    }

    return allTokens;
  } catch (error) {
    console.error("Error fetching all minted tokens:", error);
    return [];
  }
}

// ==================== AMM POOL INTERFACES ====================

// ⚠️ UPDATED: Added virtual reserves for pump.fun-style market cap calculation
export interface AmmPool {
  tokenMint: PublicKey;
  solVault: PublicKey;
  tokenVault: PublicKey;
  solReserve: BN; // Real SOL reserve
  tokenReserve: BN; // Real token reserve
  virtualSolReserve: BN; // Virtual SOL reserve (for market cap)
  virtualTokenReserve: BN; // Virtual token reserve (for price calculation)
  bump: number;
  isInitialized: boolean;
  currentPrice: string; // Calculated: SOL per token
}

// ⚠️ UPDATED: Added virtual reserves for pump.fun-style market cap calculation
export interface AmmPoolResponse {
  tokenMint: string;
  solVault: string;
  tokenVault: string;
  solReserve: string; // Real SOL reserve
  tokenReserve: string; // Real token reserve
  virtualSolReserve: string; // Virtual SOL reserve (for market cap)
  virtualTokenReserve: string; // Virtual token reserve (for price calculation)
  currentPrice: string;
  bump: number;
  isInitialized: boolean;
}

// ⚠️ UPDATED: Read real and virtual reserves from Rust program
// The Rust AmmPool struct has: real_sol_reserve, real_token_reserve, virtual_sol_reserve, virtual_token_reserve
export async function getAmmPool(tokenMint: PublicKey): Promise<AmmPool | null> {
  const { program } = getProgram();

  try {
    // Derive the PDA for the AmmPool account
    const [poolPda] = getAmmPoolPda(tokenMint, program.programId);

    // Fetch the account
    const poolAccount = await program.account.ammPool.fetch(poolPda) as any;

    if (!poolAccount) {
      return null;
    }

    // ⚠️ IMPORTANT: Rust struct uses real_sol_reserve, real_token_reserve, virtual_sol_reserve, virtual_token_reserve
    // For display purposes, we use real reserves
    // For price calculation, we should use virtual reserves (but currently using real for compatibility)
    const realSolReserve = poolAccount.realSolReserve || poolAccount.real_sol_reserve;
    const realTokenReserve = poolAccount.realTokenReserve || poolAccount.real_token_reserve;
    const virtualSolReserve = poolAccount.virtualSolReserve || poolAccount.virtual_sol_reserve;
    const virtualTokenReserve = poolAccount.virtualTokenReserve || poolAccount.virtual_token_reserve;

    // Use virtual reserves for price calculation (as per Rust program logic)
    const solReserveForPrice = virtualSolReserve ? Number(virtualSolReserve.toString()) : Number(realSolReserve.toString());
    const tokenReserveForPrice = virtualTokenReserve ? Number(virtualTokenReserve.toString()) : Number(realTokenReserve.toString());

    // Calculate current price (SOL per token) using virtual reserves
    const currentPrice = (solReserveForPrice / tokenReserveForPrice).toExponential(8);

    return {
      tokenMint: poolAccount.tokenMint,
      solVault: poolAccount.solVault,
      tokenVault: poolAccount.tokenVault,
      // Real reserves (actual amounts in vaults - for liquidity display)
      solReserve: realSolReserve,
      tokenReserve: realTokenReserve,
      // Virtual reserves (for market cap and price calculation)
      virtualSolReserve: virtualSolReserve || realSolReserve,
      virtualTokenReserve: virtualTokenReserve || realTokenReserve,
      bump: poolAccount.bump,
      isInitialized: poolAccount.isInitialized,
      currentPrice,
    };
  } catch (error) {
    console.error("Error fetching AmmPool:", error);
    return null;
  }
}

// ⚠️ UPDATED: Added virtual reserves for pump.fun-style market cap calculation
export function ammPoolToResponse(pool: AmmPool): AmmPoolResponse {
  return {
    tokenMint: pool.tokenMint.toBase58(),
    solVault: pool.solVault.toBase58(),
    tokenVault: pool.tokenVault.toBase58(),
    solReserve: pool.solReserve.toString(), // Real SOL reserve
    tokenReserve: pool.tokenReserve.toString(), // Real token reserve
    virtualSolReserve: pool.virtualSolReserve.toString(), // Virtual SOL reserve (for market cap)
    virtualTokenReserve: pool.virtualTokenReserve.toString(), // Virtual token reserve
    currentPrice: pool.currentPrice,
    bump: pool.bump,
    isInitialized: pool.isInitialized,
  };
}

// ✅ UNCHANGED: PDA derivation
export function getAmmPoolPda(
  tokenMint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("amm_pool"), tokenMint.toBuffer()],
    programId
  );
}

// ==================== BONDING CURVE CALCULATIONS ====================

// ❌ REMOVED: calculateAddLiquidity - no longer needed
// ❌ REMOVED: getAddLiquidityParams - no longer needed
// ✅ ADDED: Bonding curve buy/sell calculations

/**
 * Calculate expected output when buying tokens with SOL
 */
export interface BuyCalculation {
  poolState: {
    solReserve: string;
    tokenReserve: string;
    currentPrice: string;
    isInitialized: boolean;
  };
  userInput: {
    solAmount: number;
    slippagePercent: number;
  };
  calculations: {
    solAfterFee: number;
    fee: number;
    tokensOut: string;
    minTokensOut: string; // With slippage
  };
  priceImpact: {
    newSolReserve: string;
    newTokenReserve: string;
    newPrice: string;
    priceChangePercent: string;
  };
}

export async function calculateBuyTokens(
  tokenMint: string,
  solAmount: number,
  slippagePercent: number = 1
): Promise<BuyCalculation | null> {
  try {
    const tokenMintPk = new PublicKey(tokenMint);
    const pool = await getAmmPool(tokenMintPk);

    if (!pool || !pool.isInitialized) {
      console.error("Pool not found or not initialized");
      return null;
    }

    const DECIMALS = 9;
    const FEE_PERCENT = 0.3;

    // Convert from base units to human-readable
    const solReserve = Number(pool.solReserve.toString()) / 1e9;
    const tokenReserve = Number(pool.tokenReserve.toString()) / Math.pow(10, DECIMALS);

    // Calculate current price
    const currentPrice = solReserve / tokenReserve;

    // Calculate fee
    const fee = solAmount * (FEE_PERCENT / 100);
    const solAfterFee = solAmount - fee;

    // Constant product formula: tokensOut = (solAfterFee * tokenReserve) / (solReserve + solAfterFee)
    const tokensOut = (solAfterFee * tokenReserve) / (solReserve + solAfterFee);

    // Apply slippage protection
    const minTokensOut = tokensOut * (1 - slippagePercent / 100);

    // Calculate new pool state
    const newSolReserve = solReserve + solAmount;
    const newTokenReserve = tokenReserve - tokensOut;
    const newPrice = newSolReserve / newTokenReserve;
    const priceChangePercent = ((newPrice - currentPrice) / currentPrice) * 100;

    return {
      poolState: {
        solReserve: solReserve.toFixed(6),
        tokenReserve: tokenReserve.toFixed(6),
        currentPrice: currentPrice.toExponential(8),
        isInitialized: pool.isInitialized,
      },
      userInput: {
        solAmount,
        slippagePercent,
      },
      calculations: {
        solAfterFee: parseFloat(solAfterFee.toFixed(6)),
        fee: parseFloat(fee.toFixed(6)),
        tokensOut: tokensOut.toFixed(6),
        minTokensOut: minTokensOut.toFixed(6),
      },
      priceImpact: {
        newSolReserve: newSolReserve.toFixed(6),
        newTokenReserve: newTokenReserve.toFixed(6),
        newPrice: newPrice.toExponential(8),
        priceChangePercent: priceChangePercent.toFixed(4),
      },
    };
  } catch (error) {
    console.error("Error calculating buy tokens:", error);
    return null;
  }
}

/**
 * Calculate expected output when selling tokens for SOL
 */
export interface SellCalculation {
  poolState: {
    solReserve: string;
    tokenReserve: string;
    currentPrice: string;
    isInitialized: boolean;
  };
  userInput: {
    tokenAmount: number;
    slippagePercent: number;
  };
  calculations: {
    tokensAfterFee: number;
    fee: number;
    solOut: number;
    minSolOut: number; // With slippage
  };
  priceImpact: {
    newSolReserve: string;
    newTokenReserve: string;
    newPrice: string;
    priceChangePercent: string;
  };
}

export async function calculateSellTokens(
  tokenMint: string,
  tokenAmount: number,
  slippagePercent: number = 1
): Promise<SellCalculation | null> {
  try {
    const tokenMintPk = new PublicKey(tokenMint);
    const pool = await getAmmPool(tokenMintPk);

    if (!pool || !pool.isInitialized) {
      console.error("Pool not found or not initialized");
      return null;
    }

    const DECIMALS = 9;
    const FEE_PERCENT = 0.3;

    // Convert from base units to human-readable
    const solReserve = Number(pool.solReserve.toString()) / 1e9;
    const tokenReserve = Number(pool.tokenReserve.toString()) / Math.pow(10, DECIMALS);

    // Calculate current price
    const currentPrice = solReserve / tokenReserve;

    // Calculate fee
    const fee = tokenAmount * (FEE_PERCENT / 100);
    const tokensAfterFee = tokenAmount - fee;

    // Constant product formula: solOut = (tokensAfterFee * solReserve) / (tokenReserve + tokensAfterFee)
    const solOut = (tokensAfterFee * solReserve) / (tokenReserve + tokensAfterFee);

    // Apply slippage protection
    const minSolOut = solOut * (1 - slippagePercent / 100);

    // Calculate new pool state
    const newSolReserve = solReserve - solOut;
    const newTokenReserve = tokenReserve + tokenAmount;
    const newPrice = newSolReserve / newTokenReserve;
    const priceChangePercent = ((currentPrice - newPrice) / currentPrice) * 100;

    return {
      poolState: {
        solReserve: solReserve.toFixed(6),
        tokenReserve: tokenReserve.toFixed(6),
        currentPrice: currentPrice.toExponential(8),
        isInitialized: pool.isInitialized,
      },
      userInput: {
        tokenAmount,
        slippagePercent,
      },
      calculations: {
        tokensAfterFee: parseFloat(tokensAfterFee.toFixed(6)),
        fee: parseFloat(fee.toFixed(6)),
        solOut: parseFloat(solOut.toFixed(6)),
        minSolOut: parseFloat(minSolOut.toFixed(6)),
      },
      priceImpact: {
        newSolReserve: newSolReserve.toFixed(6),
        newTokenReserve: newTokenReserve.toFixed(6),
        newPrice: newPrice.toExponential(8),
        priceChangePercent: priceChangePercent.toFixed(4),
      },
    };
  } catch (error) {
    console.error("Error calculating sell tokens:", error);
    return null;
  }
}

/**
 * Get simple buy parameters for transaction (without full details)
 */
export async function getBuyParams(
  tokenMint: string,
  solAmount: number,
  slippagePercent: number = 1
): Promise<{
  minTokenAmount: string;
  expectedTokens: string;
  fee: number;
  priceImpact: string;
} | null> {
  const calculation = await calculateBuyTokens(tokenMint, solAmount, slippagePercent);
  
  if (!calculation) return null;

  return {
    minTokenAmount: calculation.calculations.minTokensOut,
    expectedTokens: calculation.calculations.tokensOut,
    fee: calculation.calculations.fee,
    priceImpact: calculation.priceImpact.priceChangePercent + '%',
  };
}

/**
 * Get simple sell parameters for transaction (without full details)
 */
export async function getSellParams(
  tokenMint: string,
  tokenAmount: number,
  slippagePercent: number = 1
): Promise<{
  minSolAmount: number;
  expectedSol: number;
  fee: number;
  priceImpact: string;
} | null> {
  const calculation = await calculateSellTokens(tokenMint, tokenAmount, slippagePercent);
  
  if (!calculation) return null;

  return {
    minSolAmount: calculation.calculations.minSolOut,
    expectedSol: calculation.calculations.solOut,
    fee: calculation.calculations.fee,
    priceImpact: calculation.priceImpact.priceChangePercent + '%',
  };
}