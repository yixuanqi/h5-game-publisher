# V0.3.1 — Android native packaging and signing foundations

Baseline 1fcfb0f, run 45580176317: 8/9 tasks passed, Ashen title wait timed out under software rendering. This is not a green baseline. Game-side investigation was handed off; unchanged pinned source remains under the existing full emulator gate. No game modifications, no automatic intro skip and no timeout relaxation.

## Native configuration
`android.immersive` (default false) hides system bars on native resume/window focus through AndroidX WindowInsetsControllerCompat; edge swipe temporarily reveals them. Demo only for this slice. Need device/Insets/cutout and system gesture regression before enabling both real games.
`android.icon`: 512x512 PNG relative to the selected staged source (or built-in demo vector reserved for demo); header/size checked, Android build validates the full resource. Legacy launcher and round icon reference the branded drawable, not yet adaptive icon layers. Ashen uses its existing icon-512.png; Curio unchanged pending approved image. `android.splashColor`: branded Android splash theme using icon and background. No game web payload changes. Configured only for demo and Ashen. Native configuration and icon hash in build-info. All generated native changes reside in .work.
References: https://developer.android.com/develop/ui/views/layout/immersive and https://docs.oracle.com/en/java/javase/21/docs/specs/man/jarsigner.html.

## AAB signing (local, opt-in)
First produce the unsigned AAB using the usual publisher command. Provide H5_SIGNING_MODE (upload or test), H5_KEYSTORE (absolute path outside publisher checkout), H5_KEY_ALIAS, H5_STORE_PASSWORD, H5_KEY_PASSWORD and H5_UPLOAD_CERT_SHA256 (SHA256 of DER upload certificate, independently checked against Play Console). Set secrets via a private shell/session; never commit a keystore or paste credentials into logs. Run:
```sh
node platforms/android/sign-aab.mjs dist/ashen-bell-vow/450700-45.7.0/ashen-bell-vow-unsigned.aab
```
Input hash checked against its .sha256. Upload mode additionally requires recorded source SHA and clean framework SHA. JDK 21 jarsigner signs in temp directory; Java verifier reads every payload entry, checks signature and pinned cert, unchanged entry contents, and basic AAB structure. Does NOT certify bundletool structural validation or Google Play eligibility. No signed output until verification succeeds. Refuses overwrites, preserves unsigned original. Test mode outputs -test-signed.aab; upload mode -upload-signed.aab; both produce signing.json and SHA256. CI demo uses disposable random key outside repository and destroys signed test bundle/key; archives only validation metadata. No real upload key used, no store upload, no credentials requested.

## Next steps
Verify native runtime system bars and cutouts on emulator/physical device; adaptive icons and Curio artwork; bundletool validate and inspect release manifest; signing key management, stable dependency lock, release workflow/version gating and Play Console. APK/AAB existing gates unchanged. Signing report is not equivalent to final release approval.


## V0.3.2 — AAB release quality gate

Previous real results: run 45584017276, all three native builds passed; Demo disposable signing accepted correct certificate, rejected wrong pin and overwrite. Demo emulator passed. Ashen title wait and Curio native Back pause timed out, so full emulator acceptance remains red (7/9 jobs). No runtime test is removed or relaxed here.

- Official bundletool 1.18.3 download with SHA256 pinned to the official GitHub release asset digest, then `validate` and `dump manifest --module=base`.
- Parse the actual final manifest XML, not the source template. Check package, version, min/target SDK, MainActivity exported/orientation, no debuggable or testOnly. List actual permissions for review (not a privacy or Play policy certification).
- Independently hash base/assets/public entries directly from the AAB. All staged game files must match; only two known empty Capacitor/Cordova generated files may be extra. Reject duplicate or unsafe ZIP paths.
- Record AAB hash, manifest, SDK, permissions, dependency lock hash and resource verification in *.validation.json; run on all unsigned packages and Demo test-signed package. Upload-mode signing independently revalidates before and after signing; requires H5_BUNDLETOOL_JAR in addition to signing variables. Test-signed output is not for upload.
- release-registry.json fixes existing app IDs, baseline version codes and names; upload mode requires registered non-demo game and higher code than last recorded upload (when present). lastUploadedVersionCode remains null until actual verified upload; does not query Play Console or guarantee availability of version code. Same version can be rebuilt for tests. New game IDs can build locally but require registry enrollment for upload.
- npm dependency lock gate: normalized SHA256 of all three lock files in run 45584017276 (99 packages entries including root) was identical. The root package name is normalized, all other lock fields including integrity are retained. Before npm ci, use existing lock or H5_ANDROID_LOCKFILE (approved saved package-lock.json from any of the three artifacts), otherwise resolve a lock-only and reject drift rather than silently upgrading. This pins accepted dependency resolution, but does not yet vendor the lock or pin full Gradle/transitive/OS toolchain. Archive the exact generated lock with output; use H5_ANDROID_LOCKFILE for reproducibility when registry changes. A committed canonical lock and Gradle locking remain next steps.
- SDK floor 36 and maximum minSdk 29 are project policy (not a claim of current store requirements). Review when updating target policy.
- Source isolation and full emulator regression remain independent and unchanged. No game repository write, real upload key use, or publication.
