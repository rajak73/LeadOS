// Instagram integration constants shared by API and Worker.

// Messaging window duration. Meta's default for the standard messaging window is 24 hours
// from the last inbound message. Update if the Meta API spike confirms a different value.
export const INSTAGRAM_MESSAGING_WINDOW_HOURS = 24;
export const INSTAGRAM_MESSAGING_WINDOW_MS = INSTAGRAM_MESSAGING_WINDOW_HOURS * 60 * 60 * 1000;
