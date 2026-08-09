/**
 * index — public API barrel for the Social feature module.
 *
 * Import everything the rest of the app needs from this single entry point
 * rather than reaching into sub-folders directly.  This keeps internal paths
 * private so they can be reorganised without touching call sites.
 */

export { default as SocialScreen } from './screens/SocialScreen';
export { default as NotificationsScreen } from './screens/NotificationsScreen';
export { default as SocialNotificationsScreen } from './screens/SocialNotificationsScreen';
export { default as AllNotificationsScreen } from './screens/AllNotificationsScreen';

export * from './types';
export * from './utils';

export { EmojiAvatar } from './components/EmojiAvatar';
export { MentionText, MentionDropdown } from './components/MentionComponents';
export { StoriesStrip } from './components/StoriesStrip';
export { CommentsSection } from './components/CommentsSection';
export { AutoplayVideo, MediaViewer, PhotoGrid } from './components/MediaComponents';
export { PostCard, LocalSaveBtn, pc } from './components/PostCard';
export { NearbyPetCard, nc, rt, CAROUSEL_CARD_W, CAROUSEL_PHOTO_H } from './components/NearbyPetCard';
export { EventCard, ev } from './components/EventCard';
export { EditPostSheet, prepareVideoForUpload, showVideoSourceMenu } from './components/EditPostSheet';
