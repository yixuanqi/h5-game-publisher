"""WeChat evidence contract v1. Producer and consumer use identical bytes.

Hash/structure checks cannot establish that a device test really occurred.
Only authorized, independently reviewed real candidate runs may be pinned.
"""
import argparse
import hashlib
import io
import json
import pathlib
import re
import stat
import zipfile
from datetime import datetime
from PIL import Image

GAMES={
    "ashen-bell-vow":("V45.7","ed71ffc76d38385c0e11e57f235ce6c398e56773"),
    "curio-box":("V9.6.3","2a3f539da0c5c28f35cc5959d331725a7b097e72"),
}
TARGETS=("devtools","android","ios")
TESTS=set("launch touch landscape audio background_resume storage_restore storage_delete network_audit fault_audit game_route".split())
CASES={"ashen-bell-vow":("menu","gameplay","parry"),"curio-box":("menu","gameplay","extraction")}
MAX_TOTAL=256*1024*1024
MAX_FILE=128*1024*1024
HEX=re.compile(r"^[0-9a-f]{64}$")
COMMIT=re.compile(r"^[0-9a-f]{40}$")
ID=re.compile(r"^[1-9][0-9]*$")
def require(ok,msg):
    if not ok:raise ValueError(msg)
def sha(data):return hashlib.sha256(data).hexdigest()
def load(raw):
    def unique(pairs):
        d={}
        for k,v in pairs:
            require(k not in d,"Duplicate JSON key");d[k]=v
        return d
    return json.loads(raw,object_pairs_hook=unique)
def timestamp(value):
    require(isinstance(value,str),"Missing UTC timestamp")
    d=datetime.fromisoformat(value.replace("Z","+00:00"))
    require(d.tzinfo is not None,"Timestamp must include timezone")
    return d
def nonempty(value):
    return isinstance(value,str) and bool(value.strip()) and len(value)<=400
def valid_path(name):
    p=pathlib.PurePosixPath(name)
    require(name and "\\" not in name and not p.is_absolute() and all(s not in ("","..",".") for s in name.split("/")) and ":" not in name,"Unsafe archive path")
    require(not any(s.lower().startswith(".env") or s.lower() in ("project.private.config.json","appsecret","credentials.json") or s.lower().endswith((".pem",".p12",".pfx",".jks",".keystore")) for s in p.parts),"Potential private credentials in archive")
def unpack(data):
    require(len(data)<=MAX_TOTAL,"Archive exceeds size limit")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        info=z.infolist()
        require(len(info)<=10000 and len({i.filename for i in info})==len(info),"Duplicate or excessive archive entries")
        require(sum(i.file_size for i in info)<=MAX_TOTAL,"Uncompressed archive exceeds limit")
        files={}
        for i in info:
            name=i.filename.rstrip("/") if i.is_dir() else i.filename
            valid_path(name)
            require(not stat.S_ISLNK(i.external_attr>>16) and not(i.flag_bits&1),"Symlink or encrypted ZIP entry")
            require(i.file_size<=MAX_FILE,"Oversize file")
            if not i.is_dir():files[name]=z.read(i)
        require(len({n.casefold() for n in files})==len(files),"Case-colliding archive entries")
        return files
def verify_png(raw):
    with Image.open(io.BytesIO(raw)) as im:
        require(im.format=="PNG" and 128<=min(im.size) and max(im.size)<=8192,"Invalid screenshot format/dimensions")
        im.load()
        require(im.convert("RGB").getextrema()!=((0,0),(0,0),(0,0)),"Blank black screenshot")
        require(any(a!=b for a,b in im.convert("RGB").getextrema()),"Uniform screenshot")
        return list(im.size)
