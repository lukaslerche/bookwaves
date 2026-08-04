# BookWaves

BookWaves is a library self-service and staff-integration system that connects RFID workflows with library management systems.

## Language

**Login secret**:
A user-entered secret used to prove identity during login. In PIN-or-password login, the same login secret may be an Alma PIN or an Alma password.
_Avoid_: password-or-pin value, PIN/password credential

**PIN-or-password login**:
A login mode where the submitted login secret is first compared with the user's Alma PIN and, if that fails, used for Alma password authentication.
_Avoid_: username-password login, PIN login

**Active user session**:
The currently logged-in library user on a kiosk device. The session may be resumed from the auth cookie after a browser reload, regardless of the login mode that created it.
_Avoid_: cached login, remembered username

**Kiosk device**:
A browser environment dedicated to library self-service workflows where preserving the active user session across reloads is expected.
_Avoid_: personal browser, staff workstation

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
