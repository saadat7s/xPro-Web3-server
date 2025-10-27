import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { getProgram } from "../utils/getProgram";
import {
  getAmmPoolPda,
  getLpMintPda,
  getSolVaultPda,
  getTokenVaultPda,
} from "../ammService";

// === Initialize AMM Pool (unsigned) ===
export async function createInitializeAmmPoolTransaction(
  initializerPublicKey: PublicKey,
  tokenMintAddress: string,
  initialSolAmount: number,
  initialTokenAmount: number | string,
) {
  const { program, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);

  const initialSolLamports = Math.floor(initialSolAmount * LAMPORTS_PER_SOL);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [lpMintPda] = getLpMintPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), tokenMint.toBuffer()],
    program.programId,
  );

  const vaultTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    vaultPda,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  const initializerLpAccount = getAssociatedTokenAddressSync(
    lpMintPda,
    initializerPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .initializeAmmPool(
        new anchor.BN(initialSolLamports),
        new anchor.BN(initialTokenAmount.toString()),
      )
      .accounts({
        initializer: initializerPublicKey,
        tokenMint,
        pool: poolPda,
        lpMint: lpMintPda,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        vault: vaultPda,
        vaultTokenAccount: vaultTokenAccount,
        initializerLpAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    transaction.feePayer = initializerPublicKey;
    transaction.recentBlockhash = blockhash;

    return {
      success: true,
      message: "Initialize AMM pool transaction created successfully!",
      transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
      accounts: {
        pool: poolPda.toString(),
        lpMint: lpMintPda.toString(),
        solVault: solVaultPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        vault: vaultPda.toString(),
        vaultTokenAccount: vaultTokenAccount.toString(),
        initializerLpAccount: initializerLpAccount.toString(),
        tokenMint: tokenMint.toString(),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating initialize AMM pool transaction: ${error.message || error}`,
    };
  }
}

// === Add Liquidity (unsigned) ===
export async function createAddLiquidityTransaction(
  userPublicKey: PublicKey,
  tokenMintAddress: string,
  solAmount: number,
  maxTokenAmount: number | string,
  minLpAmount: number | string = 0,
) {
  const { program, connection } = getProgram();
  const tokenMint = new PublicKey(tokenMintAddress);
  const solLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
  const [lpMintPda] = getLpMintPda(tokenMint, program.programId);
  const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
  const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

  const userTokenAccount = getAssociatedTokenAddressSync(
    tokenMint,
    userPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  const userLpAccount = getAssociatedTokenAddressSync(
    lpMintPda,
    userPublicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  try {
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    const transaction = await program.methods
      .addLiquidityToPool(
        new anchor.BN(solLamports),
        new anchor.BN(maxTokenAmount.toString()),
        new anchor.BN(minLpAmount.toString()),
      )
      .accounts({
        user: userPublicKey,
        pool: poolPda,
        tokenMint,
        lpMint: lpMintPda,
        solVault: solVaultPda,
        tokenVault: tokenVaultPda,
        userTokenAccount,
        userLpAccount,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();

    transaction.feePayer = userPublicKey;
    transaction.recentBlockhash = blockhash;

    return {
      success: true,
      message: "Add liquidity transaction created successfully!",
      transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
      accounts: {
        pool: poolPda.toString(),
        tokenMint: tokenMint.toString(),
        lpMint: lpMintPda.toString(),
        solVault: solVaultPda.toString(),
        tokenVault: tokenVaultPda.toString(),
        userTokenAccount: userTokenAccount.toString(),
        userLpAccount: userLpAccount.toString(),
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error creating add liquidity transaction: ${error.message || error}`,
    };
  }
}

// // === Remove Liquidity (unsigned) ===
// export async function createRemoveLiquidityTransaction(
//   userPublicKey: PublicKey,
//   tokenMintAddress: string,
//   lpAmount: number | string,
//   minSolAmount: number = 0,
//   minTokenAmount: number | string = 0,
// ) {
//   const { program, connection } = getProgram();
//   const tokenMint = new PublicKey(tokenMintAddress);

//   const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
//   const [lpMintPda] = getLpMintPda(tokenMint, program.programId);
//   const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
//   const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

//   const userTokenAccount = getAssociatedTokenAddressSync(
//     tokenMint,
//     userPublicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID,
//   );

//   const userLpAccount = getAssociatedTokenAddressSync(
//     lpMintPda,
//     userPublicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID,
//   );

//   try {
//     const { blockhash } = await connection.getLatestBlockhash("finalized");

//     const transaction = await program.methods
//       .removeLiquidityFromPool(
//         new anchor.BN(lpAmount.toString()),
//         new anchor.BN(minSolAmount),
//         new anchor.BN(minTokenAmount.toString()),
//       )
//       .accounts({
//         user: userPublicKey,
//         pool: poolPda,
//         tokenMint,
//         lpMint: lpMintPda,
//         solVault: solVaultPda,
//         tokenVault: tokenVaultPda,
//         userTokenAccount,
//         userLpAccount,
//         tokenProgram: TOKEN_2022_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .transaction();

//     transaction.feePayer = userPublicKey;
//     transaction.recentBlockhash = blockhash;

//     return {
//       success: true,
//       message: "Remove liquidity transaction created successfully!",
//       transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
//       accounts: {
//         pool: poolPda.toString(),
//         tokenMint: tokenMint.toString(),
//         lpMint: lpMintPda.toString(),
//         solVault: solVaultPda.toString(),
//         tokenVault: tokenVaultPda.toString(),
//         userTokenAccount: userTokenAccount.toString(),
//         userLpAccount: userLpAccount.toString(),
//       },
//     };
//   } catch (error: any) {
//     return {
//       success: false,
//       message: `Error creating remove liquidity transaction: ${error.message || error}`,
//     };
//   }
// }

// // === Swap SOL for Tokens (unsigned) ===
// export async function createSwapSolForTokensTransaction(
//   userPublicKey: PublicKey,
//   tokenMintAddress: string,
//   solAmount: number,
//   minTokenAmount: number | string,
// ) {
//   const { program, connection } = getProgram();
//   const tokenMint = new PublicKey(tokenMintAddress);
//   const solLamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

//   const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
//   const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
//   const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

//   const userTokenAccount = getAssociatedTokenAddressSync(
//     tokenMint,
//     userPublicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID,
//   );

//   try {
//     const { blockhash } = await connection.getLatestBlockhash("finalized");

//     const transaction = await program.methods
//       .swapSolToTokens(
//         new anchor.BN(solLamports),
//         new anchor.BN(minTokenAmount.toString()),
//       )
//       .accounts({
//         user: userPublicKey,
//         pool: poolPda,
//         tokenMint,
//         solVault: solVaultPda,
//         tokenVault: tokenVaultPda,
//         userTokenAccount,
//         tokenProgram: TOKEN_2022_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .transaction();

//     transaction.feePayer = userPublicKey;
//     transaction.recentBlockhash = blockhash;

//     return {
//       success: true,
//       message: "Swap SOL for tokens transaction created successfully!",
//       transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
//       accounts: {
//         pool: poolPda.toString(),
//         tokenMint: tokenMint.toString(),
//         solVault: solVaultPda.toString(),
//         tokenVault: tokenVaultPda.toString(),
//         userTokenAccount: userTokenAccount.toString(),
//       },
//     };
//   } catch (error: any) {
//     return {
//       success: false,
//       message: `Error creating swap SOL for tokens transaction: ${error.message || error}`,
//     };
//   }
// }

// // === Swap Tokens for SOL (unsigned) ===
// export async function createSwapTokensForSolTransaction(
//   userPublicKey: PublicKey,
//   tokenMintAddress: string,
//   tokenAmount: number | string,
//   minSolAmount: number,
// ) {
//   const { program, connection } = getProgram();
//   const tokenMint = new PublicKey(tokenMintAddress);

//   const [poolPda] = getAmmPoolPda(tokenMint, program.programId);
//   const [solVaultPda] = getSolVaultPda(tokenMint, program.programId);
//   const [tokenVaultPda] = getTokenVaultPda(tokenMint, program.programId);

//   const userTokenAccount = getAssociatedTokenAddressSync(
//     tokenMint,
//     userPublicKey,
//     false,
//     TOKEN_2022_PROGRAM_ID,
//   );

//   try {
//     const { blockhash } = await connection.getLatestBlockhash("finalized");

//     const transaction = await program.methods
//       .swapTokensToSol(
//         new anchor.BN(tokenAmount.toString()),
//         new anchor.BN(minSolAmount),
//       )
//       .accounts({
//         user: userPublicKey,
//         pool: poolPda,
//         tokenMint,
//         solVault: solVaultPda,
//         tokenVault: tokenVaultPda,
//         userTokenAccount,
//         tokenProgram: TOKEN_2022_PROGRAM_ID,
//         systemProgram: SystemProgram.programId,
//       })
//       .transaction();

//     transaction.feePayer = userPublicKey;
//     transaction.recentBlockhash = blockhash;

//     return {
//       success: true,
//       message: "Swap tokens for SOL transaction created successfully!",
//       transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"),
//       accounts: {
//         pool: poolPda.toString(),
//         tokenMint: tokenMint.toString(),
//         solVault: solVaultPda.toString(),
//         tokenVault: tokenVaultPda.toString(),
//         userTokenAccount: userTokenAccount.toString(),
//       },
//     };
//   } catch (error: any) {
//     return {
//       success: false,
//       message: `Error creating swap tokens for SOL transaction: ${error.message || error}`,
//     };
//   }
// }


