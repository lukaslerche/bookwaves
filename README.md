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
- **Admin tooling** – Pick middleware/reader pairs, inspect config, and exercise LMS endpoints via a test console.
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
- Alma requires a valid API key; mock LMS needs no credentials. Login mode controls the checkout dialogs.
- Tagging whitelist blocks writes unless the EPC starts with an allowed prefix (override toggle available in UI).

## UI Workflows

- **Checkout**: Menu for Borrow, Return, List, Account. Borrow/Return automatically call LMS actions and unsecure/secure tags on success. Pass `middleware_id`/`reader_id`/`checkout_profile_id` in the URL to select the reader and LMS config to use.
- **Security Gate**: Live monitor; shows secured items with siren UI/audio. Use `gate.show_all_detected_items` to filter view. Pass `middleware_id`/`reader_id` in the URL to select the reader to use.
- **Reader**: Inventory snapshot, secure/unsecure, edit media IDs, clear tags, kill. Uses the currently selected reader from the selection dropdowns.
- **Tagging**: Polls a single tag, writes a media ID, enforces optional whitelists. Uses the currently selected reader from the selection dropdowns.
- **Admin**: Displays effective config, lists middleware readers, and offers an LMS test console (login, account, media lookup, lend/return, health).
- **LMS Integration**: Alma integration adds BookWaves as an RFID option in the staff UI (requires proper setup in Alma).

## RIFID Readers

### RFID Middleware configuration

- **Feig**: Talks to the [BookWaves Feig middleware](https://github.com/lukaslerche/bookwaves-feig). Configure a middleware entry with `type: feig` and its base `url`. Optional `FEIG_INTERNAL_URL` lets the app call the middleware over container networking.
- **Mock**: Simulated reader with random items; supports inventory, secure/unsecure, edit, clear, initialize, analyze, and kill.

### Reader Selection while using

- **Persistent selection**: Choosing a reader in the Admin/Reader/Tagging pages stores `selectedMiddleware`/`selectedReader` in `localStorage`.
- **URL selection**: Gate and Checkout use `?middleware_id=ID&reader_id=NAME` query params (useful to fix a certain reader in a kiosk environment). Checkout also requires `checkout_profile_id=ID` to select the LMS checkout profile (aka the library/circ desk combo for Alma).
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
- BooWaves uses an **HTTPs** URL (self-signed certificates are supported)

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
     --tag ghcr.io/lukaslerche/bookwaves:1.0.0 \
     --push .
   ```

2. **Verify the push** by checking the GitHub Container Registry:
   - Navigate to your GitHub profile → Packages
   - Find `bookwaves` package

3. **Make the package public** (optional):
   - Go to package settings
   - Change visibility to public