def json_bytes(d):return (json.dumps(d,ensure_ascii=False,sort_keys=True,indent=2)+"\n").encode()
def verify_bundle(raw,expected_game,expected_version,expected_source,allow_fixture=False):
    files=unpack(raw)
    require("evidence.json" in files,"Missing evidence.json")
    m=load(files["evidence.json"])
    require(m.get("schema")==1 and m.get("kind")=="wechat-candidate-evidence","Unknown evidence schema")
    require(m.get("mode")=="real" or (allow_fixture and m.get("mode")=="fixture"),"Fixture evidence cannot be promoted")
    require(expected_game in GAMES and (expected_version,expected_source)==GAMES[expected_game],"Unapproved materials source baseline")
    require((m.get("game"),m.get("version"),m.get("source_sha"))==(expected_game,expected_version,expected_source),"Candidate game/version/source mismatch")
    require(COMMIT.fullmatch(m.get("framework_sha","")) and ID.fullmatch(m.get("candidate_run_id","")),"Missing framework/run provenance")
    require(nonempty(m.get("adapter_version")) and m.get("source_clean") is True and m.get("framework_clean") is True,"Unclean or unidentified build")
    timestamp(m["created_utc"])
    hashes=m.get("files",{})
    require(isinstance(hashes,dict) and set(hashes)==set(files)-{"evidence.json"},"Evidence file set mismatch")
    for name,d in hashes.items():
        require(d=={"sha256":sha(files[name]),"bytes":len(files[name])},"Evidence file digest/size mismatch: "+name)
    require("candidate.zip" in files and "runtime-audit.json" in files,"Missing package or runtime audit")
    package_hash=sha(files["candidate.zip"])
    require(m.get("package_sha256")==package_hash,"Candidate package digest mismatch")
    package=unpack(files["candidate.zip"])
    require(package.get("game.js",b"").strip() and "game.json" in package,"Missing root game.js/game.json")
    require(isinstance(load(package["game.json"]),dict),"Invalid game.json")
    used={"candidate.zip","runtime-audit.json"}
    audit=load(files["runtime-audit.json"])
    require(audit.get("package_sha256")==package_hash and audit.get("source_sha")==expected_source and audit.get("framework_sha")==m["framework_sha"],"Runtime audit bound to wrong package")
    require(audit.get("status")=="observed" and nonempty(audit.get("method")),"Missing runtime audit method")
    for key in ("wx_apis","sdks","domains","storage_keys","permissions"):
        require(isinstance(audit.get(key),list) and all(nonempty(x) for x in audit[key]),"Missing runtime inventory: "+key)
    for key in ("ads","payments","personal_data"):
        require(audit.get(key) in ("observed","not_observed","unknown"),"Missing runtime observation: "+key)
    report_summary={};seen_images=set()
    for target in TARGETS:
        path=f"tests/{target}.json";require(path in files,"Missing target report: "+target);used.add(path)
        r=load(files[path])
        require(r.get("target")==target and r.get("status")=="passed","Failed or wrong environment: "+target)
        require(r.get("runtime_kind")==("wechat_devtools" if target=="devtools" else "wechat_physical_device"),"H5/emulator cannot replace WeChat evidence")
        require((r.get("game"),r.get("version"),r.get("source_sha"),r.get("framework_sha"),r.get("package_sha256"))==(expected_game,expected_version,expected_source,m["framework_sha"],package_hash),"Target report belongs to a different build")
        require(all(nonempty(r.get(k)) for k in ("device_model","os_version","wechat_version","base_library","tool_version","reviewer","game_route_notes")),"Missing runtime environment/reviewer/route")
        timestamp(r["started_utc"]);timestamp(r["finished_utc"])
        require(timestamp(r["started_utc"])<=timestamp(r["finished_utc"]),"Reversed test time")
        tests=r.get("tests",[])
        require(isinstance(tests,list) and len(tests)==len(TESTS) and {t.get("id") for t in tests}==TESTS and all(t.get("status")=="passed" and nonempty(t.get("notes")) for t in tests),"Incomplete/failed target tests")
        log=f"logs/{target}.txt"
        require(r.get("log")==log and log in files and bool(files[log].strip()),"Missing target log");used.add(log)
        shots=r.get("screenshots",[])
        require(isinstance(shots,list) and len(shots)==len(CASES[expected_game]) and {s.get("case") for s in shots}==set(CASES[expected_game]),"Incomplete screenshot cases")
        shot_summary=[]
        for s in shots:
            name=f"screenshots/{target}/{s['case']}.png"
            require(s.get("file")==name and name in files and s.get("package_sha256")==package_hash,"Screenshot path/package mismatch")
            timestamp(s["captured_utc"])
            require(timestamp(r["started_utc"])<=timestamp(s["captured_utc"])<=timestamp(r["finished_utc"]),"Screenshot outside target test window")
            digest=sha(files[name])
            require(s.get("sha256")==digest and digest not in seen_images,"Screenshot digest mismatch or duplicated image")
            seen_images.add(digest);used.add(name)
            size=verify_png(files[name]);require(s.get("pixels")==size,"Screenshot pixel size mismatch")
            shot_summary.append({"case":s["case"],"sha256":digest,"pixels":size})
        report_summary[target]={"tests":len(tests),"screenshots":shot_summary,"runtime_kind":r["runtime_kind"]}
    require(used==set(hashes),"Unexpected evidence payload")
    return {"schema":1,"game":expected_game,"version":expected_version,"source_sha":expected_source,
            "framework_sha":m["framework_sha"],"candidate_run_id":m["candidate_run_id"],
            "adapter_version":m["adapter_version"],"package_sha256":package_hash,
            "bundle_sha256":sha(raw),"targets":report_summary,
            "runtime_audit":{"counts":{k:len(audit[k]) for k in ("wx_apis","sdks","domains","storage_keys","permissions")},"ads":audit["ads"],"payments":audit["payments"],"personal_data":audit["personal_data"]},
            "evidence_integrity":"passed","independent_visual_review":"pending","submission_ready":False}
