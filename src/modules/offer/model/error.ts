// ─── Offer domain errors (sentinel pattern from sample) ─

export const ErrOfferNotFound = new Error("Offer not found");

export const ErrOfferNotPending = new Error(
  "Offer is not in PENDING status",
);

export const ErrOfferNotAccepted = new Error(
  "Offer is not in ACCEPTED status",
);

export const ErrNotParticipant = new Error(
  "You are not a participant of this offer",
);

export const ErrNotListingOwner = new Error(
  "You are not the owner of this listing",
);

export const ErrListingNotOpen = new Error(
  "Listing is not in OPEN status",
);

export const ErrCannotOfferOwnListing = new Error(
  "You cannot make an offer on your own listing",
);

