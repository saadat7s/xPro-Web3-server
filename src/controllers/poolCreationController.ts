import { Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import {
  createInitializeAmmPoolTransaction,
  createAddLiquidityTransaction,
  // createRemoveLiquidityTransaction,
  // createSwapSolForTokensTransaction,
  // createSwapTokensForSolTransaction,
} from "../services/poolCreationService";
import { getPoolInfo } from "../ammService";
import { calculateAddLiquidity, getAddLiquidityParams, getAmmPool } from "../mintDetails";

export async function initializeAmmPoolTxController(req: Request, res: Response) {
  try {
    const { initializer, tokenMint, initialSolAmount, initialTokenAmount } = req.body as {
      initializer: string;
      tokenMint: string;
      initialSolAmount: number;
      initialTokenAmount: number | string;
    };

    if (!initializer || !tokenMint || initialSolAmount == null || initialTokenAmount == null) {
      return res.status(400).json({ success: false, message: "initializer, tokenMint, initialSolAmount, initialTokenAmount are required" });
    }

    let initializerPk: PublicKey;
    try {
      initializerPk = new PublicKey(initializer);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid initializer public key" });
    }

    const result = await createInitializeAmmPoolTransaction(initializerPk, tokenMint, initialSolAmount, initialTokenAmount);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

export async function addLiquidityTxController(req: Request, res: Response) {
  try {
    const { user, tokenMint, solAmount, maxTokenAmount, minLpAmount } = req.body as {
      user: string;
      tokenMint: string;
      solAmount: number;
      maxTokenAmount: number | string;
      minLpAmount?: number | string;
    };

    if (!user || !tokenMint || solAmount == null || maxTokenAmount == null) {
      return res.status(400).json({ success: false, message: "user, tokenMint, solAmount, maxTokenAmount are required" });
    }

    let userPk: PublicKey;
    try {
      userPk = new PublicKey(user);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid user public key" });
    }

    const result = await createAddLiquidityTransaction(userPk, tokenMint, solAmount, maxTokenAmount, minLpAmount ?? 0);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

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
        lpMint: ammPool.lpMint.toBase58(),
        solVault: ammPool.solVault.toBase58(),
        tokenVault: ammPool.tokenVault.toBase58(),
        solReserve: ammPool.solReserve.toString(),
        tokenReserve: ammPool.tokenReserve.toString(),
        lpSupply: ammPool.lpSupply.toString(),
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

// export async function removeLiquidityTxController(req: Request, res: Response) {
//   try {
//     const { user, tokenMint, lpAmount, minSolAmount, minTokenAmount } = req.body as {
//       user: string;
//       tokenMint: string;
//       lpAmount: number | string;
//       minSolAmount?: number;
//       minTokenAmount?: number | string;
//     };

//     if (!user || !tokenMint || lpAmount == null) {
//       return res.status(400).json({ success: false, message: "user, tokenMint, lpAmount are required" });
//     }

//     let userPk: PublicKey;
//     try {
//       userPk = new PublicKey(user);
//     } catch (e) {
//       return res.status(400).json({ success: false, message: "Invalid user public key" });
//     }

//     const result = await createRemoveLiquidityTransaction(userPk, tokenMint, lpAmount, minSolAmount ?? 0, minTokenAmount ?? 0);
//     return res.status(result.success ? 200 : 500).json(result);
//   } catch (error: any) {
//     return res.status(500).json({ success: false, message: error?.message || String(error) });
//   }
// }

// export async function swapSolForTokensTxController(req: Request, res: Response) {
//   try {
//     const { user, tokenMint, solAmount, minTokenAmount } = req.body as {
//       user: string;
//       tokenMint: string;
//       solAmount: number;
//       minTokenAmount: number | string;
//     };

//     if (!user || !tokenMint || solAmount == null || minTokenAmount == null) {
//       return res.status(400).json({ success: false, message: "user, tokenMint, solAmount, minTokenAmount are required" });
//     }

//     let userPk: PublicKey;
//     try {
//       userPk = new PublicKey(user);
//     } catch (e) {
//       return res.status(400).json({ success: false, message: "Invalid user public key" });
//     }

//     const result = await createSwapSolForTokensTransaction(userPk, tokenMint, solAmount, minTokenAmount);
//     return res.status(result.success ? 200 : 500).json(result);
//   } catch (error: any) {
//     return res.status(500).json({ success: false, message: error?.message || String(error) });
//   }
// }

// export async function swapTokensForSolTxController(req: Request, res: Response) {
//   try {
//     const { user, tokenMint, tokenAmount, minSolAmount } = req.body as {
//       user: string;
//       tokenMint: string;
//       tokenAmount: number | string;
//       minSolAmount: number;
//     };

//     if (!user || !tokenMint || tokenAmount == null || minSolAmount == null) {
//       return res.status(400).json({ success: false, message: "user, tokenMint, tokenAmount, minSolAmount are required" });
//     }

//     let userPk: PublicKey;
//     try {
//       userPk = new PublicKey(user);
//     } catch (e) {
//       return res.status(400).json({ success: false, message: "Invalid user public key" });
//     }

//     const result = await createSwapTokensForSolTransaction(userPk, tokenMint, tokenAmount, minSolAmount);
//     return res.status(result.success ? 200 : 500).json(result);
//   } catch (error: any) {
//     return res.status(500).json({ success: false, message: error?.message || String(error) });
//   }
// }






/**
 * Full calculation endpoint - gives user complete transparency
 * GET /amm/calculate-add-liquidity?tokenMint=xxx&solAmount=0.01&slippage=1
 */
export async function calculateAddLiquidityController(req: Request, res: Response) {
  try {
    const { tokenMint, solAmount, slippage, userCurrentLp } = req.query as {
      tokenMint: string;
      solAmount: string;
      slippage?: string;
      userCurrentLp?: string;
    };

    if (!tokenMint || !solAmount) {
      return res.status(400).json({
        success: false,
        message: "tokenMint and solAmount are required",
      });
    }

    const solAmountNum = parseFloat(solAmount);
    const slippageNum = slippage ? parseFloat(slippage) : 1;
    const userLpNum = userCurrentLp ? parseFloat(userCurrentLp) : 0;

    const calculation = await calculateAddLiquidity(
      tokenMint,
      solAmountNum,
      slippageNum,
      userLpNum
    );

    if (!calculation) {
      return res.status(404).json({
        success: false,
        message: "Pool not found or not initialized",
      });
    }

    return res.json({
      success: true,
      data: calculation,
    });
  } catch (error: any) {
    console.error("/calculate-add-liquidity error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to calculate add liquidity",
    });
  }
}

/**
 * Quick params endpoint - just returns the values needed for transaction
 * GET /amm/add-liquidity-params?tokenMint=xxx&solAmount=0.01&slippage=1
 */
export async function getAddLiquidityParamsController(req: Request, res: Response) {
  try {
    const { tokenMint, solAmount, slippage } = req.query as {
      tokenMint: string;
      solAmount: string;
      slippage?: string;
    };

    if (!tokenMint || !solAmount) {
      return res.status(400).json({
        success: false,
        message: "tokenMint and solAmount are required",
      });
    }

    const solAmountNum = parseFloat(solAmount);
    const slippageNum = slippage ? parseFloat(slippage) : 1;

    const params = await getAddLiquidityParams(tokenMint, solAmountNum, slippageNum);

    if (!params) {
      return res.status(404).json({
        success: false,
        message: "Pool not found or not initialized",
      });
    }

    return res.json({
      success: true,
      data: params,
    });
  } catch (error: any) {
    console.error("/add-liquidity-params error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to get add liquidity params",
    });
  }
}