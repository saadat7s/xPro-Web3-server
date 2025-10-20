import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import mintMemeTxRouter from "./routes/mintMemeRoute";
import poolCreationTxRouter from "./routes/poolCreationRoute";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/meme", mintMemeTxRouter);
app.use("/amm", poolCreationTxRouter);



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
  