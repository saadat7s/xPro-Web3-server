import { supabase } from '../database/database';
import {
  MemeComment,
  MemeReaction,
  MemeEngagementSummary,
  MemeCommentResponse,
  MemeReactionResponse,
  MemeEngagementSummaryResponse,
} from '../types/meme';

async function memeExists(memeId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('memes')
    .select('id')
    .eq('id', memeId)
    .maybeSingle();

  if (error) {
    console.error('Error checking meme existence:', error);
    return false;
  }

  return !!data;
}

export async function addMemeComment(
  memeId: number,
  content: string,
  authorWalletPublicKey?: string
): Promise<MemeCommentResponse> {
  try {
    if (!memeId || Number.isNaN(memeId)) {
      return {
        success: false,
        error: 'Invalid meme ID. Must be a number',
      };
    }

    if (!content || !content.trim()) {
      return {
        success: false,
        error: 'Comment content is required',
      };
    }

    const exists = await memeExists(memeId);
    if (!exists) {
      return {
        success: false,
        error: 'Meme not found',
      };
    }

    const { data, error } = await supabase
      .from('meme_comments')
      .insert([
        {
          meme_id: memeId,
          content: content.trim(),
          author_wallet_public_key: authorWalletPublicKey || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error adding meme comment:', error);
      return {
        success: false,
        error: error.message || 'Failed to add comment',
      };
    }

    const mapped: MemeComment = {
      id: data.id,
      memeId: data.meme_id,
      content: data.content,
      authorWalletPublicKey: data.author_wallet_public_key,
      createdAt: data.created_at,
    };

    return {
      success: true,
      data: mapped,
    };
  } catch (error: any) {
    console.error('Unexpected error in addMemeComment:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while adding comment',
    };
  }
}

export async function getMemeComments(memeId: number): Promise<MemeCommentResponse> {
  try {
    if (!memeId || Number.isNaN(memeId)) {
      return {
        success: false,
        error: 'Invalid meme ID. Must be a number',
      };
    }

    const { data, error } = await supabase
      .from('meme_comments')
      .select('*')
      .eq('meme_id', memeId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching meme comments:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch comments',
      };
    }

    const mapped: MemeComment[] = (data || []).map((row: any) => ({
      id: row.id,
      memeId: row.meme_id,
      content: row.content,
      authorWalletPublicKey: row.author_wallet_public_key,
      createdAt: row.created_at,
    }));

    return {
      success: true,
      data: mapped,
    };
  } catch (error: any) {
    console.error('Unexpected error in getMemeComments:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while fetching comments',
    };
  }
}

export async function addOrToggleMemeReaction(
  memeId: number,
  reactionType: string,
  userWalletPublicKey?: string
): Promise<MemeReactionResponse> {
  try {
    if (!memeId || Number.isNaN(memeId)) {
      return {
        success: false,
        error: 'Invalid meme ID. Must be a number',
      };
    }

    if (!reactionType || !reactionType.trim()) {
      return {
        success: false,
        error: 'reactionType is required',
      };
    }

    const exists = await memeExists(memeId);
    if (!exists) {
      return {
        success: false,
        error: 'Meme not found',
      };
    }

    const normalizedReactionType = reactionType.trim();

    // If userWalletPublicKey is provided, implement Discord-like toggle behavior:
    // - If the same reaction by this user exists, remove it
    // - Otherwise, add it
    if (userWalletPublicKey) {
      const { data: existing, error: existingError } = await supabase
        .from('meme_reactions')
        .select('*')
        .eq('meme_id', memeId)
        .eq('reaction_type', normalizedReactionType)
        .eq('user_wallet_public_key', userWalletPublicKey)
        .maybeSingle();

      if (existingError && existingError.code !== 'PGRST116') {
        console.error('Error checking existing reaction:', existingError);
        return {
          success: false,
          error: existingError.message || 'Failed to update reaction',
        };
      }

      if (existing) {
        const { error: deleteError } = await supabase
          .from('meme_reactions')
          .delete()
          .eq('id', existing.id);

        if (deleteError) {
          console.error('Error removing meme reaction:', deleteError);
          return {
            success: false,
            error: deleteError.message || 'Failed to remove reaction',
          };
        }
      } else {
        const { error: insertError } = await supabase.from('meme_reactions').insert([
          {
            meme_id: memeId,
            reaction_type: normalizedReactionType,
            user_wallet_public_key: userWalletPublicKey,
          },
        ]);

        if (insertError) {
          console.error('Error adding meme reaction:', insertError);
          return {
            success: false,
            error: insertError.message || 'Failed to add reaction',
          };
        }
      }
    } else {
      // Anonymous reaction: just add a new row
      const { error } = await supabase.from('meme_reactions').insert([
        {
          meme_id: memeId,
          reaction_type: normalizedReactionType,
          user_wallet_public_key: null,
        },
      ]);

      if (error) {
        console.error('Error adding anonymous meme reaction:', error);
        return {
          success: false,
          error: error.message || 'Failed to add reaction',
        };
      }
    }

    // Return updated engagement summary
    const summary = await getMemeEngagementSummary(memeId);
    if (!summary.success || !summary.data) {
      return {
        success: false,
        error: summary.error || 'Failed to fetch updated engagement summary',
      };
    }

    return {
      success: true,
      data: summary.data,
    };
  } catch (error: any) {
    console.error('Unexpected error in addOrToggleMemeReaction:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while updating reaction',
    };
  }
}

export async function getMemeEngagementSummary(
  memeId: number
): Promise<MemeEngagementSummaryResponse> {
  try {
    if (!memeId || Number.isNaN(memeId)) {
      return {
        success: false,
        error: 'Invalid meme ID. Must be a number',
      };
    }

    const [
      { count: commentsCount, error: commentError },
      { data: reactionAggData, error: reactionError },
    ] = await Promise.all([
      supabase
        .from('meme_comments')
        .select('*', { count: 'exact', head: true })
        .eq('meme_id', memeId),
      supabase
        .from('meme_reactions')
        .select('reaction_type', { count: 'exact', head: false })
        .eq('meme_id', memeId),
    ]);

    if (commentError) {
      console.error('Error counting meme comments:', commentError);
      return {
        success: false,
        error: commentError.message || 'Failed to fetch comments summary',
      };
    }

    if (reactionError) {
      console.error('Error fetching meme reactions:', reactionError);
      return {
        success: false,
        error: reactionError.message || 'Failed to fetch reactions summary',
      };
    }

    const commentsCountFinal = commentsCount ?? 0;

    const reactionsByType: Record<string, number> = {};
    let totalReactions = 0;
    (reactionAggData || []).forEach((row: any) => {
      const type = row.reaction_type;
      reactionsByType[type] = (reactionsByType[type] || 0) + 1;
      totalReactions += 1;
    });

    const summary: MemeEngagementSummary = {
      memeId,
      commentsCount: commentsCountFinal,
      totalReactions,
      reactionsByType,
    };

    return {
      success: true,
      data: summary,
    };
  } catch (error: any) {
    console.error('Unexpected error in getMemeEngagementSummary:', error);
    return {
      success: false,
      error: error?.message || 'An unexpected error occurred while fetching engagement summary',
    };
  }
}


