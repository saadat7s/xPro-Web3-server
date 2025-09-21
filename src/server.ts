import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { 
  initializeProtocolState, 
  resetProtocolState, 
  getProgram, 
  getProtocolState,
  mintMemeToken,
  getMemeTokenState,
  getFeeVaultBalance,
  getFeeVaultBalanceInSol,
  getMinterSolBalance,
  isProtocolInitialized,
  memeIdToString,
  stringToMemeId,
  lamportsToSol,
  solToLamports
} from "./service";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Initialize protocol state
app.post("/initialize-protocol-state", async (req: Request, res: Response) => {
  try {
    const { feeLamports } = req.body as { feeLamports: number };

    if (typeof feeLamports !== "number" || feeLamports <= 0) {
      return res.status(400).json({ success: false, message: "Invalid feeLamports value" });
    }

    const result = await initializeProtocolState(feeLamports);

    return res.status(200).json({
      success: true,
      message: "Protocol state initialized successfully",
      ...result,
    });
  } catch (err: any) {
    console.error("/initialize-protocol-state error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || String(err),
    });
  }
});

// Reset protocol state
app.post("/reset-protocol-state", async (req: Request, res: Response) => {
  try {
    const result = await resetProtocolState();

    return res.status(200).json({
      success: true,
      message: "Protocol state reset successfully",
      ...result,
    });
  } catch (err: any) {
    console.error("/reset-protocol-state error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || String(err),
    });
  }
});



app.get("/protocol-state", async (req: Request, res: Response) => {
  try {
    const state = await getProtocolState();

    if (!state) {
      return res.status(404).json({
        success: false,
        message: "Protocol state not found or not initialized",
      });
    }

    return res.status(200).json({
      success: true,
      protocolState: state.address.toBase58(),
      data: {
        authority: state.authority.toBase58(),
        feeLamports: state.feeLamports,
        feeInSol: lamportsToSol(state.feeLamports),
        bump: state.bump,
      },
    });
  } catch (err: any) {
    console.error("/protocol-state error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || String(err),
    });
  }
}); 

// POST route for minting meme tokens
app.post('/mint-meme-token', async (req, res) => {
  try {
    const { memeId } = req.body;
    
    let memeIdBuffer: Buffer | undefined;
    if (memeId) {
      if (typeof memeId === 'string') {
        memeIdBuffer = stringToMemeId(memeId);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Invalid memeId format - must be a string',
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'memeId is required',
      });
    }

    const result = await mintMemeToken(memeIdBuffer as Buffer);

    res.json({
      success: true,
      message: 'Meme token minted successfully',
      data: {
        transactionId: result.transactionId,
        memeId: memeIdToString(result.memeId),
        memeIdHex: Buffer.from(result.memeId).toString('hex'),
        mint: result.mint.toBase58(),
        minter: result.minter.toBase58(),
        memeTokenState: result.memeTokenState.toBase58(),
        vault: result.vault.toBase58(),
        minterTokenAccount: result.minterTokenAccount.toBase58(),
        vaultTokenAccount: result.vaultTokenAccount.toBase58(),
      }
    });

  } catch (error: any) {
    console.error('/mint-meme-token error:', error);

    let errorMessage = error?.message || 'Minting failed';

    if (errorMessage.includes('MemeAlreadyMinted')) {
      return res.status(409).json({
        success: false,
        error: 'This meme has already been minted',
      });
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

// Get meme token state by meme ID
app.get('/meme-token-state/:memeId', async (req: Request, res: Response) => {
  try {
    const { memeId } = req.params;
    
    if (!memeId) {
      return res.status(400).json({
        success: false,
        error: 'Meme ID is required',
      });
    }

    const memeIdBuffer = stringToMemeId(memeId);
    const state = await getMemeTokenState(memeIdBuffer);

    if (!state) {
      return res.status(404).json({
        success: false,
        message: 'Meme token state not found',
      });
    }

    res.json({
      success: true,
      data: {
        address: state.address.toBase58(),
        memeId: memeIdToString(state.memeId),
        memeIdHex: Buffer.from(state.memeId).toString('hex'),
        mint: state.mint.toBase58(),
        minter: state.minter.toBase58(),
        createdAt: state.createdAt,
        isInitialized: state.isInitialized,
        bump: state.bump,
      }
    });

  } catch (error: any) {
    console.error('/meme-token-state error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch meme token state',
    });
  }
});

// Get fee vault balance
app.get('/fee-vault-balance', async (req: Request, res: Response) => {
  try {
    const balanceLamports = await getFeeVaultBalance();
    const balanceSol = await getFeeVaultBalanceInSol();

    res.json({
      success: true,
      data: {
        lamports: balanceLamports,
        sol: balanceSol,
      }
    });

  } catch (error: any) {
    console.error('/fee-vault-balance error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch fee vault balance',
    });
  }
});

// Get minter SOL balance
app.get('/minter-balance', async (req: Request, res: Response) => {
  try {
    const balance = await getMinterSolBalance();

    res.json({
      success: true,
      data: balance
    });

  } catch (error: any) {
    console.error('/minter-balance error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch minter balance',
    });
  }
});

// Check if protocol is initialized
app.get('/protocol-status', async (req: Request, res: Response) => {
  try {
    const isInitialized = await isProtocolInitialized();

    res.json({
      success: true,
      data: {
        isInitialized
      }
    });

  } catch (error: any) {
    console.error('/protocol-status error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to check protocol status',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
