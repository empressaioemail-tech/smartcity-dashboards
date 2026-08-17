import { loadDotenv } from "./load-env.mjs";
import { runMunicodeCalendar } from "./municode-calendar.mjs";

loadDotenv();

const result = await runMunicodeCalendar({
  cityKey: process.argv[2] || "template-city",
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.status !== "ok" || result.written < 1) {
  process.exitCode = 2;
}
