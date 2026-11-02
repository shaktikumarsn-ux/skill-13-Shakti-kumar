#!/usr/bin/env bash
# anime-reel dependency check / install. Safe to re-run.
#   bash setup.sh            check + install anything missing
#   bash setup.sh --check    check only (exit 1 if something is missing)
set -u
CHECK_ONLY=0; [ "${1:-}" = "--check" ] && CHECK_ONLY=1
missing=0
ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { printf '  \033[31mmiss\033[0m %s\n' "$1"; missing=1; }
PIP="python3 -m pip install --quiet"
python3 -m pip install --help 2>/dev/null | grep -q break-system-packages && PIP="$PIP --break-system-packages"

echo "anime-reel setup"
# ffmpeg
if command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null; then ok "ffmpeg $(ffmpeg -version | head -1 | awk '{print $3}')"
else bad "ffmpeg"; if [ $CHECK_ONLY = 0 ]; then
  if command -v apt-get >/dev/null; then sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg; elif command -v brew >/dev/null; then brew install ffmpeg; fi; fi; fi
# node
if command -v node >/dev/null; then ok "node $(node -v)"
else bad "node"; if [ $CHECK_ONLY = 0 ]; then
  if command -v apt-get >/dev/null; then sudo apt-get install -y -qq nodejs npm; elif command -v brew >/dev/null; then brew install node; fi; fi; fi
# playwright + chromium
if node -e "require('playwright')" 2>/dev/null || node -e "require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright')" 2>/dev/null; then
  if node -e "const p=(()=>{try{return require('playwright')}catch(e){return require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright')}})();p.chromium.launch().then(b=>b.close()).then(()=>process.exit(0),()=>process.exit(1))" 2>/dev/null; then ok "playwright + chromium"
  else bad "chromium for playwright"; [ $CHECK_ONLY = 0 ] && npx -y playwright install chromium; fi
else bad "playwright"; [ $CHECK_ONLY = 0 ] && npm install -g playwright && npx -y playwright install chromium; fi
# python deps
if python3 -c "import numpy" 2>/dev/null; then ok "numpy"; else bad "numpy"; [ $CHECK_ONLY = 0 ] && $PIP numpy; fi
if python3 -W ignore -c "import torch, torchaudio; torchaudio.pipelines.MMS_FA; from torchaudio.functional import forced_align" 2>/dev/null; then
  ok "torch $(python3 -c 'import torch;print(torch.__version__)' 2>/dev/null) / torchaudio (MMS_FA)"
else bad "torch/torchaudio with MMS_FA"; [ $CHECK_ONLY = 0 ] && $PIP "torch==2.8.0" "torchaudio==2.8.0"; fi
if python3 -c "import uroman" 2>/dev/null; then ok "uroman"; else bad "uroman"; [ $CHECK_ONLY = 0 ] && $PIP uroman; fi
# MMS_FA weights (downloaded once from dl.fbaipublicfiles.com, ~1.2 GB)
W="${MMS_FA_MODEL_DIR:-$HOME/.cache/torch/hub/checkpoints}/model.pt"
if [ -s "$W" ]; then ok "MMS_FA weights ($W)"
else bad "MMS_FA weights not cached yet ($W)"
  if [ $CHECK_ONLY = 0 ]; then
    python3 -W ignore -c "import torchaudio; torchaudio.pipelines.MMS_FA.get_model(with_star=False)" >/dev/null 2>&1 \
      && ok "MMS_FA weights downloaded" \
      || echo "       could not download — allow dl.fbaipublicfiles.com or copy model.pt into \$MMS_FA_MODEL_DIR"
  fi
fi
[ $CHECK_ONLY = 1 ] && exit $missing
exit 0
