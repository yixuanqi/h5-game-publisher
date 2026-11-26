"""Synthetic-only fixtures, never publish any test bundle."""
import io
import json
import unittest
import zipfile
from PIL import Image,ImageDraw
from wechat_evidence_contract import GAMES,TARGETS,TESTS,CASES,sha,json_bytes,verify_bundle,unpack

GAME="curio-box";VERSION,SOURCE=GAMES[GAME];FRAME="a"*40
T0="2026-11-26T01:00:00Z";T1="2026-11-26T02:00:00Z"
def zipped(files):
    b=io.BytesIO()
    with zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED) as z:
        for n,data in files.items():z.writestr(n,data)
    return b.getvalue()
def fixture():
    package=zipped({"game.js":b"// synthetic test only","game.json":b"{}"})
    h=sha(package)
    m={"schema":1,"kind":"wechat-candidate-evidence","mode":"fixture","game":GAME,"version":VERSION,"source_sha":SOURCE,"framework_sha":FRAME,"candidate_run_id":"123","adapter_version":"fixture-only","source_clean":True,"framework_clean":True,"created_utc":T1,"package_sha256":h}
    audit={"package_sha256":h,"source_sha":SOURCE,"framework_sha":FRAME,"status":"observed","method":"synthetic fixture","wx_apis":[],"sdks":[],"domains":[],"storage_keys":[],"permissions":[],"ads":"unknown","payments":"unknown","personal_data":"unknown"}
    files={"candidate.zip":package,"runtime-audit.json":json_bytes(audit)}
    for i,target in enumerate(TARGETS):
        shots=[]
        for j,case in enumerate(CASES[GAME]):
            b=io.BytesIO();im=Image.new("RGB",(320,180),(20+i*50,j*50,120));ImageDraw.Draw(im).rectangle((20,20,40+j,50+i),fill="white");im.save(b,format="PNG")
            name=f"screenshots/{target}/{case}.png";files[name]=b.getvalue()
            shots.append({"case":case,"file":name,"package_sha256":h,"sha256":sha(files[name]),"pixels":[320,180],"captured_utc":T0})
        log=f"logs/{target}.txt";files[log]=b"synthetic log only"
        r={"target":target,"status":"passed","runtime_kind":"wechat_devtools" if target=="devtools" else "wechat_physical_device","game":GAME,"version":VERSION,"source_sha":SOURCE,"framework_sha":FRAME,"package_sha256":h,"device_model":"fixture","os_version":"fixture","wechat_version":"fixture","base_library":"fixture","tool_version":"fixture","reviewer":"fixture","game_route_notes":"fixture","started_utc":T0,"finished_utc":T1,"tests":[{"id":x,"status":"passed","notes":"fixture"} for x in sorted(TESTS)],"log":log,"screenshots":shots}
        files[f"tests/{target}.json"]=json_bytes(r)
    return m,files
def seal(m,files):
    m=dict(m);m["files"]={n:{"sha256":sha(b),"bytes":len(b)} for n,b in files.items()}
    return zipped({**files,"evidence.json":json_bytes(m)})
def edit(files,path,fn):
    d=json.loads(files[path]);fn(d);files[path]=json_bytes(d)
def check(raw):return verify_bundle(raw,GAME,VERSION,SOURCE,allow_fixture=True)
class ContractTests(unittest.TestCase):
    def test_fixture_integrity(self):
        m,f=fixture();r=check(seal(m,f));self.assertEqual(len(r["targets"]),3);self.assertFalse(r["submission_ready"])
    def test_fixture_cannot_promote(self):
        m,f=fixture()
        with self.assertRaisesRegex(ValueError,"Fixture"):verify_bundle(seal(m,f),GAME,VERSION,SOURCE)
    def test_wrong_source(self):
        m,f=fixture();m["source_sha"]="b"*40
        with self.assertRaisesRegex(ValueError,"mismatch"):check(seal(m,f))
    def test_wrong_package(self):
        m,f=fixture();m["package_sha256"]="0"*64
        with self.assertRaisesRegex(ValueError,"package digest"):check(seal(m,f))
    def test_tampering(self):
        m,f=fixture();raw=seal(m,f);a=unpack(raw);a["logs/ios.txt"]=b"changed"
        with self.assertRaisesRegex(ValueError,"digest"):check(zipped(a))
    def test_missing_target(self):
        m,f=fixture();del f["tests/ios.json"]
        with self.assertRaisesRegex(ValueError,"Missing target"):check(seal(m,f))
    def test_h5_not_wechat(self):
        m,f=fixture();edit(f,"tests/android.json",lambda x:x.update(runtime_kind="browser"))
        with self.assertRaisesRegex(ValueError,"H5/emulator"):check(seal(m,f))
    def test_failed_case(self):
        m,f=fixture();edit(f,"tests/android.json",lambda x:x["tests"][0].update(status="failed"))
        with self.assertRaisesRegex(ValueError,"Incomplete/failed"):check(seal(m,f))
    def test_stale_test(self):
        m,f=fixture();edit(f,"tests/ios.json",lambda x:x.update(package_sha256="0"*64))
        with self.assertRaisesRegex(ValueError,"different build"):check(seal(m,f))
    def test_reused_shot(self):
        m,f=fixture();a="screenshots/android/menu.png";b="screenshots/ios/menu.png";f[b]=f[a]
        edit(f,"tests/ios.json",lambda x:x["screenshots"][0].update(sha256=sha(f[b])))
        with self.assertRaisesRegex(ValueError,"duplicated image"):check(seal(m,f))
    def test_invalid_zip_path(self):
        with self.assertRaisesRegex(ValueError,"Unsafe"):unpack(zipped({"../secret":b"x"}))
    def test_wrong_dimensions(self):
        m,f=fixture();edit(f,"tests/devtools.json",lambda x:x["screenshots"][0].update(pixels=[1,1]))
        with self.assertRaisesRegex(ValueError,"pixel size"):check(seal(m,f))
    def test_extra_file(self):
        m,f=fixture();f["extra.txt"]=b"x"
        with self.assertRaisesRegex(ValueError,"Unexpected"):check(seal(m,f))
    def test_dirty_build(self):
        m,f=fixture();m["source_clean"]=False
        with self.assertRaisesRegex(ValueError,"Unclean"):check(seal(m,f))
