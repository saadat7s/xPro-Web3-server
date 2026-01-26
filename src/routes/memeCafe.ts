import { Router } from 'express';
import {
  getAllMemesController,
  getMemeByIdController,
  storeMemeController,
} from '../controllers/memeCafeController';

const router = Router();

// Get all memes
router.get('/', getAllMemesController);

// Get meme by ID
router.get('/:id', getMemeByIdController);

// Store a new meme
router.post('/', storeMemeController);

export default router;

