import { Router } from "express";
import {
  initializeProtocolTxController,
  resetProtocolTxController,
  mintMemeTxController,
  createAtaTxController,
} from "../controllers/mintMemeController";
import {
  tokenAccountBalanceController,
  memeTokenDistributionController,
  allMemeTokenBalancesController,
  recentMintDistributionController,
} from "../controllers/mintDetailsController";

const router = Router();

// Unsigned transaction endpoints
router.post("/tx/initialize-protocol", initializeProtocolTxController);
router.post("/tx/reset-protocol", resetProtocolTxController);
router.post("/tx/mint-meme", mintMemeTxController);
router.post("/tx/create-ata", createAtaTxController);

// Mint details endpoints
router.get('/token-balance/:tokenAccountAddress', tokenAccountBalanceController);
router.get('/meme-token-distribution/:memeId', memeTokenDistributionController);
router.post('/meme-token-balances', allMemeTokenBalancesController);
router.get('/meme-token-recent/:memeId', recentMintDistributionController);

export default router;


