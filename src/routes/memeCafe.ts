import { Router } from 'express';
import {
  getAllMemesController,
  getMemeByIdController,
  storeMemeController,
  bindMemeToTokenController,
} from '../controllers/memeCafeController';

const router = Router();

// Get all memes
router.get('/', getAllMemesController);

// Get meme by ID
router.get('/:id', getMemeByIdController);

// Store a new meme
router.post('/', storeMemeController);

// Bind a meme to a token (set relatedToken after mint)
router.post('/:id/bind-token', bindMemeToTokenController);

export default router;

