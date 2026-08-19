# G-89 pre-fix fixture — frozen, do not refresh

`index.html` and `shell.css` here are byte copies of `web/index.html` and
`web/shell.css` as they stood on `main` at commit
`6a4580d1a4845df54a32d376abdbf36b9f3591fb`, taken before any G-89 edit.

They are EVIDENCE, not a second copy of live truth. They exist so
`src/first-paint.test.mjs` can run its acceptance predicate against the build
the fix replaces and watch it fail, in the same test run as the clean arm. A
clean arm and an injected arm in different tests let an unrun check and a
passing check look alike, which is the failure this program keeps paying for.

Refreshing them from the fixed files would turn the failing arm into a passing
arm that proves nothing. That is prevented rather than requested: the test pins
the sha256 of each file over LF-normalized bytes and fails loudly on any change.
The normalization matters because this repo checks out CRLF on Windows and LF in
CI, so a raw file hash would disagree between them.

Housed at the repo root rather than under `src/` or `web/` deliberately.
`src/shape.test.mjs` walks exactly those two trees, so a frozen file placed
there would be judged forever by gates it can never be edited to satisfy, and a
permanently-red gate is a dead gate. The `Dockerfile` also copies only `src` and
`web`, so nothing here enters the deployed image.

What the fixture reproduces, measured: for every query string the acceptance
list names — `?lens=finance`, `?work=connections`,
`?lens=development-services&tab=review`, no query, and `?lens=bogus` — the
pre-fix build paints `lens-city-manager` and nothing else, because
`class="lens on"` is in the static document and the only script is a deferred
module.
