import { composeDomain } from "./fixture-seam.mjs";
import { PERMITS_PIPELINE_DOMAIN, pipelineMetrics } from "./domains/permits-pipeline.mjs";

/* ------------------------------------------------------------------ fixtures

The G-77 public surface, kept intact over the G-91 seam.

Everything that used to live here now lives in src/fixture-seam.mjs (the
mechanism) and src/domains/ (the content), so a wave-2 lane adds a lens by adding
a file rather than by editing the file every other lane is editing. This module
re-exports what the pre-G-91 callers import, so nothing outside had to move.

composePipeline is the one thing that is not a pass-through, and the reason is
stated at the function.
*/

export {
  DEMO_FIXTURE_PARCELS,
  PLACE_VOCABULARY,
  RECORD_ID_FORMAT,
  PLACE_LABEL_FORMAT,
  assertNoRealWorldContent,
  assertDeclaredVocabulary,
  dueLabelFor,
  dayLabelFor,
  composeDomain,
  packFixtureGrants,
  fixtureBasisFor,
  DOMAIN_STATUSES,
} from "./fixture-seam.mjs";

export {
  FIXTURE_BASIS,
  PIPELINE_COUNTING_RULE,
  PIPELINE_FIXTURE_PLAN,
  STATUS_BANDS,
  SUBJECT_VOCABULARY,
  generatePipelineRecords,
  pipelineMetrics,
  PERMITS_PIPELINE_DOMAIN,
} from "./domains/permits-pipeline.mjs";

export {
  DOMAIN_REGISTRY,
  composeAllDomains,
  composeDomainById,
  composeDomainMap,
  getDomain,
  listDomains,
} from "./domains.mjs";

/**
 * The Development services pipeline payload, in the shape web/app.js reads.
 *
 * This is an ADAPTER over the seam, not a second implementation. The browser
 * bundle reads pipeline.generated, .metrics, .recordCount, .records, .cityKey
 * and .basis, and web/ is owned by another lane on this card, so the payload
 * keeps those keys exactly where they were and the seam's own envelope travels
 * beside them.
 *
 * Two keys are worth naming because they look redundant and are not.
 *
 * `status` stays the two-value ok/empty the chrome was built against.
 * `sourceStatus` carries the seam's four-state truth (ok, granted-empty,
 * ungranted, no-fixture-source). Folding the four into the two at the seam would
 * have thrown away exactly the distinction ruling 1 exists to make; folding the
 * two into the four here would have changed a shipped contract from a lane that
 * may not edit the consumer. So both travel, and which is which is stated here.
 */
/**
 * `precomposed` is G-116's real-source escape hatch: server.mjs passes the
 * already-composed real result (composeRealPermits, mygov-permits.mjs) when
 * the pack carries a real mygov grant, so this function only has to adapt
 * field names onto the pipeline shape rather than know how to fetch
 * anything real itself -- same division of labour as /api/domains/:id and
 * /api/city-domains already use. Real records carry no fixture metrics
 * (extras.metrics); realStatusCounts travels through instead, honestly, and
 * "this pack generates none" -- which is only ever true of a FIXTURE pack
 * -- is not asserted for a real pack that came back empty or unavailable
 * for a real-world reason.
 */
export function composePipeline(pack, precomposed) {
  if (!pack) throw new Error("pipeline compose requires a pack");
  const out = precomposed || composeDomain(pack, PERMITS_PIPELINE_DOMAIN);
  const generated = out.status === "ok";
  const extras = out.extras || {};
  return {
    lensId: PERMITS_PIPELINE_DOMAIN.lensId,
    tab: PERMITS_PIPELINE_DOMAIN.tab,
    cityKey: out.cityKey,
    displayName: out.displayName,
    environment: out.environment,
    generated,
    kind: out.kind,
    recordType: out.recordType,
    gatedBy: out.gatedBy,
    granted: out.granted,
    status: generated ? "ok" : "empty",
    sourceStatus: out.status,
    basis: out.basis,
    recordCount: out.recordCount,
    countingRule: generated
      ? out.countingRule
      : precomposed
        ? out.countingRule
        : "no records: this pack generates none",
    metrics: extras.metrics || (precomposed ? null : pipelineMetrics([])),
    realStatusCounts: extras.realStatusCounts || null,
    records: out.records,
  };
}
