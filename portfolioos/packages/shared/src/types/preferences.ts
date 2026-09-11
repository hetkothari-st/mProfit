export interface AssetSectionPref {
  key: string;    // matches NavItem.to path, e.g. "/stocks", "/mutual-funds"
  visible: boolean;
  order: number;  // 0-based
}

export interface UserPreferences {
  assetSections: AssetSectionPref[];
}

/**
 * Sidebar asset sections a user adds themselves from "Add asset class";
 * absent (not hidden) until they do. Absent rather than hidden because the
 * dashboard hides whatever the sidebar hides, and holdings in a class the
 * user never added must still show there.
 */
export const OPTIONAL_ASSET_SECTION_KEYS: readonly string[] = [
  '/bonds',
  '/crypto',
  '/forex',
  '/nps',
  '/post-office',
];
