import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { 
  initializeProtocolState, 
  resetProtocolState, 
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
} from "./service";
import { formatTokenAmount, getRecentMintDistribution, getTokenBalance } from "./mintDetails";
import { 
  createOrcaPoolForMeme, 
  addLiquidityToOrcaPool, 
  getPoolInfo 
} from "./orcaService";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ==================== EXISTING ENDPOINTS ====================

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

// GET route for checking meme token distribution
app.get('/meme-token-distribution/:memeId', async (req, res) => {
  try {
    const { memeId } = req.params;
    
    if (!memeId) {
      return res.status(400).json({
        success: false,
        error: 'memeId parameter is required',
      });
    }

    const distribution = await getRecentMintDistribution(memeId);
    
    if (!distribution) {
      return res.status(404).json({
        success: false,
        error: 'Meme token not found or no balances available',
      });
    }

    return res.json({
      success: true,
      message: 'Token distribution retrieved successfully',
      data: {
        memeId,
        ...distribution
      }
    });

  } catch (error: any) {
    console.error('/meme-token-distribution error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve token distribution',
    });
  }
});

// GET route for checking specific token account balance
app.get('/token-balance/:tokenAccountAddress', async (req, res) => {
  try {
    const { tokenAccountAddress } = req.params;
    
    if (!tokenAccountAddress) {
      return res.status(400).json({
        success: false,
        error: 'tokenAccountAddress parameter is required',
      });
    }

    let tokenAccount: PublicKey;
    try {
      tokenAccount = new PublicKey(tokenAccountAddress);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token account address format',
      });
    }

    const balance = await getTokenBalance(tokenAccount);
    
    if (!balance) {
      return res.status(404).json({
        success: false,
        error: 'Token account not found or invalid',
      });
    }

    return res.json({
      success: true,
      message: 'Token balance retrieved successfully',
      data: {
        tokenAccountAddress,
        mint: balance.mint.toBase58(),
        balance: balance.balance,
        formattedBalance: formatTokenAmount(balance.balance, balance.decimals),
        decimals: balance.decimals,
      }
    });

  } catch (error: any) {
    console.error('/token-balance error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to retrieve token balance',
    });
  }
});

// ==================== NEW ORCA ENDPOINTS ====================

/**
 * POST /create-pool
 * Create an Orca Whirlpool for a meme token
 * Body: { memeTokenMint: string }
 */
app.post('/create-pool', async (req: Request, res: Response) => {
  try {
    const { memeTokenMint } = req.body;

    if (!memeTokenMint) {
      return res.status(400).json({
        success: false,
        error: 'memeTokenMint is required',
      });
    }

    let mintPubkey: PublicKey;
    try {
      mintPubkey = new PublicKey(memeTokenMint);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid memeTokenMint address format',
      });
    }

    console.log('[POST /create-pool] Creating pool for mint:', mintPubkey.toBase58());
    const result = await createOrcaPoolForMeme(mintPubkey);

    return res.json({
      success: true,
      message: result.alreadyExisted ? 'Pool already exists' : 'Pool created successfully',
      data: {
        poolAddress: result.poolAddress.toBase58(),
        tokenMintA: result.tokenMintA.toBase58(),
        tokenMintB: result.tokenMintB.toBase58(),
        transactionSignature: result.transactionSignature,
        alreadyExisted: result.alreadyExisted,
      }
    });

  } catch (error: any) {
    console.error('[POST /create-pool] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create pool',
    });
  }
});

/**
 * POST /add-liquidity
 * Add liquidity to an Orca Whirlpool
 * Body: { 
 *   whirlpoolAddress: string, 
 *   inputMint: string (SOL or MEME token), 
 *   inputAmount: number (in token units)
 * }
 */
