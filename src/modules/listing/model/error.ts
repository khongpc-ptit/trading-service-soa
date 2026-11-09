// ─── Listing domain errors (sentinel pattern from sample) ─

export const ErrListingNotFound = new Error('Listing not found');

export const ErrSnapshotIncomplete = new Error(
  'Crop snapshot is incomplete (missing cropType, GPS, or expectedYield)'
);

export const ErrListingAlreadyCommitted = new Error(
  'Another trader has already committed a deposit for this listing'
);

export const ErrInvalidStateTransition = new Error(
  'Invalid listing state transition'
);

export const ErrNotListingOwner = new Error(
  'You are not the owner of this listing'
);

export const ErrFarmingUnavailable = new Error(
  'Farming service is unavailable'
);

export const ErrFarmerMismatch = new Error(
  'The authenticated farmer does not own the requested plot'
);
