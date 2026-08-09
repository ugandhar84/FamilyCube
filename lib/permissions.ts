export type PetRole = 'owner' | 'caretaker' | 'caregiver' | 'viewer';

export interface RolePermissions {
  // Mood
  canScan: boolean;
  // Daily care
  canLogDailyCare: boolean;       // feeding, grooming, checklist
  // Health / medical
  canLogHealth: boolean;          // vet visits, vaccines, medications, weight
  // Social
  canPost: boolean;               // create social posts
  canComment: boolean;            // comment on posts
  canLike: boolean;               // like posts
  // Playdate
  canRequestPlaydate: boolean;    // send / respond to playdate requests
  // Family management
  canManageFamily: boolean;       // invite, change role, remove members
  // Pet profile
  canEditPet: boolean;            // edit name/photo/details
  canDeletePet: boolean;
}

const PERMISSIONS: Record<PetRole, RolePermissions> = {
  owner: {
    canScan:             true,
    canLogDailyCare:     true,
    canLogHealth:        true,
    canPost:             true,
    canComment:          true,
    canLike:             true,
    canRequestPlaydate:  true,
    canManageFamily:     true,
    canEditPet:          true,
    canDeletePet:        true,
  },
  caretaker: {
    canScan:             true,
    canLogDailyCare:     true,
    canLogHealth:        true,
    canPost:             true,
    canComment:          true,
    canLike:             true,
    canRequestPlaydate:  true,
    canManageFamily:     false,
    canEditPet:          false,
    canDeletePet:        false,
  },
  caregiver: {
    canScan:             true,
    canLogDailyCare:     true,
    canLogHealth:        false,
    canPost:             false,
    canComment:          true,
    canLike:             true,
    canRequestPlaydate:  false,
    canManageFamily:     false,
    canEditPet:          false,
    canDeletePet:        false,
  },
  viewer: {
    canScan:             false,
    canLogDailyCare:     false,
    canLogHealth:        false,
    canPost:             false,
    canComment:          false,
    canLike:             false,
    canRequestPlaydate:  false,
    canManageFamily:     false,
    canEditPet:          false,
    canDeletePet:        false,
  },
};

export function getPermissions(role: string | undefined): RolePermissions {
  return PERMISSIONS[(role as PetRole) ?? 'viewer'] ?? PERMISSIONS.viewer;
}

/** Returns a friendly "you don't have permission" message for a blocked action */
export function permissionDeniedMsg(action: string): string {
  return `Your role doesn't allow you to ${action}. Ask the pet owner to update your access.`;
}
