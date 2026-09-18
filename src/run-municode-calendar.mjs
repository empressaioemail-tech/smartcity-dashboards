import { loadDotenv } from "./load-env.mjs";
import { runMunicodeCalendar } from "./municode-calendar.mjs";

loadDotenv();

/**
 * G-161. The city is an ARGUMENT, not a default.
 *
 * This line was `process.argv[2] || "template-city"`, so `npm run
 * run:municode-calendar` with no argument silently ran - and WROTE - the demo
 * pack's clerk calendar. An operator asking for "the calendar" got one city's
 * without ever naming a city, and the files it wrote carry that city's key.
 *
 * It refuses instead, and it refuses BEFORE the run rather than inside it,
 * because the difference matters to whoever typed the command: a usage refusal
 * says "you named no city", while a run that returns an empty report would say
 * "your city has no calendar grant", which is a different and false statement.
 *
 * Exit 2 matches this file's existing failure convention, so a wrapper script
 * that only checks the exit code still sees a run that did not happen.
 */
const cityKey = String(process.argv[2] || "").trim();
if (!cityKey) {
  process.stderr.write(
    [
      "usage: node src/run-municode-calendar.mjs <cityKey>",
      "",
      "refuses to run without a city. It used to default to template-city, which ran the",
      "demo pack's calendar and wrote its files for a command that named no city (G-161).",
      "",
    ].join("\n"),
  );
  process.exit(2);
}

const result = await runMunicodeCalendar({ cityKey });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.status !== "ok" || result.written < 1) {
  process.exitCode = 2;
}
