# Infra (v0)

v0 has no Neon. This service is a mount surface. A tenant-registry database, if one is needed later, is a new Neon project created by the operator. It is not the city DB, not cortex, not files, and not the atoms store.

The operator will create a NEW GCP project later. Recommended name: `smartcity-dashboards`.

Never deploy this product into `smartcity-os-prod`, `hauska-prod-497015`, or `legacy-design-tools-prod`.

Set `DASHBOARDS_API_KEY` before any public deploy. Unset keeps `/api/city-packs` open for local scaffold only.

This file does not invent a GCP project number. The number exists only after the operator creates the project.
