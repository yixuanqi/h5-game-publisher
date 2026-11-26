"""Validate a candidate-run artifact using GitHub metadata; no deployment."""
import argparse
import json
import os
import pathlib
import subprocess
from wechat_evidence_contract import GAMES,ID,COMMIT,HEX,require,sha,unpack,verify_bundle,json_bytes
REPO="yixuanqi/h5-game-publisher"
def api(path):return json.loads(subprocess.check_output(["gh","api",f"repos/{REPO}/{path}"]))
def check_candidate_run(run,run_id):
    require(str(run["id"])==run_id and run["path"]==".github/workflows/wechat-candidate.yml","Not the real WeChat candidate workflow")
    require(run["head_repository"]["full_name"]==REPO and run["head_branch"]=="main" and run["event"]=="workflow_dispatch","Untrusted candidate run")
    require(run["status"]=="completed" and run["conclusion"]=="success" and run["run_attempt"]==1,"Candidate run must be fresh and successful")
    require(COMMIT.fullmatch(run["head_sha"]),"Invalid framework commit")
def main():
    p=argparse.ArgumentParser();p.add_argument("--game",choices=GAMES,required=True);p.add_argument("--run-id",required=True);p.add_argument("--artifact-id",required=True);p.add_argument("--out",type=pathlib.Path,required=True)
    a=p.parse_args();require(ID.fullmatch(a.run_id) and ID.fullmatch(a.artifact_id),"Invalid run/artifact ID")
    run=api(f"actions/runs/{a.run_id}");check_candidate_run(run,a.run_id)
    artifact=api(f"actions/artifacts/{a.artifact_id}")
    require(str(artifact["id"])==a.artifact_id and str(artifact["workflow_run"]["id"])==a.run_id and artifact["workflow_run"]["head_sha"]==run["head_sha"],"Artifact not bound to candidate run")
    require(not artifact["expired"] and artifact["name"]==f"wechat-candidate-input-{a.game}-{a.run_id}","Wrong candidate artifact")
    digest=artifact.get("digest","");require(digest.startswith("sha256:") and HEX.fullmatch(digest[7:]),"Missing Actions artifact digest")
    require(artifact["size_in_bytes"]<=256*1024*1024,"Oversize artifact")
    raw=subprocess.check_output(["gh","api",f"repos/{REPO}/actions/artifacts/{a.artifact_id}/zip"])
    require(sha(raw)==digest[7:],"Actions artifact digest mismatch")
    files=unpack(raw);require(set(files)=={"wechat-evidence.zip"},"Unexpected candidate artifact layout")
    bundle=files["wechat-evidence.zip"];r=verify_bundle(bundle,a.game,*GAMES[a.game])
    require(r["candidate_run_id"]==a.run_id and r["framework_sha"]==run["head_sha"],"Candidate provenance mismatch")
    a.out.mkdir(parents=True,exist_ok=False)
    (a.out/"wechat-evidence.zip").write_bytes(bundle)
    r["candidate_artifact_id"]=a.artifact_id;r["candidate_artifact_sha256"]=digest[7:]
    (a.out/"verification.json").write_bytes(json_bytes(r))
    print(json.dumps({"game":a.game,"evidence_integrity":"passed","submission_ready":False,"bundle_sha256":r["bundle_sha256"]}))
if __name__=="__main__":main()
