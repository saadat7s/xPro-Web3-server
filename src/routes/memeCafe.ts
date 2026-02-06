import { Router } from 'express';
import {
  getAllMemesController,
  getMemeByIdController,
  storeMemeController,
  bindMemeToTokenController,
} from '../controllers/memeCafeController';
import {
  addMemeCommentController,
  getMemeCommentsController,
  addOrToggleMemeReactionController,
  getMemeEngagementSummaryController,
} from '../controllers/memeEngagementController';

const router = Router();

// Get all memes
router.get('/', getAllMemesController);

// Get meme by ID
router.get('/:id', getMemeByIdController);

// Store a new meme
router.post('/', storeMemeController);

// Bind a meme to a token (set relatedToken after mint)
router.post('/:id/bind-token', bindMemeToTokenController);

// Meme engagement: comments
router.get('/:id/comments', getMemeCommentsController);
router.post('/:id/comments', addMemeCommentController);

// Meme engagement: reactions and summary
router.post('/:id/reactions', addOrToggleMemeReactionController);
router.get('/:id/engagement', getMemeEngagementSummaryController);

export default router;

