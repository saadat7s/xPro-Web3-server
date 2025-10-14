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
  initializeAmmPool,
  addLiquidity,
  removeLiquidity,
  swapSolForTokens,
  swapTokensForSol,
  getPoolInfo,
  calculatePrice,
  calculateSwapOutput,
} from "./ammService";

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

// ==================== AMM ENDPOINTS ====================

// Initialize AMM pool
app.post('/create-amm-pool', async (req: Request, res: Response) => {
  try {
    const { tokenMint, initialSolAmount, initialTokenAmount } = req.body;

    if (!tokenMint || !initialSolAmount || !initialTokenAmount) {
      return res.status(400).json({
        success: false,
        error: 'tokenMint, initialSolAmount, and initialTokenAmount are required',
      });
    }

    const result = await initializeAmmPool(
      tokenMint,
      initialSolAmount,
      initialTokenAmount
    );

    return res.json({
      success: true,
      message: 'AMM pool created successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('/create-amm-pool error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create AMM pool',
    });
  }
});

// Add liquidity
app.post('/add-liquidity', async (req: Request, res: Response) => {
  try {
    const { tokenMint, solAmount, maxTokenAmount, minLpAmount } = req.body;

    if (!tokenMint || !solAmount || !maxTokenAmount) {
      return res.status(400).json({
        success: false,
        error: 'tokenMint, solAmount, and maxTokenAmount are required',
      });
    }

    const result = await addLiquidity(
      tokenMint,
      solAmount,
      maxTokenAmount,
      minLpAmount || 0
    );

    return res.json({
      success: true,
      message: 'Liquidity added successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('/add-liquidity error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to add liquidity',
    });
  }
});

// Remove liquidity
app.post('/remove-liquidity', async (req: Request, res: Response) => {
  try {
    const { tokenMint, lpAmount, minSolAmount, minTokenAmount } = req.body;

    if (!tokenMint || !lpAmount) {
      return res.status(400).json({
        success: false,
        error: 'tokenMint and lpAmount are required',
      });
    }

    const result = await removeLiquidity(
      tokenMint,
      lpAmount,
      minSolAmount || 0,
      minTokenAmount || 0
    );

    return res.json({
      success: true,
      message: 'Liquidity removed successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('/remove-liquidity error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to remove liquidity',
    });
  }
});

// Swap SOL for tokens
app.post('/swap-sol-for-tokens', async (req: Request, res: Response) => {
  try {
    const { tokenMint, solAmount, minTokenAmount } = req.body;

    if (!tokenMint || !solAmount) {
      return res.status(400).json({
        success: false,
        error: 'tokenMint and solAmount are required',
      });
    }

    const result = await swapSolForTokens(
      tokenMint,
      solAmount,
      minTokenAmount || 0
    );

    return res.json({
      success: true,
      message: 'Swap executed successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('/swap-sol-for-tokens error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Swap failed',
    });
  }
});

// Swap tokens for SOL
app.post('/swap-tokens-for-sol', async (req: Request, res: Response) => {
  try {
    const { tokenMint, tokenAmount, minSolAmount } = req.body;

    if (!tokenMint || !tokenAmount) {
      return res.status(400).json({
        success: false,
        error: 'tokenMint and tokenAmount are required',
      });
    }

    const result = await swapTokensForSol(
      tokenMint,
      tokenAmount,
      minSolAmount || 0
    );

    return res.json({
      success: true,
      message: 'Swap executed successfully',
      data: result,
    });
  } catch (error: any) {
    console.error('/swap-tokens-for-sol error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Swap failed',
    });
  }
});

// Get pool info
app.get('/pool-info/:tokenMint', async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;

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

    // Calculate current price
    const price = calculatePrice(
      poolInfo.solReserveInSol,
      poolInfo.tokenReserveFormatted
    );

    return res.json({
      success: true,
      data: {
        ...poolInfo,
        currentPrice: price,
        priceInSol: price.toFixed(9),
      },
    });
  } catch (error: any) {
    console.error('/pool-info error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pool info',
    });
  }
});

// Calculate swap quote (no transaction)
app.post('/swap-quote', async (req: Request, res: Response) => {
  try {
    const { tokenMint, inputToken, inputAmount } = req.body;

    if (!tokenMint || !inputToken || !inputAmount) {
      return res.status(400).json({
        success: false,
        error: 'tokenMint, inputToken (SOL or TOKEN), and inputAmount are required',
      });
    }

    const poolInfo = await getPoolInfo(tokenMint);

    if (!poolInfo) {
      return res.status(404).json({
        success: false,
        error: 'Pool not found',
      });
    }

    let outputAmount: number;
    let priceImpact: number;

    if (inputToken.toUpperCase() === 'SOL') {
      // Swapping SOL for tokens
      outputAmount = calculateSwapOutput(
        inputAmount,
        poolInfo.solReserveInSol,
        poolInfo.tokenReserveFormatted
      );

      priceImpact = (inputAmount / poolInfo.solReserveInSol) * 100;
    } else {
      // Swapping tokens for SOL
      outputAmount = calculateSwapOutput(
        inputAmount,
        poolInfo.tokenReserveFormatted,
        poolInfo.solReserveInSol
      );

      priceImpact = (inputAmount / poolInfo.tokenReserveFormatted) * 100;
    }

    const currentPrice = calculatePrice(
      poolInfo.solReserveInSol,
      poolInfo.tokenReserveFormatted
    );

    return res.json({
      success: true,
      data: {
        inputToken,
        inputAmount,
        outputAmount,
        estimatedOutput: outputAmount.toFixed(9),
        currentPrice,
        priceImpact: priceImpact.toFixed(4) + '%',
        fee: '0.3%',
        minimumReceived: (outputAmount * 0.99).toFixed(9), // 1% slippage tolerance
      },
    });
  } catch (error: any) {
    console.error('/swap-quote error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate quote',
    });
  }
});

// Update your server startup to include new endpoints
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log('\n📋 Available endpoints:');
  console.log('\n=== Protocol Management ===');
  console.log('  POST   /initialize-protocol-state');
  console.log('  POST   /reset-protocol-state');
  console.log('  GET    /protocol-state');
  console.log('  GET    /protocol-status');
  
  console.log('\n=== Token Minting ===');
  console.log('  POST   /mint-meme-token');
  console.log('  GET    /meme-token-state/:memeId');
  console.log('  GET    /meme-token-distribution/:memeId');
  console.log('  GET    /token-balance/:tokenAccountAddress');
  
  console.log('\n=== AMM / Liquidity Pool ===');
  console.log('  POST   /create-amm-pool');
  console.log('  POST   /add-liquidity');
  console.log('  POST   /remove-liquidity');
  console.log('  POST   /swap-sol-for-tokens');
  console.log('  POST   /swap-tokens-for-sol');
  console.log('  GET    /pool-info/:tokenMint');
  console.log('  POST   /swap-quote');
  
  console.log('\n=== Wallet Info ===');
  console.log('  GET    /fee-vault-balance');
  console.log('  GET    /minter-balance');
  console.log('\n');
});



