# Public origin comes from the proxy; middleware instances carry their own server address

SvelteKit 3 removed adapter-node's runtime `ORIGIN` variable. Its replacement, `paths.origin`, is
read when the app is built, and remote functions (login, borrow, return) are rejected unless the
browser's `Origin` matches the app's origin. Baking an origin in would tie the published Docker image
to one address and break Vercel preview deployments, whose URLs differ per deployment. BookWaves
therefore sets no origin at build time: on Vercel the platform supplies the real request URL, and
every Docker setup runs behind nginx, which forwards `X-Forwarded-Proto` and `X-Forwarded-Host` for
adapter-node's `PROTOCOL_HEADER` and `HOST_HEADER`.

That includes the basic try-out setup, which would otherwise look simpler without a proxy. Without
one, adapter-node assumes `https`, so a browser on `http://localhost:3000` is refused. For the same
reason neither compose file publishes the app's port 3000: reaching the app around nginx is exactly
the request that fails.

`ORIGIN` had a second job. The server used it to resolve a relative middleware URL such as `/feig`,
next to the global `FEIG_INTERNAL_URL`. Both are replaced by an internal middleware URL on each
middleware instance in `config.yaml`. A deployment may run several Feig middleware instances, and a
single global address silently routes all of them to the first one: their readers are listed under
the wrong instance and readers resolved by IP are not found. When set, the internal middleware URL
is always used by the server, also when the middleware URL is absolute, so a server in the same
network as the middleware can skip the public address.

## Consequences

A middleware instance with a relative middleware URL and no internal middleware URL is reported only
when the server loads its readers, not at startup. The rest of BookWaves keeps working, and the
logged error names the instance and `internal_url`. Upgrading deployments must move `ORIGIN` to
proxy headers and `FEIG_INTERNAL_URL` into `config.yaml`. There are few installations, so no upgrade
warning is emitted.
