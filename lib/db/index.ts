// Single import point for all DB service functions.
// Usage: import { getMedications, deletePost, markChatRead, ... } from '@/lib/db';

export * from './medications';
export * from './appointments';
export * from './vaccines';
export * from './weight';
export * from './daily';
export * from './notifications';
export * from './posts';      // post/comment/event mutations
export * from './follows';
export * from './playdates';
export * from './journal';
export * from './memories';
export { getMessagesPage } from './chat'; // sendChatMessage lives in playdates.ts
export * from './home';
export * from './pets';
export * from './petProfile';
export * from './petFamily';
export * from './vetVisits';
export * from './allergies';
export * from './healthRecords';
export * from './sos';
export * from './admin';
export * from './insurance';
export * from './appSettings';
