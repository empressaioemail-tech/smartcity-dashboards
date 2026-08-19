# Infra

Tenant-registry Neon is this product's store, not a mount. It holds city packs later. It does not hold parcels, files, or atoms.

- Neon: pooled `ep-still-wave-avbwm4yc-pooler.c-11.us-east-1.aws.neon.tech`, database `neondb`. DSN is gitignored and Secret Manager `database-url`. Not `tiny-art-63602898`, not `fancy-fire-06136146`, not the city DB. Packs live in Neon (`city_packs`). Parcels do not.
- GCP: project id `smartcity-dashboards`, project number `666199866241`, billing on. Region `us-east1`.
- Cloud Run: service `smartcity-dashboards`, region `us-east1`. Runtime SA `smartcity-dashboards-run@smartcity-dashboards.iam.gserviceaccount.com` (secretAccessor only). URL `https://smartcity-dashboards-52ecsl5mvq-ue.a.run.app`. Live `GET /health` 200 `db=connected` `name=neondb`. `GET /api/lenses` 200. `GET /api/city-packs` 401 without Bearer, 200 with `DASHBOARDS_API_KEY`. Probe with GET; `HEAD` returns 404 on this service.
- The serving revision is NOT written down here. This line used to pin `00001-92j`, which stopped being true eighteen revisions ago and stayed on the page, because a number in a doc is a control that depends on someone remembering. Read it instead:

  ```
  gcloud run services describe smartcity-dashboards --project smartcity-dashboards --region us-east1 --format="value(status.traffic)"
  ```

  Last observed 2026-08-19: `smartcity-dashboards-00018-kiw` is `latestRevision` taking all traffic, with `smartcity-dashboards-00017-vx4` tagged `pre` taking none. That is a dated observation, not a pin. The command is the authority; this sentence is only evidence that someone ran it once.
- Secrets: `database-url`, `dashboards-api-key`. Not plaintext env.

Never deploy this product into `smartcity-os-prod`, `hauska-prod-497015`, or `legacy-design-tools-prod`.
