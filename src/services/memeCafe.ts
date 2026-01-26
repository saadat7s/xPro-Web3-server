
import { supabase } from '../database/database';
import { Meme, CreateMemeInput, MemeResponse } from '../types/meme';

/**
 * Get all memes from the database
 * @returns Promise<MemeResponse> - Array of all memes
 */
export async function getAllMemes(): Promise<MemeResponse> {
  try {
    const { data, error } = await supabase
      .from('memes')
      .select('*')
      .order('createdAt', { ascending: false });

    if (error) {
      console.error('Error fetching memes:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch memes',
      };
    }

    return {
      success: true,
      data: data as Meme[],
    };
  } catch (error: any) {
    console.error('Unexpected error in getAllMemes:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while fetching memes',
    };
  }
}

/**
 * Get a single meme by ID
 * @param id - The ID of the meme to fetch
 * @returns Promise<MemeResponse> - The meme details
 */
export async function getMemeById(id: number): Promise<MemeResponse> {
  try {
    const { data, error } = await supabase
      .from('memes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching meme:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch meme',
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'Meme not found',
      };
    }

    return {
      success: true,
      data: data as Meme,
    };
  } catch (error: any) {
    console.error('Unexpected error in getMemeById:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while fetching meme',
    };
  }
}

/**
 * Store a new meme in the database
 * @param memeInput - The meme data to store
 * @returns Promise<MemeResponse> - The created meme
 */
export async function storeMeme(memeInput: CreateMemeInput): Promise<MemeResponse> {
  try {
    // Validate required fields
    if (!memeInput.name || !memeInput.walletPublicKey || !memeInput.imageUrl) {
      return {
        success: false,
        error: 'Missing required fields: name, walletPublicKey, and imageUrl are required',
      };
    }

    // Validate walletPublicKey format (basic Solana public key validation)
    if (memeInput.walletPublicKey.length < 32 || memeInput.walletPublicKey.length > 44) {
      return {
        success: false,
        error: 'Invalid walletPublicKey format',
      };
    }

    // Validate imageUrl format (basic URL validation)
    try {
      new URL(memeInput.imageUrl);
    } catch {
      return {
        success: false,
        error: 'Invalid imageUrl format. Must be a valid URL',
      };
    }

    const { data, error } = await supabase
      .from('memes')
      .insert([
        {
          name: memeInput.name,
          walletPublicKey: memeInput.walletPublicKey,
          imageUrl: memeInput.imageUrl,
          relatedToken: memeInput.relatedToken || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error storing meme:', error);
      return {
        success: false,
        error: error.message || 'Failed to store meme',
      };
    }

    return {
      success: true,
      data: data as Meme,
    };
  } catch (error: any) {
    console.error('Unexpected error in storeMeme:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while storing meme',
    };
  }
}

