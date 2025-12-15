import { Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import {
  createInitializeAmmPoolTransaction,
  createSwapSolForTokensTransaction,
  createSwapTokensForSolTransaction,
} from "../services/poolCreationService";
import { getPoolInfo } from "../ammService";
import { getAmmPool } from "../mintDetails";

export async function initializeAmmPoolTxController(req: Request, res: Response) {
  try {
    const { initializer, tokenMint } = req.body as {
      initializer: string;
      tokenMint: string;
    };

    if (!initializer || !tokenMint) {
      return res.status(400).json({ success: false, message: "initializer and tokenMint are required" });
    }

    let initializerPk: PublicKey;
    try {
      initializerPk = new PublicKey(initializer);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid initializer public key" });
    }

    // ⚠️ UPDATED: No longer accepts initialSolAmount and initialTokenAmount
    // The Rust program uses FIXED parameters: 0.02 SOL + 800M tokens
    const result = await createInitializeAmmPoolTransaction(initializerPk, tokenMint);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

// ❌ REMOVED: Add Liquidity controller - the service function no longer exists
// The bonding curve model doesn't use LP tokens - users buy/sell directly

export async function getPoolInfoController(req: Request, res: Response) {
  try {
    const { tokenMint } = req.params as { tokenMint: string };
    
    if (!tokenMint) {
      return res.status(400).json({
        success: false,
        error: 'tokenMint is required',
      });
    }

    const poolInfo = await getPoolInfo(tokenMint);
    
    if (!poolInfo) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found',
      });
    }

    return res.json({
      success: true,
      data: poolInfo,
    });
  } catch (error: any) {
    console.error('/pool-info error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch pool info',
    });
  }
}

export async function getAmmPoolController(req: Request, res: Response) {
  try {
    const { tokenMint } = req.params as { tokenMint: string };
    
    if (!tokenMint) {
      return res.status(400).json({
        success: false,
        error: 'tokenMint is required',
      });
    }

    const ammPool = await getAmmPool(new PublicKey(tokenMint));
    
    if (!ammPool) {
      return res.status(404).json({
        success: false,
        error: 'AMM Pool not found',
      });
    }

    // Format the response to convert PublicKey objects to base58 strings and BN to strings
    return res.json({
      success: true,
      data: {
        tokenMint: ammPool.tokenMint.toBase58(),
        solVault: ammPool.solVault.toBase58(),
        tokenVault: ammPool.tokenVault.toBase58(),
        solReserve: ammPool.solReserve.toString(), // Real SOL reserve
        tokenReserve: ammPool.tokenReserve.toString(), // Real token reserve
        virtualSolReserve: ammPool.virtualSolReserve.toString(), // Virtual SOL reserve (for market cap)
        virtualTokenReserve: ammPool.virtualTokenReserve.toString(), // Virtual token reserve
        currentPrice: ammPool.currentPrice,
        bump: ammPool.bump,
        isInitialized: ammPool.isInitialized,
      },
    });
  } catch (error: any) {
    console.error('/amm-pool error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch AMM pool',
    });
  }
}

// ❌ REMOVED: Remove Liquidity controller - the service function no longer exists
// The bonding curve model doesn't use LP tokens

export async function swapSolForTokensTxController(req: Request, res: Response) {
  try {
    const { user, tokenMint, solAmount, minTokenAmount } = req.body as {
      user: string;
      tokenMint: string;
      solAmount: number;
      minTokenAmount?: number; // ⭐ Optional parameter
    };

    if (!user || !tokenMint || solAmount == null) {
      return res.status(400).json({ success: false, message: "user, tokenMint, and solAmount are required" });
    }

    let userPk: PublicKey;
    try {
      userPk = new PublicKey(user);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid user public key" });
    }

    // ⚠️ UPDATED: minTokenAmount is now optional (defaults to undefined = no slippage protection)
    const result = await createSwapSolForTokensTransaction(userPk, tokenMint, solAmount, minTokenAmount);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

export async function swapTokensForSolTxController(req: Request, res: Response) {
  try {
    const { user, tokenMint, tokenAmount, minSolAmount } = req.body as {
      user: string;
      tokenMint: string;
      tokenAmount: number | string;
      minSolAmount?: number; // ⭐ Optional parameter
    };

    if (!user || !tokenMint || tokenAmount == null) {
      return res.status(400).json({ success: false, message: "user, tokenMint, and tokenAmount are required" });
    }

    let userPk: PublicKey;
    try {
      userPk = new PublicKey(user);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid user public key" });
    }

    // ⚠️ UPDATED: minSolAmount is now optional (defaults to undefined = no slippage protection)
    const result = await createSwapTokensForSolTransaction(userPk, tokenMint, tokenAmount, minSolAmount);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}






// ❌ REMOVED: calculateAddLiquidityController - liquidity functions no longer exist
// The bonding curve model doesn't use LP tokens - users buy/sell directly

// ❌ REMOVED: getAddLiquidityParamsController - liquidity functions no longer exist
// The bonding curve model doesn't use LP tokens - users buy/sell directly