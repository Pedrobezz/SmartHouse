#!/bin/bash
# Gera o instalador e publica no ramo "updates" do GitHub (o app instalado baixa de lá)
set -e
cd "$(dirname "$0")"
V=$(node -p "require('./package.json').version")
rm -rf dist && WINEDEBUG=-all npm run dist >/dev/null 2>&1
U=../smarthouse-updates
[ -d "$U/.git" ] || { git init -q -b updates "$U"; git -C "$U" remote add origin https://github.com/Pedrobezz/smarthouse; }
cd "$U"
git checkout -q --orphan tmp-$$ && (git rm -rq --cached . >/dev/null 2>&1 || true)
rm -f Casa3D-Setup-*.exe* SmartHouse-Setup-*.exe* latest.yml changelog.json
cp ../casa-app/dist/{SmartHouse-Setup-$V.exe,SmartHouse-Setup-$V.exe.blockmap,latest.yml} .
node --input-type=module -e "import('../casa-app/renderer/changelog.js').then(m => process.stdout.write(JSON.stringify(m.CHANGELOG, null, 1)))" > changelog.json
printf "Arquivos de atualização do SmartHouse (o app baixa daqui automaticamente). Só a versão mais recente fica neste ramo.\n" > README.md
git add -A
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -qm "SmartHouse $V

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WQQhsfPuVF5Fifemc3v6SJ"
git branch -D updates -q 2>/dev/null || true
git branch -m updates
git push -f origin updates 2>&1 | tail -1
echo "Publicado $V"
