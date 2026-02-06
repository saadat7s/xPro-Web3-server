import { Request, Response } from 'express';
import {
  addMemeComment,
  getMemeComments,
  addOrToggleMemeReaction,
  getMemeEngagementSummary,
} from '../services/memeEngagement';

export async function addMemeCommentController(req: Request, res: Response) {
  try {
    const memeId = parseInt(req.params.id, 10);
    const { content, authorWalletPublicKey } = req.body as {
      content: string;
      authorWalletPublicKey?: string;
    };

    if (Number.isNaN(memeId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid meme ID. Must be a number',
      });
    }

    const result = await addMemeComment(memeId, content, authorWalletPublicKey);

    if (!result.success) {
      if (result.error === 'Meme not found') {
        return res.status(404).json(result);
      }

      if (
        result.error === 'Comment content is required' ||
        result.error?.includes('Invalid')
      ) {
        return res.status(400).json(result);
      }

      return res.status(500).json(result);
    }

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Error in addMemeCommentController:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}

export async function getMemeCommentsController(req: Request, res: Response) {
  try {
    const memeId = parseInt(req.params.id, 10);

    if (Number.isNaN(memeId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid meme ID. Must be a number',
      });
    }

    const result = await getMemeComments(memeId);

    if (!result.success) {
      if (result.error === 'Meme not found') {
        return res.status(404).json(result);
      }

      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getMemeCommentsController:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}

export async function addOrToggleMemeReactionController(req: Request, res: Response) {
  try {
    const memeId = parseInt(req.params.id, 10);
    const { reactionType, userWalletPublicKey } = req.body as {
      reactionType: string;
      userWalletPublicKey?: string;
    };

    if (Number.isNaN(memeId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid meme ID. Must be a number',
      });
    }

    const result = await addOrToggleMemeReaction(
      memeId,
      reactionType,
      userWalletPublicKey
    );

    if (!result.success) {
      if (result.error === 'Meme not found') {
        return res.status(404).json(result);
      }

      if (
        result.error === 'reactionType is required' ||
        result.error?.includes('Invalid')
      ) {
        return res.status(400).json(result);
      }

      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in addOrToggleMemeReactionController:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}

export async function getMemeEngagementSummaryController(req: Request, res: Response) {
  try {
    const memeId = parseInt(req.params.id, 10);

    if (Number.isNaN(memeId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid meme ID. Must be a number',
      });
    }

    const result = await getMemeEngagementSummary(memeId);

    if (!result.success) {
      if (result.error === 'Meme not found') {
        return res.status(404).json(result);
      }

      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getMemeEngagementSummaryController:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}


