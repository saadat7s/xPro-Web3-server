import { Router } from "express";
import {
  initializeProtocolTxController,
  mintMemeTxController,
  createAtaTxController,
} from "../controllers/mintMemeController";
import {
  tokenAccountBalanceController,
  memeTokenDistributionController,
  allMemeTokenBalancesController,
  recentMintDistributionController,
  getAllMintedTokensController,
  getUserMintedTokensController,
} from "../controllers/mintDetailsController";

const router = Router();

// Unsigned transaction endpoints
router.post("/tx/initialize-protocol", initializeProtocolTxController);
router.post("/tx/mint-meme", mintMemeTxController);
router.post("/tx/create-ata", createAtaTxController);

// Mint details endpoints
router.get('/token-balance/:tokenAccountAddress', tokenAccountBalanceController);
router.get('/meme-token-distribution/:memeId', memeTokenDistributionController);
router.post('/meme-token-balances', allMemeTokenBalancesController);
router.get('/meme-token-recent/:memeId', recentMintDistributionController);
router.get('/all-minted-tokens', getAllMintedTokensController);
router.get('/user-minted-tokens/:userPublicKey', getUserMintedTokensController);

export default router;