app.post('/add-liquidity', async (req: Request, res: Response) => {
  try {
    const { whirlpoolAddress, inputMint, inputAmount } = req.body;

    if (!whirlpoolAddress || !inputMint || !inputAmount) {
      return res.status(400).json({
        success: false,
        error: 'whirlpoolAddress, inputMint, and inputAmount are required',
      });
    }

    let poolPubkey: PublicKey;
    let mintPubkey: PublicKey;
    
    try {
      poolPubkey = new PublicKey(whirlpoolAddress);
      mintPubkey = new PublicKey(inputMint);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format',
      });
    }

    if (typeof inputAmount !== 'number' || inputAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'inputAmount must be a positive number',
      });
    }

    console.log('[POST /add-liquidity] Adding liquidity to pool:', poolPubkey.toBase58());
    const result = await addLiquidityToOrcaPool(poolPubkey, mintPubkey, inputAmount);

    return res.json({
      success: true,
      message: 'Liquidity added successfully',
      data: result
    });

  } catch (error: any) {
    console.error('[POST /add-liquidity] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to add liquidity',
    });
  }
});

/**
 * GET /pool-info/:poolAddress
 * Get information about a Whirlpool
 */
app.get('/pool-info/:poolAddress', async (req: Request, res: Response) => {
  try {
    const { poolAddress } = req.params;

    if (!poolAddress) {
      return res.status(400).json({
        success: false,
        error: 'poolAddress is required',
      });
    }

    let poolPubkey: PublicKey;
    try {
      poolPubkey = new PublicKey(poolAddress);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid pool address format',
      });
    }

    console.log('[GET /pool-info] Fetching info for pool:', poolPubkey.toBase58());
    const result = await getPoolInfo(poolPubkey);

    return res.json({
      success: true,
      message: 'Pool info retrieved successfully',
      data: result
    });

  } catch (error: any) {
    console.error('[GET /pool-info] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pool info',
    });
  }
});

/**
 * POST /mint-and-create-pool
 * Combined endpoint: Mint a meme token and create an Orca pool for it
 * Body: { memeId: string }
 */
app.post('/mint-and-create-pool', async (req: Request, res: Response) => {
  try {
    const { memeId } = req.body;

    if (!memeId || typeof memeId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'memeId (string) is required',
      });
    }

    console.log('[POST /mint-and-create-pool] Step 1: Minting token...');
    const memeIdBuffer = stringToMemeId(memeId);
    const mintResult = await mintMemeToken(memeIdBuffer);

    console.log('[POST /mint-and-create-pool] Step 2: Creating pool...');
    const poolResult = await createOrcaPoolForMeme(mintResult.mint);

    return res.json({
      success: true,
      message: 'Token minted and pool created successfully',
      data: {
        mint: {
          transactionId: mintResult.transactionId,
          memeId: memeIdToString(mintResult.memeId),
          mint: mintResult.mint.toBase58(),
          vault: mintResult.vault.toBase58(),
        },
        pool: {
          poolAddress: poolResult.poolAddress.toBase58(),
          tokenMintA: poolResult.tokenMintA.toBase58(),
          tokenMintB: poolResult.tokenMintB.toBase58(),
          transactionSignature: poolResult.transactionSignature,
          alreadyExisted: poolResult.alreadyExisted,
        }
      }
    });

  } catch (error: any) {
    console.error('[POST /mint-and-create-pool] Error:', error);
    
    let errorMessage = error?.message || 'Operation failed';
    
    if (errorMessage.includes('MemeAlreadyMinted')) {
      return res.status(409).json({
        success: false,
        error: 'This meme has already been minted',
      });
    }

    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('  POST   /initialize-protocol-state');
  console.log('  POST   /reset-protocol-state');
  console.log('  GET    /protocol-state');
  console.log('  POST   /mint-meme-token');
  console.log('  GET    /meme-token-state/:memeId');
  console.log('  GET    /fee-vault-balance');
  console.log('  GET    /minter-balance');
  console.log('  GET    /protocol-status');
  console.log('  GET    /meme-token-distribution/:memeId');
  console.log('  GET    /token-balance/:tokenAccountAddress');
  console.log('\n🌊 Orca Liquidity Pool endpoints:');
  console.log('  POST   /create-pool');
  console.log('  POST   /add-liquidity');
  console.log('  GET    /pool-info/:poolAddress');
  console.log('  POST   /mint-and-create-pool\n');
});