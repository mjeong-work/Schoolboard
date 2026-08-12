// Single source of truth for marketplace listing categories — shared between
// the "Create Listing" form (CreateMarketplaceDialog) and the marketplace
// category filter (MarketplacePage) so they can never drift out of sync.
export const MARKETPLACE_CATEGORIES = [
  'Textbooks',
  'Electronics',
  'Furniture',
  'Appliances',
  'Sports & Outdoors',
  'School Supplies',
  'Musical Instruments',
  'Clothing',
  'Other',
] as const;

export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number];
