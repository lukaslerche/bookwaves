# Return cart transit is settled by desk configuration, not by BookWaves

The Anforderungsliste asks that items bound for the red and yellow carts not be left sitting in
Alma's transit state, while items bound for the grey cart stay in it — a pickup service physically
drives those, and the transit record is what says the book is on the road. The obvious reading is
that BookWaves should issue a follow-up scan-in for the two carts that stay in the building. None of
them needs one. Every case is settled by how the circulation desk is configured in Alma.

- **Yellow (reshelved on site)** — a desk with the item's shelving location attached and _Reshelve_
  enabled on it puts a returned item straight back in place. No transit is created.
- **Grey (another site)** — the default. Nothing is configured and nothing is called; the item goes
  In Transit, which is exactly what the pickup service needs.
- **Red (a hold)** — a desk with **Has hold shelf** enabled places a returned hold on that shelf
  during the return scan itself. No transit is created, and Alma notifies the requester that the
  book is ready for collection.

BookWaves therefore issues no second call for any cart. The red cart is where the book physically
waits until staff carry it to the shelf; Alma already considers it shelved.

## Why the earlier design had BookWaves scan a second time

This ADR previously recorded the opposite decision for the red cart, and the reasoning is worth
keeping because it is the thing that would otherwise be rediscovered and re-adopted.

The self-service stations had **Has hold shelf** switched off, so a hold returned there could not be
placed on a shelf at the terminal, and the item sat in transit until a staff member repeated the scan
at the front desk. Enabling a hold shelf per station was rejected: every station has its own
circulation desk in Alma, so it would fragment one hold shelf into several, when patrons are directed
to a single shelf on the library's default desk. BookWaves instead issued a follow-up scan-in at that
default desk, named per cart via `complete_transit_at`.

That objection was withdrawn on the Alma administrator's advice (2026-08-28): a hold shelf per
circulation desk is supported, and hold shelf reports and patron notifications work correctly across
them. The fragmentation was a concern about Alma's behaviour, not an observation of it. With the
hold shelf enabled on the terminal's own desk, the follow-up scan has nothing left to do.

`complete_transit_at` is kept, not deleted. It is the only way to serve a deployment whose terminal
desk genuinely has no hold shelf and whose holds belong on another desk's shelf — the situation this
library was in until now. It defaults to unset, so no deployment pays for it.

## Consequences

Return behaviour now depends entirely on Alma configuration that BookWaves cannot see or validate at
startup: which locations are attached to a desk, whether _Reshelve_ is set on them, and whether the
desk still has its hold shelf. Rather than have maintainers restate that in `config.yaml`, BookWaves
infers it — an item whose owning library matches the terminal's, reported in transit by a cart that
declares no `complete_transit_at`, indicates the desk configuration has drifted, and is logged as a
warning.

That warning now covers the red cart as well, which it did not before. While the red cart named a
destination it was excluded from the check, so a broken hold shelf would have been silent. It sees
every red-cart item owned by the terminal's own library, which is the population that matters: a
hold owned elsewhere but collected here is excluded, and rightly so, because Alma moving such an item
is ordinary routing rather than evidence that this desk has been misconfigured.

The requester is notified the moment the item is scanned in, while it is still on the red cart, so
someone can arrive before the book reaches the shelf. The librarians were asked and accept that
window. Alma's _Delay for hold notification (minutes)_ shortens it, and now belongs on the
self-service desk rather than on the default desk.

Confirmed against the live sandbox on 2026-08-28: a hold returned at the self-service station comes
back with `process_type` `HOLDSHELF` ("Bereitstellung"), `additional_info` reading _"Der Zielort des
Exemplars ist: On Hold Shelf"_, and a request whose `request_status` is `ON_HOLD_SHELF` and whose
`managed_by_circulation_desk_code` is the self-service desk itself. No transit is created and the
requester is notified.

That same payload corrected the cart ordering. **Ownership does not decide whether a book stays.** A
hold is collected wherever the patron asked for it, which is independent of who owns the book — the
verified return was an item owned by `EFB` with `pickup_location_library` also `EFB`, but the two
fields are free to differ. Ordering the carts by ownership therefore gets two cases wrong: a book
owned elsewhere but collected here would be sent away from the patron waiting for it, and a book
owned here but collected elsewhere would be put on the hold shelf cart and never travel.

The carts now ask "is this a hold going somewhere else?" before "is this a hold?", which leaves the
second question a plain `has_request` test and puts the shelving question last, where it only sees
books nobody has requested. A hold whose pickup location Alma does not report stays on the red cart
rather than being reshelved, because a book someone is waiting for is better left where staff will
see it.

Two further corrections came out of the same session, and both were assumptions rather than
observations until a real payload contradicted them.

**Not every request record is a patron's.** Alma raises its own requests against an item and returns
them from the item requests endpoint alongside real ones: a return that transits for reshelving
produces a `WORK_ORDER` of sub-type `TRANSIT_FOR_RESHELVING`. Counting those puts ordinary books on
the reserved cart — precisely the mis-routing that moving the red cart off `process_type` was meant
to end, reappearing through the field that replaced it. Internal types are now excluded, and unknown
types are treated as a patron's, because stranding a book on the reserved cart is visible to staff
while reshelving a wanted one is not.

**The owning library is not where a book belongs.** An item on loan to a Semesterapparat keeps its
permanent library and location while living somewhere else entirely, so routing on ownership sends it
away from the shelf it is on. Carts and the drift warning now ask the shelving position — the
temporary pair when there is one, the permanent pair otherwise.
