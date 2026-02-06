export interface Meme {
  id?: number;
  name: string;
  walletPublicKey: string;
  imageUrl: string;
  relatedToken: string | null;
  createdAt?: string;
  updatedAt?: string;
  engagement?: MemeEngagementSummary;
}

export interface MemeComment {
  id?: number;
  memeId: number;
  authorWalletPublicKey?: string | null;
  content: string;
  createdAt?: string;
}

export interface MemeReaction {
  id?: number;
  memeId: number;
  userWalletPublicKey?: string | null;
  reactionType: string;
  createdAt?: string;
}

export interface MemeEngagementSummary {
  memeId: number;
  commentsCount: number;
  totalReactions: number;
  reactionsByType: Record<string, number>;
}

export interface CreateMemeInput {
  name: string;
  walletPublicKey: string;
  imageUrl: string;
  relatedToken?: string | null;
}

export interface MemeResponse {
  success: boolean;
  data?: Meme | Meme[];
  message?: string;
  error?: string;
}

export interface MemeCommentResponse {
  success: boolean;
  data?: MemeComment | MemeComment[];
  message?: string;
  error?: string;
}

export interface MemeReactionResponse {
  success: boolean;
  data?: MemeReaction | MemeEngagementSummary;
  message?: string;
  error?: string;
}

export interface MemeEngagementSummaryResponse {
  success: boolean;
  data?: MemeEngagementSummary;
  message?: string;
  error?: string;
}

