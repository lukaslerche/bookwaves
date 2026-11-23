<!--
  Documentation changes belong on the documentation site (https://docs.bookwaves.de), not here.
  This README is a description, a minimal quickstart, and a link — see "Contributing" below
  before adding a new section.
-->

# BookWaves

Cloud-based RFID circulation, tagging, and gate monitoring for libraries. BookWaves pairs a modern UI with pluggable RFID middleware and LMS connectors to deliver self-service checkout, returns, security gate alarms, and tag management in one console.

## Documentation

Full documentation — installation, configuration, RFID hardware setup, LMS integration, day-to-day operation and troubleshooting — lives at **[docs.bookwaves.de](https://docs.bookwaves.de)**.

## Demo

Try BookWaves without hardware at https://bookwaves-demo.vercel.app

- Login with any username/password.
- Stores data in browser memory only.
- Uses a simulated RFID reader and mock LMS — see the bottom right corner for the simulation deck.

## Features

- **Self-Checkout** – Borrow, return, list items, and view patron accounts with LMS-backed status.
- **Security Gate** – Live monitoring with audio/visual alerts for secured items.
- **Inspector** – Inspect items on a reader, secure/unsecure, edit media IDs, clear, or kill tags.
- **Tagging** – Batch-initialize blank tags from barcodes.
- **Admin tooling** – Inspect config and all middleware readers, and exercise LMS endpoints via a test console.
- **LMS integration** – Integrates into the Alma staff UI via the official Alma RFID integration.
- **Try-it-first** – Built-in mock LMS and mock reader for demos without hardware; BookWaves Feig supported for production.

## Quick start

```bash
git clone https://github.com/lukaslerche/bookwaves.git
cd bookwaves
cp config.example.yaml config.yaml
docker compose up -d
```

Open http://localhost and log in with any username/password. This runs entirely against the built-in mock middleware and mock LMS — no reader hardware. BookWaves sits behind a small nginx in this setup, as in every other: it learns its public address from the proxy, and reached directly it refuses logins.

For a real installation — a `config.yaml` you keep, real RFID hardware, a real LMS, and a production deployment behind a reverse proxy with TLS — start with the [Docker quickstart](https://docs.bookwaves.de/deploy/docker-quickstart/) on the documentation site.

## Learn more

- [What is BookWaves?](https://docs.bookwaves.de/start-here/what-is-bookwaves/) — what BookWaves is and how it fits together with a middleware and an LMS
- [Deploy](https://docs.bookwaves.de/deploy/docker-quickstart/) — Docker quickstart, production deployment, and full configuration references
- [RFID hardware](https://docs.bookwaves.de/rfid-hardware/supported-readers-and-tag-formats/) — supported readers and tag formats, configuring a Feig reader
- [LMS integration](https://docs.bookwaves.de/lms-integration/alma-api-key-and-integration-profile/) — Alma API keys, integration profiles, circulation desks and checkout profiles
- [Operate](https://docs.bookwaves.de/operate/tagging/) — Tagging, Security Gate, Inspector, and troubleshooting
- [Extend](https://docs.bookwaves.de/extend/middleware-protocol/) — the middleware protocol, for writing a middleware for other reader hardware

## Contributing

The following sections are for developers who want to build, modify, or contribute to the project.

**Documentation changes belong on the [documentation site](https://docs.bookwaves.de), not in this README.** If you're about to add a section here that goes beyond the quickstart above or the developer setup below, it almost certainly belongs there instead.

### Local development

1. **Install prerequisites**: Node 20+ and pnpm (`npm i -g pnpm`).
2. **Create config**: `cp config.example.yaml config.yaml` and adjust values — see the [BookWaves configuration reference](https://docs.bookwaves.de/deploy/bookwaves-configuration-reference/) for every key.
3. **Install deps**: `pnpm install`.
4. **Run dev server**: `pnpm dev` (opens on http://localhost:5173).

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
     --tag ghcr.io/lukaslerche/bookwaves:2.1.2 \
     --push .
   ```

2. **Verify the push** by checking the GitHub Container Registry:
   - Navigate to your GitHub profile → Packages
   - Find `bookwaves` package

3. **Make the package public** (optional):
   - Go to package settings
   - Change visibility to public
