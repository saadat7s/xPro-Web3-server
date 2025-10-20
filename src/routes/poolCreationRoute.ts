import { Router } from "express";
import {
  initializeAmmPoolTxController,
  addLiquidityTxController,
  removeLiquidityTxController,
  swapSolForTokensTxController,
  swapTokensForSolTxController,
} from "../controllers/poolCreationController";

const router = Router();

// Unsigned AMM transaction endpoints
router.post("/tx/create-amm-pool", initializeAmmPoolTxController);
router.post("/tx/add-liquidity", addLiquidityTxController);
router.post("/tx/remove-liquidity", removeLiquidityTxController);
router.post("/tx/swap-sol-for-tokens", swapSolForTokensTxController);
router.post("/tx/swap-tokens-for-sol", swapTokensForSolTxController);

export default router;


