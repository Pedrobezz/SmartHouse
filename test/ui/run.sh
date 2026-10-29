#!/bin/bash
# Testes de tela: abre o SmartHouse num monitor virtual (xvfb) e roda os roteiros com Playwright.
# Precisa de: xvfb-run, python3 com playwright. Uso: npm run test:ui
cd "$(dirname "$0")/../.."
xvfb-run -a -s "-screen 0 1600x1000x24" ./node_modules/.bin/electron . --no-sandbox --remote-debugging-port=9222 >/dev/null 2>&1 &
APP=$!
for i in $(seq 1 30); do curl -s http://127.0.0.1:9222/json >/dev/null 2>&1 && break; sleep 1; done
sleep 6
st=0
echo "== telas principais"; python3 test/ui/telas.py || st=1
echo "== funções"; python3 test/ui/funcoes.py || st=1
pkill -f "electron/dis[t]" 2>/dev/null; kill $APP 2>/dev/null
exit $st
