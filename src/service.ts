import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  SYSVAR_RENT_PUBKEY
} from "@solana/web3.js";

import * as anchor from "@coral-xyz/anchor";
import { 
  createMint,
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  TOKEN_PROGRAM_ID,  // Changed from TOKEN_2022_PROGRAM_ID
  createAssociatedTokenAccountInstruction, 
  getAssociatedTokenAddressSync 
} from "@solana/spl-token";

// Helper function to get the program
export const getProgram = () => {
  console.log("🔧 [getProgram] Initializing program connection...");
  
  const idl = require("./idl.json");
  const walletKeypair = require("./admin_xPro_Web3_wallet-keypair.json");

  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(walletKeypair));
  const adminPublicKey = adminKeypair.publicKey;
  console.log("🔧 [getProgram] Admin public key:", adminPublicKey.toBase58());

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  console.log("🔧 [getProgram] Connected to Solana devnet");

  const programId = new PublicKey(
    "BSpvB9QhMCyW4fjQx1AwN5zgkr4a8YftEDngHHPziByA"
  );
  console.log("🔧 [getProgram] Program ID:", programId.toBase58());

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(adminKeypair),
    anchor.AnchorProvider.defaultOptions()
  );
  anchor.setProvider(provider);
  console.log("🔧 [getProgram] Anchor provider initialized");

  return {
    program: new anchor.Program(idl, programId, provider),
    adminPublicKey,
    adminKeypair,
    connection,    
  };
};

export const MEME_TOKEN_STATE_SEED = "meme_token_state";
export const PROTOCOL_STATE_SEED = "protocol_state_v2";
export const FEE_VAULT_SEED = "fee_vault";
export const VAULT_SEED = "vault";

// === Helper: Generate random meme_id ===
function generateMemeId(): Buffer {
  console.log("🎲 [generateMemeId] Generating new meme ID...");
  const memeId = anchor.utils.bytes.utf8.encode(crypto.randomUUID()).slice(0, 32) as Buffer;
  console.log("🎲 [generateMemeId] Generated meme ID:", memeId.toString('hex'));
  return memeId;
}

// === Helper: Derive protocol state PDA ===
function getProtocolStatePda(programId: PublicKey): [PublicKey, number] {
  console.log("📍 [getProtocolStatePda] Deriving protocol state PDA...");
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(PROTOCOL_STATE_SEED)],
    programId
  );
  console.log("📍 [getProtocolStatePda] Protocol state PDA:", pda.toBase58(), "bump:", bump);
  return [pda, bump];
}

// === Helper: Derive fee vault PDA ===
function getFeeVaultPda(programId: PublicKey): [PublicKey, number] {
  console.log("💰 [getFeeVaultPda] Deriving fee vault PDA...");
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(FEE_VAULT_SEED)],
    programId
  );
  console.log("💰 [getFeeVaultPda] Fee vault PDA:", pda.toBase58(), "bump:", bump);
  return [pda, bump];
}

// === Helper: Derive meme token state PDA ===
function getMemeTokenStatePda(memeId: Buffer, programId: PublicKey): [PublicKey, number] {
  console.log("🎭 [getMemeTokenStatePda] Deriving meme token state PDA for meme ID:", memeId.toString('hex'));
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(MEME_TOKEN_STATE_SEED), memeId],
    programId
  );
  console.log("🎭 [getMemeTokenStatePda] Meme token state PDA:", pda.toBase58(), "bump:", bump);
  return [pda, bump];
}

// === Helper: Derive vault PDA for a specific mint ===
export function getVaultPda(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  console.log("🏦 [getVaultPda] Deriving vault PDA for mint:", mint.toBase58());
  const [pda, bump] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED), mint.toBuffer()],
    programId
  );
  console.log("🏦 [getVaultPda] Vault PDA:", pda.toBase58(), "bump:", bump);
  return [pda, bump];
}