def pack(root,out):
    # metadata.json is produced by the actual candidate builder, not invented
    # by this tool. Never create device reports or screenshots here.
    root=root.resolve();meta=load((root/"metadata.json").read_bytes())
    require(meta.get("mode")=="real","Pack only real evidence")
    payload={}
    for path in sorted(root.rglob("*")):
        require(not path.is_symlink(),"Symlink in input")
        if not path.is_file() or path==root/"metadata.json":continue
        rel=path.relative_to(root).as_posix();valid_path(rel);require(path.stat().st_size<=MAX_FILE,"Oversize input")
        payload[rel]=path.read_bytes()
    require("candidate.zip" in payload,"Missing candidate package")
    meta["files"]={n:{"sha256":sha(b),"bytes":len(b)} for n,b in payload.items()}
    require(meta.get("package_sha256")==sha(payload["candidate.zip"]),"Metadata package digest differs")
    payload["evidence.json"]=json_bytes(meta)
    buf=io.BytesIO()
    with zipfile.ZipFile(buf,"w",zipfile.ZIP_DEFLATED) as z:
        for n,b in payload.items():z.writestr(n,b)
    result=buf.getvalue();verify_bundle(result,meta["game"],meta["version"],meta["source_sha"])
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open("xb") as f:f.write(result)
def main():
    p=argparse.ArgumentParser()
    sub=p.add_subparsers(dest="cmd",required=True)
    b=sub.add_parser("pack");b.add_argument("--input",type=pathlib.Path,required=True);b.add_argument("--out",type=pathlib.Path,required=True)
    v=sub.add_parser("verify");v.add_argument("--bundle",type=pathlib.Path,required=True);v.add_argument("--game",choices=GAMES,required=True)
    v.add_argument("--out",type=pathlib.Path,required=True)
    a=p.parse_args()
    if a.cmd=="pack":pack(a.input,a.out)
    else:
        result=verify_bundle(a.bundle.read_bytes(),a.game,*GAMES[a.game])
        a.out.parent.mkdir(parents=True,exist_ok=True)
        with a.out.open("xb") as f:f.write(json_bytes(result))
        print(json.dumps(result,ensure_ascii=False))
if __name__=="__main__":main()
