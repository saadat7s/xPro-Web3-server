import { Request, Response } from 'express';
import { getAllMemes, getMemeById, storeMeme } from '../services/memeCafe';
import { CreateMemeInput } from '../types/meme';

/**
 * Controller to get all memes
 * GET /meme-cafe
 */
export async function getAllMemesController(req: Request, res: Response) {
  try {
    const result = await getAllMemes();
    
    if (!result.success) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getAllMemesController:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}

/**
 * Controller to get a single meme by ID
 * GET /meme-cafe/:id
 */
export async function getMemeByIdController(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid meme ID. Must be a number',
      });
    }

    const result = await getMemeById(id);

    if (!result.success) {
      // If meme not found, return 404, otherwise 500
      if (result.error === 'Meme not found') {
        return res.status(404).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (error: any) {
    console.error('Error in getMemeByIdController:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}

/**
 * Controller to store a new meme
 * POST /meme-cafe
 */
export async function storeMemeController(req: Request, res: Response) {
  try {
    const { name, walletPublicKey, imageUrl, relatedToken } = req.body as CreateMemeInput;

    if (!name || !walletPublicKey || !imageUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, walletPublicKey, and imageUrl are required',
      });
    }

    const memeInput: CreateMemeInput = {
      name,
      walletPublicKey,
      imageUrl,
      relatedToken: relatedToken || null,
    };

    const result = await storeMeme(memeInput);

    if (!result.success) {
      // If validation error, return 400, otherwise 500
      if (result.error?.includes('Invalid') || result.error?.includes('Missing')) {
        return res.status(400).json(result);
      }
      return res.status(500).json(result);
    }

    return res.status(201).json(result);
  } catch (error: any) {
    console.error('Error in storeMemeController:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}

