# Infra

Tenant-registry Neon is this product's store, not a mount. It holds city packs later. It does not hold parcels, files, or atoms.

- Neon: pooled `ep-still-wave-avbwm4yc-pooler.c-11.us-east-1.aws.neon.tech`, database `neondb`. DSN is gitignored (`.env`, `local.database_url`). Not `tiny-art-63602898`, not `fancy-fire-06136146`, not the city DB.
- GCP: project id `smartcity-dashboards`, project number `666199866241`, billing on. Created 2026-08-17. Not deployed.

Never deploy this product into `smartcity-os-prod`, `hauska-prod-497015`, or `legacy-design-tools-prod`.

Set `DASHBOARDS_API_KEY` before any public deploy. Unset keeps `/api/city-packs` open for local scaffold only.
