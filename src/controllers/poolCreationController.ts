import { Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import {
  createInitializeAmmPoolTransaction,
  createAddLiquidityTransaction,
  createRemoveLiquidityTransaction,
  createSwapSolForTokensTransaction,
  createSwapTokensForSolTransaction,
} from "../services/poolCreationService";

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

export async function removeLiquidityTxController(req: Request, res: Response) {
  try {
    const { user, tokenMint, lpAmount, minSolAmount, minTokenAmount } = req.body as {
      user: string;
      tokenMint: string;
      lpAmount: number | string;
      minSolAmount?: number;
      minTokenAmount?: number | string;
    };

    if (!user || !tokenMint || lpAmount == null) {
      return res.status(400).json({ success: false, message: "user, tokenMint, lpAmount are required" });
    }

    let userPk: PublicKey;
    try {
      userPk = new PublicKey(user);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid user public key" });
    }

    const result = await createRemoveLiquidityTransaction(userPk, tokenMint, lpAmount, minSolAmount ?? 0, minTokenAmount ?? 0);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

export async function swapSolForTokensTxController(req: Request, res: Response) {
  try {
    const { user, tokenMint, solAmount, minTokenAmount } = req.body as {
      user: string;
      tokenMint: string;
      solAmount: number;
      minTokenAmount: number | string;
    };

    if (!user || !tokenMint || solAmount == null || minTokenAmount == null) {
      return res.status(400).json({ success: false, message: "user, tokenMint, solAmount, minTokenAmount are required" });
    }

    let userPk: PublicKey;
    try {
      userPk = new PublicKey(user);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid user public key" });
    }

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
      minSolAmount: number;
    };

    if (!user || !tokenMint || tokenAmount == null || minSolAmount == null) {
      return res.status(400).json({ success: false, message: "user, tokenMint, tokenAmount, minSolAmount are required" });
    }

    let userPk: PublicKey;
    try {
      userPk = new PublicKey(user);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid user public key" });
    }

    const result = await createSwapTokensForSolTransaction(userPk, tokenMint, tokenAmount, minSolAmount);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}


