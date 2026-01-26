export interface Meme {
  id?: number;
  name: string;
  walletPublicKey: string;
  imageUrl: string;
  relatedToken: string | null;
  createdAt?: string;
  updatedAt?: string;
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

