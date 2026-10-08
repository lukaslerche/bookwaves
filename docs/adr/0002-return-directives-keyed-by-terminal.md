# Return directives are keyed by the terminal, not by the media item

Return directives tell a user which return cart to place a media item on. It is tempting to derive that from the media item — PR #13 originally looked directives up under `` `${item.library_code}:${item.circulation_desk_code}` `` — but which carts physically exist is a property of the circulation desk the item is being returned at, not of the item. Two desks in the same library can own different carts, and the same item returned at either desk must be routed differently.

We therefore select directives using the `library` and `circulation_desk` of the checkout profile in play, resolved from the `checkout_profile_id` URL parameter via `resolveCheckoutDetails`. Every screen that can display a directive carries that parameter, so `getItem` takes an optional checkout context in the same way `borrowItem` and `returnItem` already do, and no code infers a desk from an item.

## Consequences

Without a checkout context there is no directive — deliberately, rather than falling back to "the only configured profile" or to a built-in default cart. A deployment that configures no directives shows no instruction, which is correct for libraries that never adopted the feature and avoids naming a cart they do not own.