// Creates an associated token account for a given mint and owner
export async function createAssociatedTokenAccount(
  mint: PublicKey, 
  owner: PublicKey
): Promise<PublicKey> {
  console.log("🏗️ [createAssociatedTokenAccount] Creating ATA for mint:", mint.toBase58(), "owner:", owner.toBase58());
  
  const { adminKeypair, connection } = getProgram();
  
  const associatedTokenAddress = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID  // Changed from TOKEN_2022_PROGRAM_ID
  );
  console.log("🏗️ [createAssociatedTokenAccount] ATA address:", associatedTokenAddress.toBase58());

  const ix = createAssociatedTokenAccountInstruction(
    adminKeypair.publicKey,      // payer
    associatedTokenAddress,      // associated token account (to create)
    owner,                       // owner
    mint,                        // mint
    TOKEN_PROGRAM_ID,            // Changed from TOKEN_2022_PROGRAM_ID
    ASSOCIATED_TOKEN_PROGRAM_ID  // associated program id
  );

  console.log("🏗️ [createAssociatedTokenAccount] Sending transaction...");
  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [adminKeypair]);
  console.log("✅ [createAssociatedTokenAccount] ATA created successfully. Signature:", signature);
  
  return associatedTokenAddress;
}

// === Check Native SOL Balance ===
export async function getNativeSolBalance(publicKey: PublicKey): Promise<number> {
  console.log("💰 [getNativeSolBalance] Fetching SOL balance for:", publicKey.toBase58());
  
  const { connection } = getProgram();
  
  try {
    const balance = await connection.getBalance(publicKey);
    console.log("💰 [getNativeSolBalance] Balance:", balance, "lamports (", balance / LAMPORTS_PER_SOL, "SOL)");
    return balance; // Returns balance in lamports
  } catch (error) {
    console.error("❌ [getNativeSolBalance] Error fetching SOL balance:", error);
    return 0;
  }
}

