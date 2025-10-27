import { Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import {
  getTokenBalance,
  getMemeTokenDistribution,
  getAllMemeTokenBalances,
  getRecentMintDistribution,
  formatTokenAmount,
  getAllMintedTokens,
} from "../mintDetails";
import { stringToMemeId } from "../helpers";

export async function tokenAccountBalanceController(req: Request, res: Response) {
  try {
    const { tokenAccountAddress } = req.params as { tokenAccountAddress: string };
    if (!tokenAccountAddress) {
      return res.status(400).json({ success: false, message: "tokenAccountAddress is required" });
    }

    let tokenAccount: PublicKey;
    try {
      tokenAccount = new PublicKey(tokenAccountAddress);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid token account address" });
    }

    const balance = await getTokenBalance(tokenAccount);
    if (!balance) {
      return res.status(404).json({ success: false, message: "Token account not found or invalid" });
    }

    return res.json({ success: true, data: balance });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

export async function memeTokenDistributionController(req: Request, res: Response) {
  try {
    const { memeId } = req.params as { memeId: string };
    if (!memeId) {
      return res.status(400).json({ success: false, message: "memeId is required" });
    }

    const memeIdBuffer = stringToMemeId(memeId);
    const distribution = await getMemeTokenDistribution(memeIdBuffer);

    if (!distribution) {
      return res.status(404).json({ success: false, message: "Meme token not found or no balances available" });
    }

    return res.json({ success: true, data: distribution });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

export async function allMemeTokenBalancesController(req: Request, res: Response) {
  try {
    const { memeIds } = req.body as { memeIds: string[] };
    if (!Array.isArray(memeIds) || memeIds.length === 0) {
      return res.status(400).json({ success: false, message: "memeIds array is required" });
    }

    const buffers = memeIds.map((id) => stringToMemeId(id));
    const results = await getAllMemeTokenBalances(buffers);

    return res.json({ success: true, data: results });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

export async function recentMintDistributionController(req: Request, res: Response) {
  try {
    const { memeId } = req.params as { memeId: string };
    if (!memeId) {
      return res.status(400).json({ success: false, message: "memeId is required" });
    }

    const result = await getRecentMintDistribution(memeId);
    if (!result) {
      return res.status(404).json({ success: false, message: "Meme token not found" });
    }

    return res.json({ success: true, data: result });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

export async function getAllMintedTokensController(req: Request, res: Response) {
  try {
    const tokens = await getAllMintedTokens();
    
    return res.json({
      success: true,
      message: "All minted tokens retrieved successfully",
      data: {
        count: tokens.length,
        tokens: tokens
      }
    });
  } catch (error: any) {
    console.error('/all-minted-tokens error:', error);
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}


