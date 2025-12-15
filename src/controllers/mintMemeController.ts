import { Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import { stringToMemeId } from "../helpers";
import {
  checkProtocolStateStatus,
  createInitializeProtocolStateTransaction,
  createMintMemeTokenTransaction,
  createCreateAssociatedTokenAccountTransaction,
} from "../services/mintMemeService";

export async function initializeProtocolTxController(req: Request, res: Response) {
  try {
    const { admin } = req.body as { admin: string };

    if (!admin) {
      return res.status(400).json({ success: false, message: "admin is required" });
    }

    let adminPubkey: PublicKey;
    try {
      adminPubkey = new PublicKey(admin);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid admin public key" });
    }

    const result = await createInitializeProtocolStateTransaction(adminPubkey);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

// ❌ REMOVED: Reset Protocol State controller - the service function no longer exists
// The mint fee is now fixed at 0.01 SOL and cannot be changed

export async function checkProtocolStateController(req: Request, res: Response) {
  try {
    const status = await checkProtocolStateStatus();
    return res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    console.error('/protocol-state error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to check protocol state',
    });
  }
}

export async function mintMemeTxController(req: Request, res: Response) {
  try {
    const { minter, memeId } = req.body as { minter: string; memeId: string };
    if (!minter || !memeId) {
      return res.status(400).json({ success: false, message: "minter and memeId are required" });
    }

    let minterPubkey: PublicKey;
    try {
      minterPubkey = new PublicKey(minter);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid minter public key" });
    }

    const memeIdBuffer = stringToMemeId(memeId);
    const result = await createMintMemeTokenTransaction(minterPubkey, memeIdBuffer);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}

export async function createAtaTxController(req: Request, res: Response) {
  try {
    const { payer, mint, owner } = req.body as { payer: string; mint: string; owner: string };
    if (!payer || !mint || !owner) {
      return res.status(400).json({ success: false, message: "payer, mint, and owner are required" });
    }

    let payerPk: PublicKey;
    let mintPk: PublicKey;
    let ownerPk: PublicKey;
    try {
      payerPk = new PublicKey(payer);
      mintPk = new PublicKey(mint);
      ownerPk = new PublicKey(owner);
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid public key in request" });
    }

    const result = await createCreateAssociatedTokenAccountTransaction(payerPk, mintPk, ownerPk);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error?.message || String(error) });
  }
}


