
import { supabase } from '../database/database';
import { Meme, CreateMemeInput, MemeResponse } from '../types/meme';
import { getMemeEngagementSummary } from './memeEngagement';

/**
 * Get all memes from the database
 * @returns Promise<MemeResponse> - Array of all memes
 */
export async function getAllMemes(): Promise<MemeResponse> {
  try {
    const { data, error } = await supabase
      .from('memes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching memes:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch memes',
      };
    }

    // Map snake_case database columns to camelCase TypeScript interface
    const mappedData = await Promise.all(
      (data || []).map(async (row: any) => {
        const meme: Meme = {
          id: row.id,
          name: row.name,
          walletPublicKey: row.wallet_public_key,
          imageUrl: row.image_url,
          relatedToken: row.related_token,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        // Fetch engagement summary for each meme
        const engagementResult = await getMemeEngagementSummary(row.id);
        if (engagementResult.success && engagementResult.data) {
          meme.engagement = engagementResult.data;
        } else {
          // Default to zero engagement if fetch fails
          meme.engagement = {
            memeId: row.id,
            commentsCount: 0,
            totalReactions: 0,
            reactionsByType: {},
          };
        }

        return meme;
      })
    );

    return {
      success: true,
      data: mappedData,
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

    // Map snake_case database columns to camelCase TypeScript interface
    const mappedData: Meme = {
      id: data.id,
      name: data.name,
      walletPublicKey: data.wallet_public_key,
      imageUrl: data.image_url,
      relatedToken: data.related_token,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    // Fetch engagement summary
    const engagementResult = await getMemeEngagementSummary(data.id);
    if (engagementResult.success && engagementResult.data) {
      mappedData.engagement = engagementResult.data;
    } else {
      // Default to zero engagement if fetch fails
      mappedData.engagement = {
        memeId: data.id,
        commentsCount: 0,
        totalReactions: 0,
        reactionsByType: {},
      };
    }

    return {
      success: true,
      data: mappedData,
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

    // Enforce unique meme name
    {
      const { data: existingByName, error: nameCheckError } = await supabase
        .from('memes')
        .select('id')
        .eq('name', memeInput.name)
        .maybeSingle();

      if (nameCheckError && nameCheckError.code !== 'PGRST116') {
        console.error('Error checking meme name uniqueness:', nameCheckError);
        return {
          success: false,
          error: nameCheckError.message || 'Failed to validate meme name uniqueness',
        };
      }

      if (existingByName) {
        return {
          success: false,
          error: 'Meme name must be unique',
        };
      }
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
          wallet_public_key: memeInput.walletPublicKey,
          image_url: memeInput.imageUrl,
          related_token: memeInput.relatedToken || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error storing meme:', error);

      // If the database has a unique constraint on name, surface a clear message
      if ((error as any).code === '23505') {
        return {
          success: false,
          error: 'Meme name must be unique',
        };
      }

      return {
        success: false,
        error: error.message || 'Failed to store meme',
      };
    }

    // Map snake_case database columns to camelCase TypeScript interface
    const mappedData: Meme = {
      id: data.id,
      name: data.name,
      walletPublicKey: data.wallet_public_key,
      imageUrl: data.image_url,
      relatedToken: data.related_token,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    // New memes start with zero engagement
    mappedData.engagement = {
      memeId: data.id,
      commentsCount: 0,
      totalReactions: 0,
      reactionsByType: {},
    };

    return {
      success: true,
      data: mappedData,
    };
  } catch (error: any) {
    console.error('Unexpected error in storeMeme:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while storing meme',
    };
  }
}

/**
 * Bind a meme to a token by setting the relatedToken field
 * This is called after a successful on-chain mint transaction.
 *
 * @param id - The ID of the meme to bind
 * @param tokenMint - The token mint address to bind to the meme
 * @returns Promise<MemeResponse> - The updated meme
 */
export async function bindMemeToToken(id: number, tokenMint: string): Promise<MemeResponse> {
  try {
    if (!id || Number.isNaN(id)) {
      return {
        success: false,
        error: 'Invalid meme ID. Must be a number',
      };
    }

    if (!tokenMint) {
      return {
        success: false,
        error: 'Missing required field: tokenMint is required',
      };
    }

    // Basic Solana mint (public key) validation
    if (tokenMint.length < 32 || tokenMint.length > 44) {
      return {
        success: false,
        error: 'Invalid tokenMint format',
      };
    }

    // First, fetch the meme to ensure it exists and is not already bound
    const { data: existing, error: fetchError } = await supabase
      .from('memes')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Error fetching meme for bindMemeToToken:', fetchError);
      return {
        success: false,
        error: fetchError.message || 'Failed to fetch meme before binding token',
      };
    }

    if (!existing) {
      return {
        success: false,
        error: 'Meme not found',
      };
    }

    if (existing.related_token) {
      return {
        success: false,
        error: 'Meme is already bound to a token',
      };
    }

    const { data, error } = await supabase
      .from('memes')
      .update({ related_token: tokenMint })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error binding meme to token:', error);
      return {
        success: false,
        error: error.message || 'Failed to bind meme to token',
      };
    }

    const mappedData: Meme = {
      id: data.id,
      name: data.name,
      walletPublicKey: data.wallet_public_key,
      imageUrl: data.image_url,
      relatedToken: data.related_token,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    // Fetch engagement summary
    const engagementResult = await getMemeEngagementSummary(data.id);
    if (engagementResult.success && engagementResult.data) {
      mappedData.engagement = engagementResult.data;
    } else {
      // Default to zero engagement if fetch fails
      mappedData.engagement = {
        memeId: data.id,
        commentsCount: 0,
        totalReactions: 0,
        reactionsByType: {},
      };
    }

    return {
      success: true,
      data: mappedData,
    };
  } catch (error: any) {
    console.error('Unexpected error in bindMemeToToken:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while binding meme to token',
    };
  }
}

