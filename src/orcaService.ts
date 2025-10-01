// src/orca-integration.ts
import {
    Connection,
    PublicKey,
    Keypair,
    Transaction,
    VersionedTransaction,
    sendAndConfirmTransaction,
    LAMPORTS_PER_SOL,
  } from "@solana/web3.js";
  import {
    WhirlpoolContext,
    buildWhirlpoolClient,
    ORCA_WHIRLPOOL_PROGRAM_ID,
    PDAUtil,
    TickUtil,
    increaseLiquidityQuoteByInputToken,
    TokenExtensionContext,
    TokenExtensionUtil,
    TokenExtensionContextForPool,
  } from "@orca-so/whirlpools-sdk";
  import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
  import * as anchor from "@coral-xyz/anchor";
  import { DecimalUtil, Percentage } from "@orca-so/common-sdk";
  import Decimal from "decimal.js";
  import { getProgram } from "./service";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
  
  /**
   * Orca Whirlpools Config (Devnet)
   */
  const ORCA_WHIRLPOOLS_CONFIG = new PublicKey(
    "FcrweFY1G9HJAHG5inkGB6pKg1HZ6x9UC2WioAfWrGkR"
  );
  const TICK_SPACING = 128; // 0.25% fee tier
  
  /**
   * Native SOL mint address (wrapped SOL)
   */
  const NATIVE_MINT = new PublicKey("So11111111111111111111111111111111111111112");
  
  /**
   * Build a Wallet object for Anchor Provider
   */
  function makeAnchorWallet(adminKeypair: Keypair): Wallet {
    const wallet: Wallet = {
      publicKey: adminKeypair.publicKey,
      payer: adminKeypair,
      
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        try {
          if (tx instanceof Transaction) {
            tx.partialSign(adminKeypair);
          } else {
            (tx as VersionedTransaction).sign([adminKeypair]);
          }
        } catch (e) {
          if ("partialSign" in tx && typeof (tx as any).partialSign === "function") {
            (tx as any).partialSign(adminKeypair);
          } else if ("sign" in tx && typeof (tx as any).sign === "function") {
            (tx as any).sign([adminKeypair]);
          }
        }
        return tx;
      },
  
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
        for (const tx of txs) {
          try {
            if (tx instanceof Transaction) {
              tx.partialSign(adminKeypair);
            } else {
              (tx as VersionedTransaction).sign([adminKeypair]);
            }
          } catch {
            if ("partialSign" in tx && typeof (tx as any).partialSign === "function") {
              (tx as any).partialSign(adminKeypair);
            } else if ("sign" in tx && typeof (tx as any).sign === "function") {
              (tx as any).sign([adminKeypair]);
            }
          }
        }
        return txs;
      },
    };
  
    return wallet;
  }
  
  /**
   * Get Orca context with provider
   */
  function getOrcaContext(connection: Connection, adminKeypair: Keypair) {
    console.log("🌊 [getOrcaContext] Initializing Orca context...");
    const wallet = makeAnchorWallet(adminKeypair);
    const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
    const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
    console.log("🌊 [getOrcaContext] Orca context initialized");
    return { ctx, provider };
  }
  
  /**
   * Create a Whirlpool pool for MEME/SOL pair
   */
  export async function createOrcaPoolForMeme(memeTokenMint: PublicKey) {
    console.log("🏊 [createOrcaPoolForMeme] Starting pool creation...");
    console.log("🏊 [createOrcaPoolForMeme] Meme token mint:", memeTokenMint.toBase58());
    console.log("🏊 [createOrcaPoolForMeme] Native SOL mint:", NATIVE_MINT.toBase58());
  
    const { connection, adminKeypair } = getProgram();
    const { ctx, provider } = getOrcaContext(connection, adminKeypair);
    const client = buildWhirlpoolClient(ctx);
  
    // Determine token order (Orca requires tokenA < tokenB by address)
    let tokenMintA: PublicKey;
    let tokenMintB: PublicKey;
    
    if (memeTokenMint.toBuffer().compare(NATIVE_MINT.toBuffer()) < 0) {
      tokenMintA = memeTokenMint;
      tokenMintB = NATIVE_MINT;
      console.log("🏊 [createOrcaPoolForMeme] Token order: MEME/SOL");
    } else {
      tokenMintA = NATIVE_MINT;
      tokenMintB = memeTokenMint;
      console.log("🏊 [createOrcaPoolForMeme] Token order: SOL/MEME");
    }
  
    // Derive pool PDA
    const whirlpoolPda = PDAUtil.getWhirlpool(
      ORCA_WHIRLPOOL_PROGRAM_ID,
      ORCA_WHIRLPOOLS_CONFIG,
      tokenMintA,
      tokenMintB,
      TICK_SPACING
    );
    console.log("🏊 [createOrcaPoolForMeme] Pool PDA:", whirlpoolPda.publicKey.toBase58());
  
    // Check if pool already exists
    const existing = await connection.getAccountInfo(whirlpoolPda.publicKey);
    if (existing) {
      console.log("✅ [createOrcaPoolForMeme] Pool already exists!");
      return {
        poolAddress: whirlpoolPda.publicKey,
        tokenMintA,
        tokenMintB,
        alreadyExisted: true,
      };
    }
  
    console.log("🏊 [createOrcaPoolForMeme] Creating new pool...");
  
    // Initial price: 1 MEME = 0.00001 SOL (or 100,000 MEME per SOL)
    const initialPriceNumber = 0.00001;
    const initialPrice = DecimalUtil.fromNumber(initialPriceNumber);
    console.log("🏊 [createOrcaPoolForMeme] Initial price:", initialPriceNumber);
  
    try {
      const createResult = await client.createPool(
        ORCA_WHIRLPOOLS_CONFIG,
        tokenMintA,
        tokenMintB,
        TICK_SPACING,
        initialPrice.toNumber(),
        adminKeypair.publicKey
      );
  
      const poolKey: PublicKey = (createResult as any).poolKey ?? (createResult as any);
      const txBuilder = (createResult as any).tx ?? (createResult as any);
  
      console.log("🏊 [createOrcaPoolForMeme] Building transaction...");
  
      if (txBuilder && typeof (txBuilder as any).build === "function") {
        const built = await (txBuilder as any).build();
        console.log("🏊 [createOrcaPoolForMeme] Transaction built, type:", built.constructor.name);
        
        // Check if it's a wrapper object with { transaction, signers, recentBlockhash }
        if (built.transaction && typeof built.transaction === 'object') {
          console.log("🏊 [createOrcaPoolForMeme] Found wrapped transaction object");
          const tx = built.transaction;
          const signers = built.signers || [];
          const allSigners = [adminKeypair, ...signers];
          
          // Handle VersionedTransaction
          if (tx instanceof VersionedTransaction || tx.constructor.name === 'VersionedTransaction') {
            console.log("🏊 [createOrcaPoolForMeme] Signing VersionedTransaction...");
            tx.sign(allSigners);
            const sig = await connection.sendTransaction(tx);
            await connection.confirmTransaction(sig, 'confirmed');
            console.log("✅ [createOrcaPoolForMeme] Pool created! Signature:", sig);
            
            return {
              poolAddress: whirlpoolPda.publicKey,
              tokenMintA,
              tokenMintB,
              transactionSignature: sig,
              alreadyExisted: false,
            };
          }
          
          // Handle legacy Transaction
          if (tx instanceof Transaction || tx.constructor.name === 'Transaction') {
            console.log("🏊 [createOrcaPoolForMeme] Signing legacy Transaction...");
            if (built.recentBlockhash) {
              tx.recentBlockhash = built.recentBlockhash;
            }
            if (allSigners.length > 0) {
              tx.partialSign(...allSigners);
            }
            const sig = await sendAndConfirmTransaction(connection, tx, allSigners);
            console.log("✅ [createOrcaPoolForMeme] Pool created! Signature:", sig);
            
            return {
              poolAddress: whirlpoolPda.publicKey,
              tokenMintA,
              tokenMintB,
              transactionSignature: sig,
              alreadyExisted: false,
            };
          }
        }
        
        // Handle direct VersionedTransaction
        if (built instanceof VersionedTransaction || built.constructor.name === 'VersionedTransaction') {
          console.log("🏊 [createOrcaPoolForMeme] Signing VersionedTransaction...");
          built.sign([adminKeypair]);
          const sig = await connection.sendTransaction(built);
          await connection.confirmTransaction(sig, 'confirmed');
          console.log("✅ [createOrcaPoolForMeme] Pool created! Signature:", sig);
          
          return {
            poolAddress: whirlpoolPda.publicKey,
            tokenMintA,
            tokenMintB,
            transactionSignature: sig,
            alreadyExisted: false,
          };
        }
        
        // Handle direct legacy Transaction
        if (built instanceof Transaction || built.constructor.name === 'Transaction') {
          console.log("🏊 [createOrcaPoolForMeme] Handling legacy Transaction...");
          built.partialSign(adminKeypair);
          const sig = await sendAndConfirmTransaction(connection, built, [adminKeypair]);
          console.log("✅ [createOrcaPoolForMeme] Pool created! Signature:", sig);
          
          return {
            poolAddress: whirlpoolPda.publicKey,
            tokenMintA,
            tokenMintB,
            transactionSignature: sig,
            alreadyExisted: false,
          };
        }
  
        throw new Error(`Unknown transaction type: ${built.constructor.name}`);
      }
  
      if (txBuilder && typeof (txBuilder as any).buildAndExecute === "function") {
        console.log("🏊 [createOrcaPoolForMeme] Using buildAndExecute...");
        const res = await (txBuilder as any).buildAndExecute(provider).catch(() => (txBuilder as any).buildAndExecute());
        console.log("✅ [createOrcaPoolForMeme] Pool created! Result:", res);
        
        return {
          poolAddress: whirlpoolPda.publicKey,
          tokenMintA,
          tokenMintB,
          transactionSignature: res?.txSig ?? res,
          alreadyExisted: false,
        };
      }
  
      throw new Error("Unable to detect transaction builder shape");
    } catch (error) {
      console.error("❌ [createOrcaPoolForMeme] Error creating pool:", error);
      throw error;
    }
  }
  

 /**
 * Add liquidity (LEGACY SPL path — works with So111... / Tokenkeg)
 */
