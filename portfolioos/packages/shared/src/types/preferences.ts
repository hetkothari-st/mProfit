export interface AssetSectionPref {
  key: string;    // matches NavItem.to path, e.g. "/stocks", "/mutual-funds"
  visible: boolean;
  order: number;  // 0-based
}

export interface UserPreferences {
  assetSections: AssetSectionPref[];
}
