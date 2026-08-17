# smartcity-dashboards

Empressa product: SmartCity Dashboards (doc 31). Own repo, own service. One product. Cities are tenant packs, not forks.

This is not `smartcity-os`. This is not Hauska substrate. This is not Asset Management. This is not plan-review. This is not Smart Files.

Lenses (lead four): city manager, development services, finance, citizen. Citizen is a lens, not a SKU named CitizenConnect. Payments are not a product.

Mounts (G-13): Hauska spine over atom-read HTTP, SmartSite as `smartsite.cloud/?parcelNodeId=` embed, Smart Files over HTTP + service token. No spine DSN. No files DSN. No Leaflet island. No PermitFlow. No copied parcel table.

MCP tools for this product live on the existing Hauska MCP server. This repo does not start a second MCP process. Named tools (not yet on serving MCP): `dashboards_list_lenses`, `dashboards_get_city_pack`.

GitHub: https://github.com/empressaioemail-tech/smartcity-dashboards

Do not deploy into `smartcity-os-prod`, `hauska-prod-497015`, or `legacy-design-tools-prod`. Neon/GCP not created on the housing lock. Live Bastrop stays on `smartcityos.io` until a named cutover.

G-61 / OPS-17. WDLL: doc_repo `_inbox/2026-08-17_g61_dashboards_template_WDLL.md`. Wire: `_decisions/2026-08-17_g13_consumer_contract.md`. Housing: `_decisions/2026-08-17_smartcity_dashboards_housing.md`.
