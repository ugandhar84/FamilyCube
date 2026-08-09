export type StatusFilter = 'all' | 'pending' | 'accepted' | 'declined' | 'scheduling' | 'past' | 'history';

export interface PlaydateEntry {
  myRating?: number | null;      // overall_rating the current pet already gave (null = not rated yet)
  myPetId?: string | null;       // which of the user's pets is in this request (from_pet_id or to_pet_id)
  id: string;
  type: 'request';
  direction: 'outgoing' | 'incoming';
  status: string;
  displayStatus: StatusFilter;
  created_at: string;
  updated_at?: string | null;
  from_owner_id?: string | null;
  responder_user_id?: string | null;
  pet: {
    id: string; name: string; emoji: string;
    accent_color: string | null; avatar_url: string | null;
    breed: string | null; birthday: string | null;
  };
  agreed_date?: string | null;
  agreed_time?: string | null;
  agreed_location?: string | null;
  proposed_date?: string | null;
  proposed_time?: string | null;
  proposed_end_time?: string | null;
  proposed_location?: string | null;
  message?: string | null;
  parentName?: string | null;
  parentAvatarUrl?: string | null;
}

export interface EmojiPet {
  name: string;
  emoji: string;
  accent_color?: string | null;
  avatar_url?: string | null;
}
