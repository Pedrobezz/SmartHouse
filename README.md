# SmartHouse

App de casa inteligente para Windows (Electron + three.js): casa em 3D com a planta real, interruptores e tomadas Tuya/Smart Life, Sonoff (eWeLink), ar-condicionado LG ThinQ, controle infravermelho, cenas, regras, horários, consumo de energia e acesso pelo celular.

- **`main`** (este ramo): código-fonte.
- **`updates`**: instalador mais recente; o app instalado baixa as atualizações de lá.

Nenhuma senha ou chave fica no código: as contas são guardadas só no computador de quem usa o app.

## Rodar

```
npm install
npm start          # abre o app
node --test test/*.mjs   # testes
npm run dist       # gera o instalador do Windows
```
