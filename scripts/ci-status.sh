#!/bin/bash
# Wait until the latest GitHub Actions run of surt91/COIL completes, then print
# "<status> <conclusion> <url>". Run it in the background after a push.
for i in $(seq 1 60); do
  out=$(curl -s "https://api.github.com/repos/surt91/COIL/actions/runs?per_page=1")
  st=$(echo "$out" | python3 -c "import sys,json; d=json.load(sys.stdin); r=(d.get('workflow_runs') or [{}])[0]; print(r.get('status','none'), r.get('conclusion'), r.get('html_url'), d.get('message',''))")
  case "$st" in completed*|none*) echo "$st"; exit 0;; esac
  sleep 10
done
echo "timeout: $st"
