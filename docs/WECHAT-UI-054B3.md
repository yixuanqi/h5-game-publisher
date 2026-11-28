# V0.5.4b3 — generated CSS boxes and selector diagnostics

Base: 46581e32afba7d98584508ac847a9d4da9c87829, failed run 46093367440. 29 JS tests passed and real ABI max delta was 0.000020751953 px; authored title probe reported five unsupported selector matches. Inspection of frozen v46.1 CSS identifies five WebKit scrollbar rules as the candidate cause, not yet a confirmed runtime reproduction.

Explicit generated-box policy: known before/after/first-letter/first-line and WebKit scrollbar pseudo-elements are excluded from element cascade, with original selector, media, declarations and importance retained for a future paint adapter. Ordinary pseudo-classes remain in the matcher; unknown pseudo-elements fail closed. No general catch-and-ignore. Geometry evidence reports complete selector errors and retains partial results on failure. Existing 0.5 px gate and all b2 tests stay intact. Added regression cases for five scrollbar rules, grouped selectors, media, literal attributes, unknown selectors and matcher failures.

Scope remains host WASM geometry diagnostic; scrollbar paint, full DOM/visual parity, native WXWebAssembly and release acceptance are NOT proven. No edits to frozen game or main.