// === Initialize Protocol State ===
export async function initializeProtocolState(feeLamports: number) {
  console.log("🚀 [initializeProtocolState] Starting protocol initialization with fee:", feeLamports, "lamports");
  
  const { program, adminKeypair } = getProgram();

  const [protocolState] = getProtocolStatePda(program.programId);
  const [feeVault] = getFeeVaultPda(program.programId);
  
  console.log("🚀 [initializeProtocolState] Protocol state PDA:", protocolState.toBase58());
  console.log("🚀 [initializeProtocolState] Fee vault PDA:", feeVault.toBase58());
  console.log("🚀 [initializeProtocolState] Authority:", adminKeypair.publicKey.toBase58());
  
  try {
    console.log("🚀 [initializeProtocolState] Sending initialize transaction...");
    const tx = await program.methods
      .initializeProtocolState(new anchor.BN(feeLamports))
      .accounts({
        protocolState: protocolState,
        authority: adminKeypair.publicKey,
        feeVault: feeVault,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    console.log(`✅ [initializeProtocolState] Protocol initialized successfully. Transaction: ${tx}`);

    return {
      transactionId: tx,
      adminPublicKey: adminKeypair.publicKey,
      protocolState: protocolState,
      feeVault: feeVault,
      feeLamports: feeLamports,
    };
  } catch (error) {
    console.error("❌ [initializeProtocolState] Error initializing protocol:", error);
    throw error;
  }
}

// === Reset Protocol State ===
export async function resetProtocolState() {
  console.log("🔄 [resetProtocolState] Starting protocol reset...");
  
  const { program, adminKeypair } = getProgram();

  const [protocolState] = getProtocolStatePda(program.programId);
  console.log("🔄 [resetProtocolState] Protocol state PDA:", protocolState.toBase58());
  console.log("🔄 [resetProtocolState] Authority:", adminKeypair.publicKey.toBase58());

  try {
    console.log("🔄 [resetProtocolState] Sending reset transaction...");
    const tx = await program.methods
      .resetProtocolState()
      .accounts({
        protocolState,
        authority: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    console.log(`✅ [resetProtocolState] Protocol reset successfully. Transaction: ${tx}`);

    return {
      transactionId: tx,
      protocolState,
      authority: adminKeypair.publicKey,
    };
  } catch (error) {
    console.error("❌ [resetProtocolState] Error resetting protocol:", error);
    throw error;
  }
}

// === Mint Meme Token 
export async function mintMemeToken(memeId: Buffer) {
  console.log("🎭 [mintMemeToken] Starting meme token minting process...");
  console.log("🎭 [mintMemeToken] Input meme ID:", memeId.toString('hex'));
  
  const finalMemeId = memeId;
  const { program, adminKeypair } = getProgram();

  console.log("🎭 [mintMemeToken] Step 1: Deriving all PDAs...");
  // 1️⃣ Derive all PDAs
  const [mintPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("meme_mint"), finalMemeId],
    program.programId
  );
  console.log("🎭 [mintMemeToken] Mint PDA derived:", mintPDA.toBase58());
  
  const [protocolState] = getProtocolStatePda(program.programId);
  const [memeTokenState] = getMemeTokenStatePda(finalMemeId, program.programId);
  const [vault] = getVaultPda(mintPDA, program.programId);
  const [feeVault] = getFeeVaultPda(program.programId);

  console.log("🎭 [mintMemeToken] Step 2: Calculating ATA addresses...");
  // 2️⃣ Calculate ATA addresses with classic SPL Token
  const minterTokenAccount = getAssociatedTokenAddressSync(
    mintPDA,
    adminKeypair.publicKey,
    false,
    TOKEN_PROGRAM_ID  // Changed from TOKEN_2022_PROGRAM_ID
  );
  
  // Allow off-curve owner for PDA
  const vaultTokenAccount = getAssociatedTokenAddressSync(
    mintPDA,
    vault,
    true, // allowOwnerOffCurve = true for PDAs
    TOKEN_PROGRAM_ID  // Changed from TOKEN_2022_PROGRAM_ID
  );

  console.log("🎭 [mintMemeToken] === Account Summary ===");
  console.log("🎭 [mintMemeToken] Mint PDA:", mintPDA.toBase58());
  console.log("🎭 [mintMemeToken] Vault PDA:", vault.toBase58());
  console.log("🎭 [mintMemeToken] Minter ATA:", minterTokenAccount.toBase58());
  console.log("🎭 [mintMemeToken] Vault ATA:", vaultTokenAccount.toBase58());
  console.log("🎭 [mintMemeToken] Protocol State:", protocolState.toBase58());
  console.log("🎭 [mintMemeToken] Meme Token State:", memeTokenState.toBase58());
  console.log("🎭 [mintMemeToken] Fee Vault:", feeVault.toBase58());

  // 3️⃣ Call Anchor program
  try {
    console.log("🎭 [mintMemeToken] Step 3: Sending mint transaction...");
    const tx = await program.methods
      .mintMemeToken(Array.from(finalMemeId))
      .accounts({
        minter: adminKeypair.publicKey,
        memeTokenState,
        mint: mintPDA,
        vault,
        minterTokenAccount,
        vaultTokenAccount,
        feeVault,
        protocolState,
        tokenProgram: TOKEN_PROGRAM_ID,  // Changed from TOKEN_2022_PROGRAM_ID
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,  // Added for classic token initialization
      })
      .rpc();

    console.log(`✅ [mintMemeToken] Meme token minted successfully! Transaction: ${tx}`);

    const result = {
      transactionId: tx,
      memeId: finalMemeId,
      mint: mintPDA,
      minter: adminKeypair.publicKey,
      memeTokenState,
      vault,
      minterTokenAccount,
      vaultTokenAccount,
    };
    console.log("✅ [mintMemeToken] Returning result:", {
      transactionId: tx,
      memeId: finalMemeId.toString('hex'),
      mint: mintPDA.toBase58(),
      minter: adminKeypair.publicKey.toBase58(),
      memeTokenState: memeTokenState.toBase58(),
      vault: vault.toBase58(),
      minterTokenAccount: minterTokenAccount.toBase58(),
      vaultTokenAccount: vaultTokenAccount.toBase58(),
    });
    
    return result;
  } catch (error: any) {
    console.error("❌ [mintMemeToken] Error minting meme token:", error);
    if (error.logs) {
      console.error("❌ [mintMemeToken] Transaction logs:");
      error.logs.forEach((log: string, index: number) => {
        console.error(`  ${index + 1}: ${log}`);
      });
    }
    if (error.message) console.error("❌ [mintMemeToken] Error message:", error.message);
    throw error;
  }
}

interface ProtocolState {
  authority: PublicKey;
  feeLamports: anchor.BN;
  bump: number;
}

// === Get Protocol State ===
export async function getProtocolState() {
  console.log("📊 [getProtocolState] Fetching protocol state...");
  
  const { program } = getProgram();
  const [protocolState] = getProtocolStatePda(program.programId);
  console.log("📊 [getProtocolState] Protocol state address:", protocolState.toBase58());

  try {
    const account = await program.account.protocolState.fetch(protocolState) as ProtocolState;
    const result = {
      address: protocolState,
      authority: account.authority,
      feeLamports: account.feeLamports.toNumber(),
      bump: account.bump,
    };
    console.log("✅ [getProtocolState] Protocol state fetched:", {
      address: protocolState.toBase58(),
      authority: account.authority.toBase58(),
      feeLamports: account.feeLamports.toNumber(),
      bump: account.bump,
    });
    return result;
  } catch (error) {
    console.error("❌ [getProtocolState] Error fetching protocol state:", error);
    return null;
  }
}

interface MemeTokenState {
  memeId: Buffer;
  mint: PublicKey;
  minter: PublicKey;
  createdAt: anchor.BN;
  isInitialized: number;
  bump: number;
}

// === Get Meme Token State ===
export async function getMemeTokenState(memeId: Buffer) {
  console.log("🎭 [getMemeTokenState] Fetching meme token state for meme ID:", memeId.toString('hex'));
  
  const { program } = getProgram();
  const [memeTokenState] = getMemeTokenStatePda(memeId, program.programId);
  console.log("🎭 [getMemeTokenState] Meme token state address:", memeTokenState.toBase58());

  try {
    const account = await program.account.memeTokenState.fetch(memeTokenState) as MemeTokenState;
    const result = {
      address: memeTokenState,
      memeId: account.memeId,
      mint: account.mint,
      minter: account.minter,
      createdAt: account.createdAt,
      isInitialized: account.isInitialized === 1,
      bump: account.bump,
    };
    console.log("✅ [getMemeTokenState] Meme token state fetched:", {
      address: memeTokenState.toBase58(),
      memeId: account.memeId.toString('hex'),
      mint: account.mint.toBase58(),
      minter: account.minter.toBase58(),
      createdAt: account.createdAt.toString(),
      isInitialized: account.isInitialized === 1,
      bump: account.bump,
    });
    return result;
  } catch (error) {
    console.error("❌ [getMemeTokenState] Error fetching meme token state:", error);
    return null;
  }
}

// === Utility Functions ===

// Check if protocol is initialized
export async function isProtocolInitialized(): Promise<boolean> {
  console.log("❓ [isProtocolInitialized] Checking if protocol is initialized...");
  const state = await getProtocolState();
  const isInitialized = state !== null;
  console.log("❓ [isProtocolInitialized] Protocol initialized:", isInitialized);
  return isInitialized;
}

// Get fee vault balance (native SOL)
export async function getFeeVaultBalance(): Promise<number> {
  console.log("💰 [getFeeVaultBalance] Fetching fee vault balance...");
  
  const { connection } = getProgram();
  const [feeVault] = getFeeVaultPda(getProgram().program.programId);
  console.log("💰 [getFeeVaultBalance] Fee vault address:", feeVault.toBase58());
  
  try {
    const balance = await connection.getBalance(feeVault);
    console.log("💰 [getFeeVaultBalance] Fee vault balance:", balance, "lamports (", balance / LAMPORTS_PER_SOL, "SOL)");
    return balance;
  } catch (error) {
    console.error("❌ [getFeeVaultBalance] Error fetching fee vault balance:", error);
    return 0;
  }
}

// Get fee vault balance in SOL
export async function getFeeVaultBalanceInSol(): Promise<number> {
  console.log("💰 [getFeeVaultBalanceInSol] Getting fee vault balance in SOL...");
  const balanceLamports = await getFeeVaultBalance();
  const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
  console.log("💰 [getFeeVaultBalanceInSol] Fee vault balance:", balanceSOL, "SOL");
  return balanceSOL;
}

// Convert meme ID to string for display
export function memeIdToString(memeId: Buffer | number[]): string {
  console.log("🔄 [memeIdToString] Converting meme ID to string...");
  const buffer = Buffer.isBuffer(memeId) ? memeId : Buffer.from(memeId);
  const result = buffer.toString('utf8').replace(/\0/g, '');
  console.log("🔄 [memeIdToString] Input:", buffer.toString('hex'), "-> Output:", result);
  return result;
}

// Convert string to meme ID buffer
export function stringToMemeId(str: string): Buffer {
  console.log("🔄 [stringToMemeId] Converting string to meme ID buffer...");
  const buffer = Buffer.alloc(32);
  Buffer.from(str, 'utf8').copy(buffer);
  console.log("🔄 [stringToMemeId] Input:", str, "-> Output:", buffer.toString('hex'));
  return buffer;
}

// === SOL Utility Functions ===

// Convert lamports to SOL
export function lamportsToSol(lamports: number): number {
  console.log("💰 [lamportsToSol] Converting", lamports, "lamports to SOL...");
  const sol = lamports / LAMPORTS_PER_SOL;
  console.log("💰 [lamportsToSol] Result:", sol, "SOL");
  return sol;
}

// Convert SOL to lamports
export function solToLamports(sol: number): number {
  console.log("💰 [solToLamports] Converting", sol, "SOL to lamports...");
  const lamports = Math.floor(sol * LAMPORTS_PER_SOL);
  console.log("💰 [solToLamports] Result:", lamports, "lamports");
  return lamports;
}

// Check if account has sufficient SOL for fee
export async function hasEnoughSolForFee(publicKey: PublicKey, feeInLamports: number): Promise<boolean> {
  console.log("❓ [hasEnoughSolForFee] Checking if account has enough SOL for fee...");
  console.log("❓ [hasEnoughSolForFee] Account:", publicKey.toBase58(), "Required fee:", feeInLamports, "lamports");
  
  const balance = await getNativeSolBalance(publicKey);
  const hasEnough = balance >= feeInLamports;
  
  console.log("❓ [hasEnoughSolForFee] Balance:", balance, "lamports, Required:", feeInLamports, "lamports, Has enough:", hasEnough);
  return hasEnough;
}

// Get minter SOL balance
export async function getMinterSolBalance(): Promise<{ lamports: number; sol: number }> {
  console.log("💰 [getMinterSolBalance] Getting minter SOL balance...");
  
  const { adminKeypair } = getProgram();
  console.log("💰 [getMinterSolBalance] Minter address:", adminKeypair.publicKey.toBase58());
  
  const lamports = await getNativeSolBalance(adminKeypair.publicKey);
  const result = {
    lamports,
    sol: lamportsToSol(lamports)
  };
  
  console.log("💰 [getMinterSolBalance] Minter balance:", result.lamports, "lamports (", result.sol, "SOL)");
  return result;
}