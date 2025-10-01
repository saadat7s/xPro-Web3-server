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
  const idl = require("./idl.json");
  const walletKeypair = require("./admin_xPro_Web3_wallet-keypair.json");

  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(walletKeypair));
  const adminPublicKey = adminKeypair.publicKey;

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  const programId = new PublicKey(
    "2hjgw8cWi4Dbb9BLygZhopEzVAFPQndiD6Z9UjJsdUJE"
  );

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(adminKeypair),
    anchor.AnchorProvider.defaultOptions()
  );
  anchor.setProvider(provider);

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
  return anchor.utils.bytes.utf8.encode(crypto.randomUUID()).slice(0, 32) as Buffer;
}

// === Helper: Derive protocol state PDA ===
function getProtocolStatePda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PROTOCOL_STATE_SEED)],
    programId
  );
}

// === Helper: Derive fee vault PDA ===
function getFeeVaultPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(FEE_VAULT_SEED)],
    programId
  );
}

// === Helper: Derive meme token state PDA ===
function getMemeTokenStatePda(memeId: Buffer, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MEME_TOKEN_STATE_SEED), memeId],
    programId
  );
}

// === Helper: Derive vault PDA for a specific mint ===
export function getVaultPda(mint: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED), mint.toBuffer()],
    programId
  );
}

// Creates an associated token account for a given mint and owner
export async function createAssociatedTokenAccount(
  mint: PublicKey, 
  owner: PublicKey
): Promise<PublicKey> {
  const { adminKeypair, connection } = getProgram();
  
  const associatedTokenAddress = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_PROGRAM_ID  // Changed from TOKEN_2022_PROGRAM_ID
  );

  const ix = createAssociatedTokenAccountInstruction(
    adminKeypair.publicKey,      // payer
    associatedTokenAddress,      // associated token account (to create)
    owner,                       // owner
    mint,                        // mint
    TOKEN_PROGRAM_ID,            // Changed from TOKEN_2022_PROGRAM_ID
    ASSOCIATED_TOKEN_PROGRAM_ID  // associated program id
  );

  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(connection, tx, [adminKeypair]);
  return associatedTokenAddress;
}

// === Check Native SOL Balance ===
export async function getNativeSolBalance(publicKey: PublicKey): Promise<number> {
  const { connection } = getProgram();
  
  try {
    const balance = await connection.getBalance(publicKey);
    return balance; // Returns balance in lamports
  } catch (error) {
    console.error("Error fetching SOL balance:", error);
    return 0;
  }
}

// === Initialize Protocol State ===
export async function initializeProtocolState(feeLamports: number) {
  const { program, adminKeypair } = getProgram();

  const [protocolState] = getProtocolStatePda(program.programId);
  const [feeVault] = getFeeVaultPda(program.programId);
  
  try {
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

    console.log(`Protocol initialized. Transaction: ${tx}`);

    return {
      transactionId: tx,
      adminPublicKey: adminKeypair.publicKey,
      protocolState: protocolState,
      feeVault: feeVault,
      feeLamports: feeLamports,
    };
  } catch (error) {
    console.error("Error initializing protocol:", error);
    throw error;
  }
}

