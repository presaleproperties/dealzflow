/** Metro Vancouver + Fraser Valley cities — canonical list for city_pref and city fields */
export const FRASER_VALLEY_CITIES = [
  // Metro Vancouver core
  'Vancouver', 'Burnaby', 'Richmond', 'New Westminster', 'North Vancouver', 'West Vancouver',
  // Tri-Cities
  'Coquitlam', 'Port Coquitlam', 'Port Moody', 'Anmore', 'Belcarra',
  // South of Fraser
  'Surrey', 'White Rock', 'Delta', 'Tsawwassen', 'Ladner',
  // Ridge Meadows
  'Maple Ridge', 'Pitt Meadows',
  // Fraser Valley
  'Langley', 'Langley Township', 'Abbotsford', 'Mission', 'Chilliwack', 'Hope', 'Agassiz', 'Harrison Hot Springs',
  // North Shore + Sea-to-Sky / outer
  'Bowen Island', 'Lions Bay', 'Squamish',
] as const;

/** Supported languages */
export const CRM_LANGUAGES = ['English', 'Punjabi', 'Hindi', 'Urdu', 'Mandarin', 'Cantonese', 'Tagalog', 'Spanish', 'French', 'Farsi', 'Arabic', 'Korean', 'Vietnamese', 'Other'] as const;
