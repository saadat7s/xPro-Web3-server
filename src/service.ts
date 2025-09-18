import { Liquidity, MAINNET_PROGRAM_ID, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import {
    Connection,
    Keypair,
    PublicKey,
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction
  } from "@solana/web3.js";

  import * as anchor from "@project-serum/anchor";
  import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
  

  // Helper function to get the program
  export const getProgram = () => {
    const idl = require("./idl.json");
    const walletKeypair = require("./admin_xPro_Web3_wallet-keypair.json");
  
    const adminKeypair = Keypair.fromSecretKey(new Uint8Array(walletKeypair));
    const adminPublicKey = adminKeypair.publicKey;
  
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
    const programId = new PublicKey(
      "Acz1HE7FeaNhTrtXBYxmhZtMQ974UFqqJEda3PmWQNLV"
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

  export interface MintInitParams {
    name: string;
    symbol: string;
    uri: string;
  }

  const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  export const MEME_TOKEN_STATE_SEED = "meme_token_state";
  
  const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

  // === Helper: Generate random meme_id ===
  function generateMemeId(): Buffer {
    return anchor.utils.bytes.utf8.encode(crypto.randomUUID()).slice(0, 32) as Buffer;
  }

  // === Helper: Derive protocol state PDA ===
  function getProtocolStatePda(programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_state")],
      programId
    );
  }

  // === Helper: Derive meme token state PDA ===
  function getMemeTokenStatePda(memeId: Buffer, programId: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("meme_token_state"), memeId],
      programId
    );
  }

  // Creates an associated token account for a given mint and owner
  export async function createAssociatedTokenAccount(): Promise<PublicKey> {
    const {adminKeypair, adminPublicKey, connection} = getProgram();
    const associatedTokenAddress = getAssociatedTokenAddressSync(
      WSOL_MINT,
      adminPublicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const transaction = new Transaction().add(
      {
        keys: [
          { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true },
          { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
          { pubkey: adminPublicKey, isSigner: false, isWritable: false },
          { pubkey: WSOL_MINT, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.alloc(0),
      }
    );

    await sendAndConfirmTransaction(connection, transaction, [adminKeypair]);
    return associatedTokenAddress;
  }

  async function getFeeVault(): Promise<PublicKey> {
    const {adminPublicKey} = getProgram();
    const feeVaultTokenAccount = getAssociatedTokenAddressSync(
      WSOL_MINT,
      adminPublicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Note: getAssociatedTokenAddressSync always returns a PublicKey
    // You'd need to check if the account exists on-chain separately
    return feeVaultTokenAccount;
  }

  // === Initialize Protocol State ===
  export async function initializeProtocolState(feeLamports: number) {
    const {program, adminKeypair} = getProgram();

    const [protocolState] = getProtocolStatePda(program.programId);
    
    await program.methods
      .initializeProtocolState(new anchor.BN(feeLamports))
      .accounts({
        protocolState: protocolState,
        authority: adminKeypair.publicKey,
        feeVault: await getFeeVault(),
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();

    return {
      adminPublicKey: adminKeypair.publicKey,
      vaultTokenAccount: await getFeeVault(),
      protocolState: protocolState,
    };
  }

  // === Reset Protocol State ===
  export async function resetProtocolState() {
    const { program, adminKeypair } = getProgram();

    const [protocolState] = getProtocolStatePda(program.programId);

    await program.methods
      .resetProtocolState()
      .accounts({
        protocolState,
        authority: adminKeypair.publicKey,
      })
      .signers([adminKeypair])
      .rpc();

    return {
      protocolState,
      authority: adminKeypair.publicKey,
    };
  }

  // === Mint Meme Token ===
  export async function mintMemeTokenService(
    minter: PublicKey,
    name: string,
    symbol: string,
    uri: string
  ) {
    console.log('Minter type:', typeof minter);
    console.log('Minter value:', minter);
    console.log('Is PublicKey?', minter instanceof PublicKey);
    
    const {program, adminKeypair, connection} = getProgram();
    
    // Generate meme_id and derive PDAs
    const memeId = generateMemeId();
    const [memeTokenStatePda] = getMemeTokenStatePda(memeId, program.programId);
    const [protocolState] = getProtocolStatePda(program.programId);
  
    // Create mint keypair
    const mintKeypair = Keypair.generate();
  
    console.log('About to derive minterTokenAccount...');
    
    // This is where the error occurs - let's debug
    const minterTokenAccount = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      minter, // Make sure this is a PublicKey object
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Vault token account for the new mint
    const vaultTokenAccount = getAssociatedTokenAddressSync(
      mintKeypair.publicKey,
      await getFeeVault(), // or protocol authority
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Minter SOL account (wrapped SOL)
    const minterSolAccount = getAssociatedTokenAddressSync(
      WSOL_MINT,
      minter,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    // Protocol fee vault (for collecting SOL fees)
    const protocolFeeVault = await getFeeVault();

    const tx = await program.methods
      .mintMemeToken(
        Array.from(memeId), // Convert Buffer to array
        name,
        symbol,
        uri
      )
      .accounts({
        minter: minter,
        memeTokenState: memeTokenStatePda,
        mint: mintKeypair.publicKey,
        minterTokenAccount,
        vaultTokenAccount,
        minterSolAccount,
        solMint: WSOL_MINT,
        protocolFeeVault,
        protocolState,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .signers([mintKeypair]) // The mint needs to sign
      .rpc();

    return {
      memeId,
      memeTokenState: memeTokenStatePda,
      mint: mintKeypair.publicKey,
      minterTokenAccount,
      transactionSignature: tx,
    };
  }

  // === Get Protocol State ===
  export async function getProtocolState() {
    const {program} = getProgram();
    const [protocolStatePda] = getProtocolStatePda(program.programId);
    
    try {
      const protocolState = await program.account.protocolState.fetch(protocolStatePda);
      return {
        address: protocolStatePda,
        data: protocolState,
      };
    } catch (error) {
      console.error("Protocol state not initialized:", error);
      return null;
    }
  }

  // === Get Meme Token State ===
  export async function getMemeTokenState(memeId: Buffer) {
    const {program} = getProgram();
    const [memeTokenStatePda] = getMemeTokenStatePda(memeId, program.programId);
    
    try {
      const memeTokenState = await program.account.memeTokenState.fetch(memeTokenStatePda);
      return {
        address: memeTokenStatePda,
        data: memeTokenState,
      };
    } catch (error) {
      console.error("Meme token state not found:", error);
      return null;
    }
  }