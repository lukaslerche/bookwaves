# BookWaves

Self-service library circulation, tagging and gate monitoring on top of RFID middleware and an LMS.

## Readers

**Middleware instance**:
A configured RFID middleware server that BookWaves talks to; it exposes one or more readers.
_Avoid_: Server, backend

**Reader**:
A physical RFID reader exposed by a middleware instance, identified by its name within that instance.
_Avoid_: Device, antenna

**Operating mode**:
How a reader delivers tag data: either `host` or `notification`. Nothing else is an operating mode.
_Avoid_: Mode (unqualified), model

**Host-mode reader**:
A reader in the `host` operating mode, queried on demand by BookWaves. Required for the Reader and Tagging pages.

**Notification-mode reader**:
A reader in the `notification` operating mode, pushing tag events to BookWaves. Required for Gate and Checkout.

**Reader model**:
The hardware model of a reader (e.g. LRU3000). Distinct from its operating mode.
_Avoid_: Mode

**Saved reader**:
The middleware instance and host-mode reader chosen on the Reader or Tagging page, remembered on that device and shared by both pages.
_Avoid_: Persistent selection, selected reader config

## Login and sessions

**Login secret**:
A user-entered secret used to prove identity during login. In PIN-or-password login, the same login secret may be an Alma PIN or an Alma password.
_Avoid_: password-or-pin value, PIN/password credential

**PIN-or-password login**:
A login mode where the submitted login secret is first compared with the user's Alma PIN and, if that fails, used for Alma password authentication.
_Avoid_: username-password login, PIN login

**Active user session**:
The currently logged-in library user on a kiosk device. The session may be resumed from the auth cookie after a browser reload, regardless of the login mode that created it.
_Avoid_: cached login, remembered username

**User identifier scan**:
A scanner-produced identifier for a library user during login. The scanner may read a barcode, QR code, or another scannable credential; the domain concept is the resulting user identifier, not the physical code format.
_Avoid_: barcode scan, QR scan, username scan

**Scanner focus assist**:
An optional login behavior for scanner-driven kiosk workflows that keeps accidental focus loss from interrupting user identifier scans and treats a scan in the login secret field as a new login attempt.
_Avoid_: kiosk mode, barcode refocus, forced focus trap

**Top-aligned login modal**:
An optional login modal placement that keeps the form near the top of the screen to reduce overlap from on-screen keyboards.
_Avoid_: keyboard-safe modal, modal padding top

**Kiosk device**:
A browser environment dedicated to library self-service workflows where preserving the active user session across reloads is expected.
_Avoid_: personal browser, staff workstation

## Circulation

**Cover image provider**:
An external service that returns a displayable cover image for one or more ISBNs.
_Avoid_: cover URL template, image server, random cover service

**Known item identity**:
The in-process bibliographic identifiers remembered for a physical item barcode after BookWaves has already observed them from the library management system. It may help keep item displays consistent during a running server session, but it is not authoritative catalog data.
_Avoid_: persisted item record, catalog cache, barcode database

**RFID security update**:
A reader-side change to a physical item's RFID security state after a library circulation action. It is separate from the library transaction itself, so it can require attention even when the borrow or return has already succeeded.
_Avoid_: checkout failure, LMS security status

**Successful item with RFID warning**:
A borrow or return item whose library transaction succeeded but whose RFID security update still needs attention. The item remains successful for circulation purposes while the RFID warning tells the operator what still needs fixing.
_Avoid_: failed checkout item, partial failure

## Returns

**Return cart**:
A physical cart at a circulation desk onto which returned media items are placed, distinguished by colour and by name. Which carts exist is a property of the desk, not of the media item.
_Avoid_: bin, shelf, sorting bin, Regal

**Return directive**:
The instruction telling a user which return cart a media item belongs on, in their own language and naming the cart in words as well as by colour.
_Avoid_: bin assignment, sorting rule, shelf badge

**Onward transit**:
A returned media item's continuing journey to another library site, which must stay recorded in the library management system because the item leaves this site in someone else's care. An item moved between desks within one site has none, even though a person still carries it.
_Avoid_: transfer, routing, in-transit status, Transport

**Shelving position**:
Where a media item belongs at the moment it is returned, as a library and a location: the temporary pair while the item is on loan to one, such as a Semesterapparat, and the permanent pair otherwise. Distinct from the owning library, which does not change when a book moves to a Semesterapparat.
_Avoid_: home library, permanent location, temp location, Standort

**Patron request**:
A request for a media item made by a person, as opposed to one the library management system raises for itself while routing an item. Only a patron request means somebody is waiting for the book, so only a patron request belongs on the reserved cart.
_Avoid_: request, hold, work order, Vormerkung