export async function addLiquidityToOrcaPool(
    whirlpoolAddress: PublicKey,
    inputMint: PublicKey,
    inputAmount: number
  ) {
    console.log("💧 [addLiquidityToOrcaPool] Starting (legacy-SPL) ...");
    const { connection, adminKeypair } = getProgram();
  
    // Build minimal Anchor Wallet
    const wallet: Wallet = {
      publicKey: adminKeypair.publicKey,
      payer: adminKeypair,
      signTransaction: async (tx) => {
        if ("partialSign" in tx && typeof (tx as any).partialSign === "function") {
          (tx as any).partialSign(adminKeypair);
        } else if ("sign" in tx && typeof (tx as any).sign === "function") {
          (tx as any).sign([adminKeypair]);
        }
        return tx as any;
      },
      signAllTransactions: async (txs) => {
        txs.forEach((tx) => {
          if ("partialSign" in tx && typeof (tx as any).partialSign === "function") {
            (tx as any).partialSign(adminKeypair);
          } else if ("sign" in tx && typeof (tx as any).sign === "function") {
            (tx as any).sign([adminKeypair]);
          }
        });
        return txs as any;
      },
    };
  
    // Provider + context
    const provider = new AnchorProvider(connection, wallet as any, AnchorProvider.defaultOptions());
    const ctx = WhirlpoolContext.withProvider(provider, ORCA_WHIRLPOOL_PROGRAM_ID);
    const client = buildWhirlpoolClient(ctx);
  
    // Load whirlpool
    const whirlpool = await client.getPool(whirlpoolAddress);
    const whirlpoolData = await whirlpool.getData();
    console.log("💧 Pool data:", whirlpoolAddress.toBase58());
    console.log("    tokenA:", whirlpoolData.tokenMintA.toBase58());
    console.log("    tokenB:", whirlpoolData.tokenMintB.toBase58());
    console.log("    tickSpacing:", whirlpoolData.tickSpacing);
  
    // Compute full-range ticks aligned to spacing (legacy full-range)
    const lowerTickIndex = TickUtil.getInitializableTickIndex(-443636, whirlpoolData.tickSpacing);
    const upperTickIndex = TickUtil.getInitializableTickIndex(443636, whirlpoolData.tickSpacing);
    console.log("💧 Using ticks:", lowerTickIndex, "→", upperTickIndex);

        // fetch mint info for A and B
    const mintInfoA = await getMint(connection, whirlpoolData.tokenMintA, undefined, TOKEN_PROGRAM_ID);
    const mintInfoB = await getMint(connection, whirlpoolData.tokenMintB, undefined, TOKEN_PROGRAM_ID);

    
    const tokenExtensionCtx = await TokenExtensionUtil.buildTokenExtensionContextForPool(
        ctx.fetcher,   // or the fetcher used by your WhirlpoolContext
        whirlpoolData.tokenMintA,
        whirlpoolData.tokenMintB
      );
// Build quote using the alternative order (older variants)
let quote: any;
quote = increaseLiquidityQuoteByInputToken(
  inputMint,
  new Decimal(inputAmount),
  lowerTickIndex,
  upperTickIndex,
  Percentage.fromFraction(5, 100), // 5% slippage
  whirlpool,
  tokenExtensionCtx
);
  
    console.log("💧 Quote (legacy):", {
      tokenMaxA: quote.tokenMaxA?.toString?.() ?? String(quote.tokenMaxA),
      tokenMaxB: quote.tokenMaxB?.toString?.() ?? String(quote.tokenMaxB),
      liquidity: quote.liquidityAmount?.toString?.() ?? String(quote.liquidityAmount),
    });
  
    // Open position (returns { positionMint, tx } or TransactionBuilder)
    const openPosResult = await whirlpool.openPosition(lowerTickIndex, upperTickIndex, quote);
    const positionMint: PublicKey = (openPosResult as any).positionMint ?? (openPosResult as any).position_mint;
    const txObj = (openPosResult as any).tx ?? openPosResult;
  
    // If Orca returned a TransactionBuilder with buildAndExecute(provider)
    if (txObj && typeof (txObj as any).buildAndExecute === "function") {
      const res = await (txObj as any).buildAndExecute(provider);
      console.log("✅ Liquidity added (buildAndExecute) result:", res);
      return {
        transactionSignature: res?.txSig ?? res,
        positionMint: positionMint.toBase58(),
        poolAddress: whirlpoolAddress.toBase58(),
        lowerTickIndex,
        upperTickIndex,
      };
    }
  
    // If Orca returned an older shape with build()
    if (txObj && typeof (txObj as any).build === "function") {
      const built = await (txObj as any).build();
  
      // Case: wrapper { transaction, signers, recentBlockhash }
      if (built && typeof built === "object" && built.transaction) {
        const tx = built.transaction;
        const signers = built.signers ?? [];
        const allSigners = [adminKeypair, ...signers];
  
        // If wrapper.transaction is VersionedTransaction-like
        if ("sign" in tx && typeof (tx as any).sign === "function") {
          (tx as any).sign(allSigners);
          const sig = await connection.sendTransaction(tx as VersionedTransaction);
          await connection.confirmTransaction(sig, "confirmed");
          console.log("✅ Liquidity added (wrapped VersionedTransaction) sig:", sig);
          return { transactionSignature: sig, positionMint: positionMint.toBase58() };
        }
  
        // If wrapper.transaction is legacy Transaction
        if ("partialSign" in tx && typeof (tx as any).partialSign === "function") {
          if (built.recentBlockhash) tx.recentBlockhash = built.recentBlockhash;
          (tx as Transaction).partialSign(...allSigners);
          const sig = await sendAndConfirmTransaction(connection, tx as Transaction, allSigners);
          console.log("✅ Liquidity added (wrapped Transaction) sig:", sig);
          return { transactionSignature: sig, positionMint: positionMint.toBase58() };
        }
  
        // Unknown wrapper transaction shape — try sending as-is
        try {
          const sig = await sendAndConfirmTransaction(connection, tx as Transaction, allSigners);
          console.log("✅ Liquidity added (wrapped fallback) sig:", sig);
          return { transactionSignature: sig, positionMint: positionMint.toBase58() };
        } catch (err) {
          console.error("Wrapped transaction send failed:", err);
          throw err;
        }
      }
  
      // Case: built is a legacy Transaction
      if ("partialSign" in built && typeof (built as any).partialSign === "function") {
        (built as Transaction).partialSign(adminKeypair);
        const sig = await sendAndConfirmTransaction(connection, built as Transaction, [adminKeypair]);
        console.log("✅ Liquidity added (Transaction) sig:", sig);
        return { transactionSignature: sig, positionMint: positionMint.toBase58() };
      }
  
      // Case: built is VersionedTransaction
      if ("sign" in built && typeof (built as any).sign === "function") {
        (built as VersionedTransaction).sign([adminKeypair]);
        const sig = await connection.sendTransaction(built as VersionedTransaction);
        await connection.confirmTransaction(sig, "confirmed");
        console.log("✅ Liquidity added (VersionedTransaction) sig:", sig);
        return { transactionSignature: sig, positionMint: positionMint.toBase58() };
      }
  
      // Fallback: try to send the built as legacy tx
      try {
        const sig = await sendAndConfirmTransaction(connection, built as Transaction, [adminKeypair]);
        console.log("✅ Liquidity added (fallback) sig:", sig);
        return { transactionSignature: sig, positionMint: positionMint.toBase58() };
      } catch (err) {
        console.error("Failed to send built tx:", err);
        throw err;
      }
    }
  
    // If no tx object returned
    throw new Error("No tx object returned from openPosition (legacy path)");
  }
  
  /**
   * Get pool information
   */
  export async function getPoolInfo(whirlpoolAddress: PublicKey) {
    console.log("📊 [getPoolInfo] Fetching pool info...");
    
    const { connection, adminKeypair } = getProgram();
    const { ctx } = getOrcaContext(connection, adminKeypair);
    const client = buildWhirlpoolClient(ctx);
  
    try {
      const whirlpool = await client.getPool(whirlpoolAddress);
      const data = await whirlpool.getData();
  
      console.log("📊 [getPoolInfo] Pool info retrieved");
      
      return {
        address: whirlpoolAddress.toBase58(),
        tokenMintA: data.tokenMintA.toBase58(),
        tokenMintB: data.tokenMintB.toBase58(),
        tickSpacing: data.tickSpacing,
        liquidity: data.liquidity.toString(),
        sqrtPrice: data.sqrtPrice.toString(),
        tickCurrentIndex: data.tickCurrentIndex,
      };
    } catch (error) {
      console.error("❌ [getPoolInfo] Error fetching pool info:", error);
      throw error;
    }
  }