// === Reset Protocol State ===
export async function resetProtocolState() {
  const { program, adminKeypair } = getProgram();

  const [protocolState] = getProtocolStatePda(program.programId);

  try {
    const tx = await program.methods
      .resetProtocolState()
      .accounts({
        protocolState,
        authority: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    console.log(`Protocol reset. Transaction: ${tx}`);

    return {
      transactionId: tx,
      protocolState,
      authority: adminKeypair.publicKey,
    };
  } catch (error) {
    console.error("Error resetting protocol:", error);
    throw error;
  }
}

// === Mint Meme Token 
export async function mintMemeToken(memeId: Buffer) {
  const finalMemeId = memeId;
  const { program, adminKeypair } = getProgram();

  // 1️⃣ Derive all PDAs
  const [mintPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("meme_mint"), finalMemeId],
    program.programId
  );
  const [protocolState] = getProtocolStatePda(program.programId);
  const [memeTokenState] = getMemeTokenStatePda(finalMemeId, program.programId);
  const [vault] = getVaultPda(mintPDA, program.programId);
  const [feeVault] = getFeeVaultPda(program.programId);

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

  console.log("Mint PDA:", mintPDA.toBase58());
  console.log("Vault PDA:", vault.toBase58());
  console.log("Minter ATA:", minterTokenAccount.toBase58());
  console.log("Vault ATA:", vaultTokenAccount.toBase58());

  // 3️⃣ Call Anchor program
  try {
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

    console.log(`✅ Meme token minted. Transaction: ${tx}`);

    return {
      transactionId: tx,
      memeId: finalMemeId,
      mint: mintPDA,
      minter: adminKeypair.publicKey,
      memeTokenState,
      vault,
      minterTokenAccount,
      vaultTokenAccount,
    };
  } catch (error: any) {
    console.error("❌ Error minting meme token:", error);
    if (error.logs) console.error("Logs:", error.logs.join("\n"));
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
  const { program } = getProgram();
  const [protocolState] = getProtocolStatePda(program.programId);

  try {
    const account = await program.account.protocolState.fetch(protocolState) as ProtocolState;
    return {
      address: protocolState,
      authority: account.authority,
      feeLamports: account.feeLamports.toNumber(),
      bump: account.bump,
    };
  } catch (error) {
    console.error("Error fetching protocol state:", error);
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
  const { program } = getProgram();
  const [memeTokenState] = getMemeTokenStatePda(memeId, program.programId);

  try {
    const account = await program.account.memeTokenState.fetch(memeTokenState) as MemeTokenState;
    return {
      address: memeTokenState,
      memeId: account.memeId,
      mint: account.mint,
      minter: account.minter,
      createdAt: account.createdAt,
      isInitialized: account.isInitialized === 1,
      bump: account.bump,
    };
  } catch (error) {
    console.error("Error fetching meme token state:", error);
    return null;
  }
}

// === Utility Functions ===

// Check if protocol is initialized
export async function isProtocolInitialized(): Promise<boolean> {
  const state = await getProtocolState();
  return state !== null;
}

// Get fee vault balance (native SOL)
export async function getFeeVaultBalance(): Promise<number> {
  const { connection } = getProgram();
  const [feeVault] = getFeeVaultPda(getProgram().program.programId);
  
  try {
    const balance = await connection.getBalance(feeVault);
    return balance;
  } catch (error) {
    console.error("Error fetching fee vault balance:", error);
    return 0;
  }
}

// Get fee vault balance in SOL
export async function getFeeVaultBalanceInSol(): Promise<number> {
  const balanceLamports = await getFeeVaultBalance();
  return balanceLamports / LAMPORTS_PER_SOL;
}

// Convert meme ID to string for display
export function memeIdToString(memeId: Buffer | number[]): string {
  const buffer = Buffer.isBuffer(memeId) ? memeId : Buffer.from(memeId);
  return buffer.toString('utf8').replace(/\0/g, '');
}

// Convert string to meme ID buffer
export function stringToMemeId(str: string): Buffer {
  const buffer = Buffer.alloc(32);
  Buffer.from(str, 'utf8').copy(buffer);
  return buffer;
}

// === SOL Utility Functions ===

// Convert lamports to SOL
export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

// Convert SOL to lamports
export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

// Check if account has sufficient SOL for fee
export async function hasEnoughSolForFee(publicKey: PublicKey, feeInLamports: number): Promise<boolean> {
  const balance = await getNativeSolBalance(publicKey);
  return balance >= feeInLamports;
}

// Get minter SOL balance
export async function getMinterSolBalance(): Promise<{ lamports: number; sol: number }> {
  const { adminKeypair } = getProgram();
  const lamports = await getNativeSolBalance(adminKeypair.publicKey);
  return {
    lamports,
    sol: lamportsToSol(lamports)
  };
}