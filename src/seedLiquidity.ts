import { 
    Liquidity, 
    MAINNET_PROGRAM_ID as RAYDIUM_PROGRAM_ID,
    Token, 
    TokenAmount,
    LiquidityPoolKeysV4,
    jsonInfo2PoolKeys,
    LiquidityAssociatedPoolKeysV4,
    ApiPoolInfoV4,
    LIQUIDITY_STATE_LAYOUT_V4,
    Market
  } from "@raydium-io/raydium-sdk";
  import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL,
    SystemProgram,
  } from "@solana/web3.js";
  import {
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    getAccount,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  } from "@solana/spl-token";
  import * as anchor from "@project-serum/anchor";
  import { getProgram, getVaultPda, stringToMemeId } from "./service";
  
  // Raydium Devnet Program IDs
  export const RAYDIUM_DEVNET_PROGRAM_IDS = {
    AmmV4: new PublicKey("HWy1jotHpo6UqeQxx49dpYYdQB8wj9Qk9MdxwjLvDHB8"), // Devnet AMM
    Serum: new PublicKey("EoTcMgcDRTJVZDMZWBoU6rhYHZfkNTVEAfz3uUJRcYGj"), // Devnet Serum
    TOKEN_PROGRAM_ID: TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  };
  
  // SOL token info for devnet
  const SOL_TOKEN_INFO = {
    chainId: 103, // Devnet
    address: "So11111111111111111111111111111111111111112", // Wrapped SOL
    programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    logoURI: "",
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
    tags: [],
    extensions: {},
  };
  
  interface CreatePoolResult {
    poolId: PublicKey;
    poolKeys: LiquidityPoolKeysV4;
    transaction: string;
    baseTokenAccount: PublicKey;
    quoteTokenAccount: PublicKey;
  }
  
  // Create a new Raydium liquidity pool
  export async function createRaydiumPool(
    memeTokenMint: PublicKey,
    baseTokenAmount: number, // Amount of meme tokens
    quoteTokenAmount: number // Amount of SOL
  ): Promise<CreatePoolResult> {
    const { connection, adminKeypair } = getProgram();
    
    console.log("🏊 Creating Raydium pool...");
    console.log("Base Token (Meme):", memeTokenMint.toBase58());
    console.log("Quote Token (SOL):", SOL_TOKEN_INFO.address);
    
    // Create token info for the meme token
    const memeTokenInfo = new Token(
      TOKEN_2022_PROGRAM_ID,
      memeTokenMint,
      9, // decimals
      "MEME", // symbol
      "Meme Token" // name
    );
    
    const solTokenInfo = new Token(
      new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      new PublicKey(SOL_TOKEN_INFO.address),
      SOL_TOKEN_INFO.decimals,
      SOL_TOKEN_INFO.symbol,
      SOL_TOKEN_INFO.name
    );
  
    // Convert amounts to token amounts with proper decimals
    const baseAmount = new TokenAmount(memeTokenInfo, baseTokenAmount * Math.pow(10, 9));
    const quoteAmount = new TokenAmount(solTokenInfo, quoteTokenAmount * LAMPORTS_PER_SOL);
  
    try {
      // Get associated token accounts
      const baseTokenAccount = getAssociatedTokenAddressSync(
        memeTokenMint,
        adminKeypair.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID
      );
      
      const quoteTokenAccount = getAssociatedTokenAddressSync(
        new PublicKey(SOL_TOKEN_INFO.address),
        adminKeypair.publicKey,
        false,
        new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
      );
  
      // Create the pool instruction
      const { innerTransaction } = await Liquidity.makeCreatePoolV4InstructionV2Simple({
        connection,
        programId: RAYDIUM_DEVNET_PROGRAM_IDS.AmmV4,
        marketInfo: {
          marketId: Keypair.generate().publicKey, // Generate a market ID
          programId: RAYDIUM_DEVNET_PROGRAM_IDS.Serum,
        },
        baseMintInfo: memeTokenInfo,
        quoteMintInfo: solTokenInfo,
        baseAmount,
        quoteAmount,
        startTime: new anchor.BN(Math.floor(Date.now() / 1000)),
        ownerInfo: {
          feePayer: adminKeypair.publicKey,
          wallet: adminKeypair.publicKey,
          tokenAccounts: [],
          useSOLBalance: true,
        },
        associatedOnly: false,
      });
  
      // Execute the transaction
      const tx = await sendAndConfirmTransaction(
        connection,
        innerTransaction,
        [adminKeypair],
        { commitment: "confirmed" }
      );
  
      console.log("✅ Pool created successfully!");
      console.log("Transaction:", tx);
  
      // Extract pool ID from transaction (this is simplified)
      const poolId = Keypair.generate().publicKey; // In real implementation, extract from tx
  
      // Create pool keys structure
      const poolKeys: LiquidityPoolKeysV4 = {
        id: poolId,
        baseMint: memeTokenMint,
        quoteMint: new PublicKey(SOL_TOKEN_INFO.address),
        lpMint: Keypair.generate().publicKey, // Extract from transaction
        baseDecimals: 9,
        quoteDecimals: 9,
        lpDecimals: 9,
        version: 4,
        programId: RAYDIUM_DEVNET_PROGRAM_IDS.AmmV4,
        authority: PublicKey.default,
        openOrders: PublicKey.default,
        targetOrders: PublicKey.default,
        baseVault: PublicKey.default,
        quoteVault: PublicKey.default,
        withdrawQueue: PublicKey.default,
        lpVault: PublicKey.default,
        marketVersion: 3,
        marketProgramId: RAYDIUM_DEVNET_PROGRAM_IDS.Serum,
        marketId: PublicKey.default,
        marketAuthority: PublicKey.default,
        marketBaseVault: PublicKey.default,
        marketQuoteVault: PublicKey.default,
        marketBids: PublicKey.default,
        marketAsks: PublicKey.default,
        marketEventQueue: PublicKey.default,
        lookupTableAccount: PublicKey.default,
      };
  
      return {
        poolId,
        poolKeys,
        transaction: tx,
        baseTokenAccount,
        quoteTokenAccount,
      };
  
    } catch (error) {
      console.error("❌ Error creating Raydium pool:", error);
      throw error;
    }
  }