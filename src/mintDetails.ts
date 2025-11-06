import { getAccount, TokenAccountNotFoundError, TokenInvalidAccountOwnerError, getMint } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { getProgram } from "./service";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";  // Changed from TOKEN_2022_PROGRAM_ID
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
      TOKEN_2022_PROGRAM_ID  // Changed from TOKEN_2022_PROGRAM_ID
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
      TOKEN_2022_PROGRAM_ID  // Changed from TOKEN_2022_PROGRAM_ID
    );

    const vaultTokenAccount = getAssociatedTokenAddressSync(
      mintPDA,
      vault,
      true, // allowOwnerOffCurve for PDA
      TOKEN_2022_PROGRAM_ID  // Changed from TOKEN_2022_PROGRAM_ID
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
        isCorrectDistribution: total === TOTAL_SUPPLY &&
          Math.abs((minterNum / total) * 100 - 2) < 0.001 &&
          Math.abs((vaultNum / total) * 100 - 98) < 0.001,
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
export async function getMintedTokensByUser(userPublicKey: PublicKey): Promise<Array<{
  memeId: string;
  memeIdHex: string;
  mint: string;
  minter: string;
  createdAt: string;
  isInitialized: boolean;
}>> {
  const { program } = getProgram();

  try {
    const memeTokenStates = await program.account.memeTokenState.all();

    // Filter tokens minted by the specified user
    return memeTokenStates
      .filter((state) => {
        const account = state.account as any;
        return account.minter.equals(userPublicKey);
      })
      .map((state) => {
        const account = state.account as any;
        return {
          memeId: memeIdToString(account.memeId),
          memeIdHex: account.memeId.toString('hex'),
          mint: account.mint.toBase58(),
          minter: account.minter.toBase58(),
          createdAt: account.createdAt.toString(),
          isInitialized: account.isInitialized === 1,
        };
      });
  } catch (error) {
    console.error("Error fetching minted tokens by user:", error);
    return [];
  }
}

// === Get all minted tokens (from all users) ===
export async function getAllMintedTokens(): Promise<Array<{
  memeId: string;
  memeIdHex: string;
  mint: string;
  minter: string;
  createdAt: string;
  isInitialized: boolean;
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
        poolDetails: {
          isInitialized: poolDetails?.isInitialized,
          lpSupply: poolDetails?.lpSupply?.toString()
        }
      }

      allTokens.push(token);
    }

    return allTokens;
  } catch (error) {
    console.error("Error fetching all minted tokens:", error);
    return [];
  }
}


export interface AmmPool {
  tokenMint: PublicKey;
  lpMint: PublicKey;
  solVault: PublicKey;
  tokenVault: PublicKey;
  solReserve: BN;      // Keep as BN from Anchor
  tokenReserve: BN;    // Keep as BN from Anchor
  lpSupply: BN;        // Keep as BN from Anchor
  bump: number;
  isInitialized: boolean;
}

// If you need a serializable version for API responses
export interface AmmPoolResponse {
  tokenMint: string;
  lpMint: string;
  solVault: string;
  tokenVault: string;
  solReserve: string;
  tokenReserve: string;
  lpSupply: string;
  bump: number;
  isInitialized: boolean;
}

export async function getAmmPool(tokenMint: PublicKey): Promise<AmmPool | null> {
  const { program } = getProgram();

  try {
    // Derive the PDA for the AmmPool account
    const [poolPda] = getAmmPoolPda(tokenMint, program.programId);

    // Fetch the account - Anchor will handle decoding based on your IDL
    const poolAccount = await program.account.ammPool.fetch(poolPda) as unknown as AmmPool;

    if (!poolAccount) {
      return null;
    }
    const tokenDecimals = 9;
    const lpDecimals = 9;

    const solReserve = formatTokenAmount(poolAccount.solReserve.toString(), 9);
    const tokenReserve = formatTokenAmount(poolAccount.tokenReserve.toString(), tokenDecimals);
    const lpSupply = formatTokenAmount(poolAccount.lpSupply.toString(), lpDecimals);

    // Anchor returns the account with proper types from your IDL
    return {
      tokenMint: poolAccount.tokenMint,
      lpMint: poolAccount.lpMint,
      solVault: poolAccount.solVault,
      tokenVault: poolAccount.tokenVault,
      solReserve: solReserve,
      tokenReserve: tokenReserve,
      lpSupply: lpSupply,
      bump: poolAccount.bump,
      isInitialized: poolAccount.isInitialized,
    };
  } catch (error) {
    console.error("Error fetching AmmPool:", error);
    return null;
  }
}

// Helper function to convert to serializable format for API responses
export function ammPoolToResponse(pool: AmmPool): AmmPoolResponse {
  return {
    tokenMint: pool.tokenMint.toBase58(),
    lpMint: pool.lpMint.toBase58(),
    solVault: pool.solVault.toBase58(),
    tokenVault: pool.tokenVault.toBase58(),
    solReserve: pool.solReserve.toString(),
    tokenReserve: pool.tokenReserve.toString(),
    lpSupply: pool.lpSupply.toString(),
    bump: pool.bump,
    isInitialized: pool.isInitialized,
  };
}

