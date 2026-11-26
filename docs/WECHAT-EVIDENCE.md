# WeChat evidence handoff v1 (materials V0.3.0-c)

This is a **contract and promotion gate**, not a WeChat adapter or a build. Android v0.3.3 remains independent. Actual WeChat builder, DevTools and Android/iOS WeChat physical-device runner are not yet implemented here. No H5 or Android APK substituted. The materials baseline is Ashen V45.7 / ed71ffc76d38385c0e11e57f235ce6c398e56773 and Curio V9.6.3 / 2a3f539da0c5c28f35cc5959d331725a7b097e72; do not reuse the older Android config snapshot for this contract.

## Future candidate workflow interface
Implement .github/workflows/wechat-candidate.yml separately on main, manual dispatch, using an explicitly approved adapter and read-only source checkout. Produce real candidate ZIP with root game.js and game.json; run actual WeChat DevTools and physical Android/iOS WeChat tests against the exact package. Do not write the source repository or synthesize successful reports. The candidate run must be completed success, attempt 1. A failed test blocks promotion. Record source commit, adapter version, framework commit, package hash, environment, actual log and original screenshots. Keep secrets out of artifacts.

Prepare a private local directory with metadata.json, candidate.zip, runtime-audit.json, tests/{devtools,android,ios}.json, logs/{devtools,android,ios}.txt and screenshots/{devtools,android,ios}/{menu,gameplay,parry|extraction}.png. The validator in platforms/wechat/wechat_evidence_contract.py is normative, with the synthetic-only unit fixtures as schema examples. Metadata contains schema=1, kind=wechat-candidate-evidence, mode=real, game, version, source_sha, framework_sha, candidate_run_id (string), adapter_version, source_clean=true, framework_clean=true, created_utc, package_sha256. Each target report binds all identities, actual environment, timestamps, reviewer and route, ten tests and three screenshot records. Audit binds the same source/framework/package and observed API/SDK/domain/storage/permission inventories, method and ad/payment/personal-data observations. Never use example fixtures as candidate evidence.

```sh
python -m pip install Pillow==11.1.0
python platforms/wechat/wechat_evidence_contract.py pack --input /private/real-evidence --out /private/out/wechat-evidence.zip
python platforms/wechat/wechat_evidence_contract.py verify --game curio-box --bundle /private/out/wechat-evidence.zip --out /private/out/verification.json
```

Upload only wechat-evidence.zip as candidate artifact named wechat-candidate-input-GAME-RUN_ID. Then manually dispatch WeChat evidence contract with exact candidate run/artifact IDs. Promotion verifies GitHub run/commit/artifact identity and digest, rechecks ZIP/JSON/file hashes, exact package and test bindings, device evidence, image decoding and duplicate images, then uploads wechat-evidence-GAME-PROMOTION_RUN_ID containing wechat-evidence.zip and verification.json. The private bundle contains game package bytes; never expose publicly or copy into materials Git. The consumer should pin the promotion run/commit/artifact digest and independently revalidate. No signing/upload to WeChat. Structural integrity is not independent proof of physical test occurrence, privacy compliance or platform approval. Actual visual/human and official gates remain pending.

Current push CI exercises only synthetic contract tests, with mode=fixture prohibited in real validation; there is no real candidate input or device test. The real promotion job is manual only and refuses absent/untrusted runs. Existing Android workflow remains untouched.
