import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { PublicKey } from "@solana/web3.js";
import { initializeProtocolState, resetProtocolState, getProgram, mintMemeTokenService } from "./service";

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
    const { program } = getProgram();
    const [protocolState] = PublicKey.findProgramAddressSync(
      [Buffer.from("protocol_state")],
      program.programId
    );

    const state = await program.account.protocolState.fetch(protocolState);

    return res.status(200).json({
      success: true,
      protocolState: protocolState.toBase58(),
      data: state,
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
    const { minter, name, symbol, uri } = req.body;

    if (!minter || !name || !symbol || !uri) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
      });
    }

    let minterPublicKey;
    try {
      minterPublicKey = new PublicKey(minter);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid minter public key format',
      });
    }

    // Basic length checks
    if (name.length > 32 || symbol.length > 10 || uri.length > 200) {
      return res.status(400).json({
        success: false,
        error: 'One or more fields exceed max length',
      });
    }

    const result = await mintMemeTokenService(minterPublicKey, name, symbol, uri);

    res.json({
      success: true,
      message: 'Meme token minted successfully',
      data: {
        memeId: Buffer.from(result.memeId).toString('hex'),
        memeTokenState: result.memeTokenState.toBase58(),
        mint: result.mint.toBase58(),
        minterTokenAccount: result.minterTokenAccount.toBase58(),
        transactionSignature: result.transactionSignature,
        tokenInfo: { name, symbol, uri }
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
// app.post("/mint-for-meme", async (req: Request, res: Response) => {
//   try {
//     const { memeId, params } = req.body as {
//       memeId: string;
//       params: MintInitParams;
//     };

//     if (!memeId || !params?.name || !params?.symbol || !params?.uri) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing fields: memeId, params{name,symbol,uri} are required",
//       });
//     }

//     const result = await mintForMemeService(memeId, params);
//     return res.status(result.success ? 200 : 500).json(result);
//   } catch (err: any) {
//     console.error("/mint-for-meme error:", err);
//     return res.status(500).json({ success: false, message: err.message || String(err) });
//   }
// });

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