// Your PDA derivation function should look like this:
export function getAmmPoolPda(
  tokenMint: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("amm_pool"), tokenMint.toBuffer()],
    programId
  );
}
interface AddLiquidityCalculation {
  poolState: {
    solReserve: string;           // Human-readable (e.g., "0.05")
    tokenReserve: string;         // Human-readable (e.g., "100")
    lpSupply: string;             // Human-readable (e.g., "2.236")
    currentPrice: string;         // How many tokens per 1 SOL
    isInitialized: boolean;
  };
  userInput: {
    solAmount: number;            // What user wants to add
    slippagePercent: number;      // Slippage tolerance
  };
  calculations: {
    requiredTokens: number;       // Exact tokens needed
    maxTokenAmount: number;       // With slippage buffer
    expectedLp: number;           // LP tokens to receive
    minLpAmount: number;          // With slippage buffer
  };
  priceImpact: {
    newSolReserve: string;
    newTokenReserve: string;
    newPrice: string;
    priceChange: string;          // Percentage change
  };
  userShare: {
    currentOwnership: string;     // "0%" if new user
    newOwnership: string;         // After adding liquidity
  };
}

/**
 * Calculate all parameters needed for adding liquidity
 * This gives users complete transparency about what will happen
 */
export async function calculateAddLiquidity(
  tokenMint: string,
  solAmount: number,
  slippagePercent: number = 1,
  userCurrentLp: number = 0  // Optional: if user already has LP tokens
): Promise<AddLiquidityCalculation | null> {
  try {
    const tokenMintPk = new PublicKey(tokenMint);
    const pool = await getAmmPool(tokenMintPk);

    if (!pool || !pool.isInitialized) {
      console.error("Pool not found or not initialized");
      return null;
    }

    const DECIMALS = 9;

    // Convert from base units to human-readable
    const solReserve = Number(pool.solReserve.toString()) / 1e9;
    const tokenReserve = Number(pool.tokenReserve.toString()) / Math.pow(10, DECIMALS);
    const lpSupply = Number(pool.lpSupply.toString()) / Math.pow(10, DECIMALS);

    // Calculate current price
    const currentPrice = tokenReserve / solReserve;

    // Calculate exact tokens needed to maintain ratio
    const requiredTokens = (solAmount * tokenReserve) / solReserve;

    // Add slippage buffer for max tokens (user willing to give up to this much)
    const maxTokenAmount = requiredTokens * (1 + slippagePercent / 100);

    // Calculate expected LP tokens
    const lpFromSol = (solAmount * lpSupply) / solReserve;
    const lpFromToken = (requiredTokens * lpSupply) / tokenReserve;
    const expectedLp = Math.min(lpFromSol, lpFromToken);

    // Subtract slippage buffer for min LP (user wants at least this much)
    const minLpAmount = expectedLp * (1 - slippagePercent / 100);

    // Calculate new pool state after adding liquidity
    const newSolReserve = solReserve + solAmount;
    const newTokenReserve = tokenReserve + requiredTokens;
    const newPrice = newTokenReserve / newSolReserve;
    const priceChange = ((newPrice - currentPrice) / currentPrice) * 100;

    // Calculate ownership percentages
    const newLpSupply = lpSupply + expectedLp;
    const currentOwnership = lpSupply > 0 ? (userCurrentLp / lpSupply) * 100 : 0;
    const newUserLp = userCurrentLp + expectedLp;
    const newOwnership = (newUserLp / newLpSupply) * 100;

    return {
      poolState: {
        solReserve: solReserve.toFixed(6),
        tokenReserve: tokenReserve.toFixed(6),
        lpSupply: lpSupply.toFixed(6),
        currentPrice: currentPrice.toFixed(6),
        isInitialized: pool.isInitialized,
      },
      userInput: {
        solAmount,
        slippagePercent,
      },
      calculations: {
        requiredTokens: parseFloat(requiredTokens.toFixed(6)),
        maxTokenAmount: parseFloat(maxTokenAmount.toFixed(6)),
        expectedLp: parseFloat(expectedLp.toFixed(6)),
        minLpAmount: parseFloat(minLpAmount.toFixed(6)),
      },
      priceImpact: {
        newSolReserve: newSolReserve.toFixed(6),
        newTokenReserve: newTokenReserve.toFixed(6),
        newPrice: newPrice.toFixed(6),
        priceChange: priceChange.toFixed(4),
      },
      userShare: {
        currentOwnership: currentOwnership.toFixed(2) + "%",
        newOwnership: newOwnership.toFixed(2) + "%",
      },
    };
  } catch (error) {
    console.error("Error calculating add liquidity:", error);
    return null;
  }
}

/**
 * Simpler version - just returns the parameters needed for the transaction
 */
export async function getAddLiquidityParams(
  tokenMint: string,
  solAmount: number,
  slippagePercent: number = 1
): Promise<{
  maxTokenAmount: number;
  minLpAmount: number;
  requiredTokens: number;
  expectedLp: number;
} | null> {
  const calculation = await calculateAddLiquidity(tokenMint, solAmount, slippagePercent);
  
  if (!calculation) return null;

  return {
    maxTokenAmount: calculation.calculations.maxTokenAmount,
    minLpAmount: calculation.calculations.minLpAmount,
    requiredTokens: calculation.calculations.requiredTokens,
    expectedLp: calculation.calculations.expectedLp,
  };
}