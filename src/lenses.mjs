export const LEAD_LENSES = [
  {
    id: "city-manager",
    audience: "city manager",
    needs: "cross-department view of the whole city from one record",
    accessPolicy: "platform-internal",
  },
  {
    id: "development-services",
    audience: "development services",
    needs: "permitting and development pipeline; connects to Plan Review as a later mount",
    accessPolicy: "platform-internal",
  },
  {
    id: "finance",
    audience: "finance",
    needs: "budget against actuals from records, not a vendor wallpaper",
    accessPolicy: "platform-internal",
  },
  {
    id: "citizen",
    audience: "resident",
    needs: "service requests, status, and what is happening around them",
    accessPolicy: "public-free",
    skuName: null,
    payments: false,
  },
];

export function listLenses() {
  return LEAD_LENSES.map((l) => ({
    id: l.id,
    audience: l.audience,
    needs: l.needs,
    accessPolicy: l.accessPolicy,
    payments: l.payments === true,
  }));
}

export function getLens(id) {
  return LEAD_LENSES.find((l) => l.id === id) || null;
}
