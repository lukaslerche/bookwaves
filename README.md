# BookWaves

Cloud-based RFID circulation, tagging, and gate monitoring for libraries. BookWaves pairs a modern UI with pluggable RFID middleware and LMS connectors to deliver self-service checkout, returns, gate alarms, and tag management in one console.

## Demo

Try BookWaves without hardware at https://bookwaves-demo.vercel.app

- Login with any username/password.
- Stores data in browser memory only.
- Useses a simulated RFID reader and mock LMS, see bottom right corner for simulation deck.

## Features

- **Self-checkout** – Borrow, return, list items on the reader, and view patron accounts with LMS-backed status.
- **Security gate** – Live monitoring with audio/visual alerts for secured items.
- **Reader console** – Inspect items on a reader, secure/unsecure, edit media IDs, clear, or kill tags.
- **Tagging** – Batch-initialize blank tags from barcodes.
- **Admin tooling** – Inspect config and all middleware readers, and exercise LMS endpoints via a test console.
- **LMS integration** – Integrated into Alma staff UI via official Alma RFID integration.
- **Try-it-first** – Built-in mock LMS and mock reader for demos without hardware; Feig middleware supported for production.

## Quick Start (Local)

1. **Install prerequisites**: Node 20+ and pnpm (`npm i -g pnpm`).
2. **Create config**: `cp config.example.yaml config.yaml` and adjust values (see Configuration below).
3. **Install deps**: `pnpm install`.
4. **Run dev server**: `pnpm dev` (opens on http://localhost:5173).

## Quick Start (Docker)

There are 2 docker-compose files:

- `docker-compose.yml`: Basic setup for testing BookWaves with mock middleware and LMS.
- `docker/docker-compose.yml`: Complete setup with BookWaves Feig middleware container and an nginx reverse proxy.

See the config files in the folder `docker/` for more example configuration.

Start with:

```bash
docker compose up -d
```

Access BookWaves at http://localhost:80.

## Configuration

Copy `config.example.yaml` to `config.yaml` and edit:

**Notes**

- Keep `config.yaml` out of git. Set `CONFIG_FILE_PATH` if you store it elsewhere.
- `middleware_instances` drives all reader pickers; at least one entry is required. The mock entry works without hardware.
- Alma requires a valid API key; mock LMS needs no credentials. `login.mode` controls the checkout dialogs and accepts `username_password` (default), `username_password_or_pin`, `username_only`, `scanner_only`, or `username_or_scanner`.
- `username_password_or_pin` is Alma-only: the entered login secret is checked against the user's Alma `pin_number` first, then falls back to standard Alma password authentication if the PIN check fails.
- `login.scanner_focus_assist` helps scanner-driven kiosk login: accidental clicks outside controls refocus the username field, and a fast user identifier scan of at least 4 characters ending with Tab or Enter in the password/PIN field starts a new login attempt.
- `login.top_aligned_modal` moves the login modal near the top of the viewport with 3rem spacing, useful when on-screen keyboards would otherwise cover the form.
- `lms.cover_image_provider.url` can point to a base cover endpoint. BookWaves appends one comma-separated `isbn` query parameter, for example `https://api.ub.tu-dortmund.de/ccm/cover?isbn=9780747591078`. When configured, ISBN-bearing Alma and mock LMS items use this provider and items without known ISBNs do not fall back to generated random covers. When omitted, generated random covers remain the default. Provider misses and placeholders are handled by the provider. The mock LMS includes ISBN-bearing books so provider integration can be tested locally without Alma credentials.
- Return directives tell the user which return cart to place a returned item on, shown both when returning an item and in Buchinfo:
  - `global_return_directives` declares every cart once, each with a `binId`, a `color`, per-locale `label` and `message`, and a `when` condition. Omitting the block turns the feature off: no badge is shown, and no default cart is invented.
  - `checkout.profiles[].return_directives` selects which of those carts stand at that terminal, in evaluation order, by `binId`. A bare `- binId: main` inherits the global definition; adding `label`, `message`, `color` or `when` overrides only those keys. Omitting the key inherits the global set unchanged, while an explicit `return_directives: []` opts that desk out of carts entirely.
  - Directives are evaluated in the order written and the **first match wins**, so put specific carts above general ones. Ask in sequence: is it a hold bound for another library (it travels), a hold at all (it stays for the patron), owned elsewhere (it goes home), then the catch-all. Ownership must not come first — a hold is collected wherever the patron asked, whoever owns the book.
  - Every directive set needs a catch-all (`when: always: true`), globally and in each profile that lists directives, or the server refuses to start. An explicitly empty profile list is exempt, having no carts to fall off the end of.
  - A `when` takes `any` (at least one rule matches), `all` (every rule matches), or `always`. Declaring both `any` and `all` requires both. A rule names one `field` and exactly one operator: `in`, `not_in`, `equals` or `exists`. `not_in` also matches when the field is absent.
  - Rules may match `process_type`, `library_code`, `location_code`, `shelving_library_code`, `shelving_location_code`, `has_request` and `pickup_location_library`. Anything else is rejected at startup, as is an unknown operator such as `equal`, a duplicate `binId`, a profile naming an unknown `binId`, or a missing catch-all — each error naming the offending configuration path.
  - Prefer `shelving_library_code` and `shelving_location_code`: they say where the item belongs right now, following a temporary location such as a Semesterapparat. The plain pair is the permanent home, which a book on temporary loan has left, so routing on it sends such a book away from the shelf it is on.
  - `has_request` and `pickup_location_library` are answered by a second Alma call, made only when a rule at that desk mentions one of them. `has_request` counts only requests made by a person: Alma raises `WORK_ORDER` and `MOVE` requests of its own while routing items, and counting those would put ordinary books on the reserved cart. `pickup_location_library` separates a hold collected here from one that still has to travel — pair it with an `exists: true` rule, since `not_in` alone also matches an absent field. If the call fails both are left unset rather than assumed false, so a network problem does not read as "nobody wants this book".
  - Where a returned item ends up is settled by Alma’s desk configuration, not by BookWaves. Give the terminal’s circulation desk a hold shelf and a returned hold is placed on it by the return scan itself, with no transit and the requester notified; attach a shelving location with _Reshelve_ enabled and an item from it goes straight back in place. Normally no cart needs `complete_transit_at` at all.
  - `complete_transit_at` names a library and circulation desk where BookWaves scans the item in a **second** time. It covers the one deployment the above cannot: a terminal whose desk has no hold shelf, where a returned hold would sit in transit until a staff member repeated the scan. Never set it on a cart whose items are meant to stay in transit, such as one for another site whose books a pickup service collects. A failed follow-up scan is logged and ignored — the return has already succeeded.
  - When a cart declares no `complete_transit_at` but Alma reports the item in transit and it belongs on this library’s shelves, BookWaves logs a warning: the desk is missing that shelving location, has reshelving switched off for it, or has lost its hold shelf. A hold travelling to another library is excluded, being in transit for a good reason.
  - Carts belong to the terminal, not to the item, so directives resolve from the `checkout_profile_id` URL parameter. Without a profile, no directive is produced.
- Tagging:
  - `whitelist` blocks writes unless the EPC starts with an allowed prefix (override toggle available in UI).
  - `formats` lets you select which tag format you want to write (must match the tag types your middleware supports).
  - `focus` mode hides the reader selector and back button to streamline tagging for crew members using a fixed reader.
- `theme.page_backgrounds` lets you override route background gradients (`home`, `checkout`, `gate`, `reader`, `tagging`, `admin`).
- `theme.logo` lets you override the header logo (use an absolute path like `/branding/logo.png` or an `https://` URL).

## UI Workflows

- **Checkout**: Menu for Borrow, Return, List, Account. Borrow/Return automatically call LMS actions and unsecure/secure tags on success. Pass `middleware_id`/`reader_id`/`checkout_profile_id` in the URL to select the reader and LMS config to use.
- **Security Gate**: Live monitor; shows secured items with siren UI/audio. Use `gate.show_all_detected_items` to filter view. Pass `middleware_id`/`reader_id` in the URL to select the reader to use.
- **Reader**: Inventory snapshot, secure/unsecure, edit media IDs, clear tags, kill. Uses the currently selected reader from the selection dropdowns.
- **Tagging**: Polls a single tag, writes a media ID, enforces optional whitelists. Uses the currently selected reader from the selection dropdowns.
- **Admin**: Displays effective config, lists middleware readers, and offers an LMS test console (login, account, media lookup, lend/return, health).
- **LMS Integration**: Alma integration adds BookWaves as an RFID option in the staff UI (requires proper setup in Alma).

## RIFID Readers

### RFID Middleware configuration

- **Feig**: Talks to the [BookWaves Feig middleware](https://github.com/lukaslerche/bookwaves-feig). Configure a middleware entry with `type: feig` and its base `url`. Optional `FEIG_INTERNAL_URL` lets the app call the middleware over container networking; it is required when `url` is relative.
- **Mock**: Simulated reader with random items; supports inventory, secure/unsecure, edit, clear, initialize, analyze, and kill.

### Reader Selection while using

- **Saved reader**: Choosing a reader on the Reader or Tagging page stores `selectedMiddleware`/`selectedReader` in `localStorage`. Only Feig "host" mode readers are offered there; type in the filter box to narrow a long reader list.
- **URL selection**: Gate and Checkout use `?middleware_id=ID&reader_id=NAME` query params (useful to fix a certain reader in a kiosk environment). Checkout also requires `checkout_profile_id=ID` to select the LMS checkout profile (aka the library/circ desk combo for Alma). IMPORTANT: These must be Feig "notification" mode readers.
- **Mock helpers**: Quick links set `middleware_id=mock1&reader_id=MockReader1`.

## LMS Integrations

### Supported LMS types:

- **Alma**: Uses Alma Web Services (`api-eu.hosted.exlibrisgroup.com` by default). Borrow/return, account, loans, and health checks are supported. Requires `lms.api_key` and also checkout profiles for library/circ desk mapping that are used when performing checkout/return operations. The reader matching for the staff UI integration is done via the Alma Integration Profile setup (see below).
- **Mock**: In-memory responses for demos; always healthy and requires no auth.

### ALMA Integration Setup

#### Creating an API Key

1. Go to https://developers.exlibrisgroup.com/manage/keys/ and log in with your Alma developer account.
2. Click **Add API Key**.
3. Select (at least) the following scopes:
   - **Bibs**: `Read/write`
   - **Users**: `Read/write`

#### Integrating BookWaves into Alma staff UI

##### Prerequisite:

- You have BookWaves running and accessible from your local Browser
- BookWaves uses an **HTTPs** URL (self-signed certificates are supported)

##### Integration Profile Setup:

1. In Alma (as an Admin), navigate to **Configuration → General → Integration Profiles**.
2. Click **Add Integration Profile**.
3. Fill in the fields as follows:

- General Information
  - **Code**: RFID (or any other unique identifier)
  - **Name**: BookWaves (or any other descriptive name)
  - **Integration Type**: RFID
  - **Syste**: Other
- Actions
  - **Active**: Checked
  - **Server URL**: https://YOUR-BOOKWAVES-HOST/api/alma
  - **Handle Multple Items**: Checked
  - **Item Information Update**: Checked
  - (nothing to do in the 3 sub-menus)
- Contact Info
  - (nothing to do here)

4. Save the Integration Profile.

##### Linking Browser to RFID Device:

1. In Alma (as an Admin), navigate to **Configuration**
2. In the top dropdown ("Condiguring"), select the library where the RFID reader is located.
3. Navigate to **Fulfillment → Circulation Desks**.
4. Select the desired circulation desk or create a new one.
5. In the **RFID Information** set the IP address to the address (without port) of the RFID reader (the same as configtured in the Alma middleware configuration file).
6. Save the changes.

#### Using BookWaves in Alma

In Alma, when at a circulation desk with an RFID reader configured, you should see a new button **RFID** in the top right of the UI. Clicking this button will start the Alma RFID popup and also display RFID buttons next to e.g. the search box, the checkout and return buttons, etc.

## Troubleshooting

- **“Reader not configured”**: Ensure `middleware_instances` is populated and a reader is selected or provided via query params.
- **LMS calls failing**: Verify `lms.type` and API key, and use Admin → LMS Test Console to confirm connectivity.
- **Gate shows no secured items**: Set `gate.show_all_detected_items: false` if you want only secured tags highlighted.

## Deployment

The following sections are for developers who want to build, modify, or contribute to the project.

### Building the Docker Image

#### Prerequisites

1. **Install Docker** with buildx support (included in Docker Desktop)

2. **Authenticate with GitHub Container Registry** (for pushing images):

   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   ```

   Or create a Personal Access Token (PAT) with `write:packages` scope.

#### Build for Local Testing

```bash
docker buildx build --tag ghcr.io/lukaslerche/bookwaves:latest --load .
```

**Note:** The `--load` flag imports the image into your local Docker daemon for testing.

#### Push to GitHub Container Registry

1. **Build and push** with version tags:

   ```bash
   docker buildx build --platform linux/amd64,linux/arm64 \
     --tag ghcr.io/lukaslerche/bookwaves:latest \
     --tag ghcr.io/lukaslerche/bookwaves:2.0.0 \
     --push .
   ```

2. **Verify the push** by checking the GitHub Container Registry:
   - Navigate to your GitHub profile → Packages
   - Find `bookwaves` package

3. **Make the package public** (optional):
   - Go to package settings
   - Change visibility to public
