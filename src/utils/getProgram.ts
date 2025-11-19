import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

export const getProgram = () => {
  console.log("🔧 [getProgram] Initializing program connection...");

  const idl = require("../idl.json");
  const walletKeypair = require("../admin_xPro_Web3_wallet-keypair.json");

  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(walletKeypair));
  const adminPublicKey = adminKeypair.publicKey;
  console.log("🔧 [getProgram] Admin public key:", adminPublicKey.toBase58());

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  console.log("🔧 [getProgram] Connected to Solana devnet");

  const programId = new PublicKey(
    "3LrvyGuyhsgPWrbQqZcKzSQeMAxCoZgTCmYxmT2FWfAJ"
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


