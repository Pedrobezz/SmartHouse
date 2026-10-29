# SmartHouse: central da casa inteligente para Windows

Controle as tomadas Ekaza (plataforma Tuya / Smart Life) e o ar-condicionado LG (ThinQ) em um app só, com um mapa 3D da sua casa.

## Como usar

1. Abra o **SmartHouse-2.6.4-portable.exe**. Não precisa instalar. Na primeira vez o Windows pode mostrar "O Windows protegeu o computador", porque o app não tem assinatura digital. Clique em **Mais informações → Executar assim mesmo**.
2. O app abre em **modo demonstração**, com uma casa e aparelhos simulados, para você explorar.
3. Vá em **Ajustes** (engrenagem) e configure as contas:
   - **Tuya / Ekaza:** crie um projeto grátis em platform.tuya.com (Data Center *Western America*), vincule o app Smart Life pelo QR code e cole o *Access ID* e o *Access Secret*. O passo a passo completo está dentro do app.
   - **LG ThinQ:** gere um *Personal Access Token* em connect-pat.lgthinq.com com a sua conta LG e cole no app. País: BR.
   - Desligue o **modo demonstração** e clique em **Salvar e conectar**.
4. Vá em **Planta** e desenhe a sua casa:
   - **Cômodo:** arraste para desenhar cada ambiente. A grade é de 25 cm, e você pode digitar as medidas exatas na lateral.
   - **Porta:** clique numa parede para abrir uma porta e clique de novo para fechar.
   - **Aparelhos:** arraste da lista lateral para o lugar real. O ar-condicionado encaixa sozinho na parede mais próxima.
   - **Cômodo em L ou integrado** (sala + jantar + cozinha): desenhe as partes, segure **Shift**, clique em cada uma e use **Unir em um só cômodo**. As paredes entre elas somem e o app passa a tratar tudo como um ambiente só.
   - **Parede:** desenha uma parede avulsa, por exemplo um trecho que avança sem fechar o cômodo.
   - **Porta / arco:** clique numa parede para abrir um vão e escolha na lateral entre **Porta**, **Arco** ou **Passagem livre**, além da largura.
   - **Altura dos aparelhos:** selecione o aparelho e defina a altura do chão (Tomada baixa 0,3 m, Interruptor 1,2 m, Ar 2,2 m…) e se ele fica **preso na parede**.
   - **Áreas de um ambiente unido:** cada parte mantém o próprio nome (ex.: Sala de estar, Jantar, Cozinha) e o ambiente inteiro tem outro nome (ex.: Área social). No 3D aparece uma divisa sutil no piso.
   - **Piso:** escolha por área entre Madeira, Porcelanato, Cerâmica, Cimento queimado, Carpete ou Liso.
   - **Móveis:** na aba **Móveis** do painel lateral, arraste sofás, camas, mesas, cozinha, banheiro etc. para a planta. Selecione um móvel para girar (tecla **R**), mudar largura e profundidade, trocar a cor, duplicar ou excluir.
   - O **controle deslizante de altura das paredes** (aba Paredes) muda o quanto as paredes sobem no 3D.
   - Em **Ajustes → Qualidade gráfica do 3D** dá para escolher Alta, Média ou Leve (para PCs mais fracos).
   - Clique em **Salvar planta**.

## Aparência

- Visual inspirado no macOS e no app Casa da Apple: barra lateral translúcida, blocos que ficam brancos quando o aparelho está ligado, chaves no estilo iOS e tipografia Inter.
- Em **Ajustes → Geral → Aparência**: Automática (segue o Windows), Clara ou Escura. A janela Mini acompanha.

## O que o app faz

- **Casa:** visão 3D de cima, em perspectiva. O piso de cada cômodo acende quando há algo ligado nele: azul quando o ar está refrigerando, laranja no aquecimento e amarelo para as tomadas. Clique num cômodo para ver e controlar tudo o que tem nele, ou clique num aparelho para abrir o controle dele.
- **Ar-condicionado:** liga e desliga, temperatura (slider e botões + e −), modo, ventilação, direção das aletas (vertical e horizontal), Eco, modo Sono, timers para ligar e desligar, luz do display e funções especiais do modelo. A seção **Avançado** lista automaticamente todas as funções graváveis que o seu aparelho LG expõe na API.
- **Interruptores de várias teclas:** aparecem como um espelho de parede de verdade. Toque na metade de cima da tecla para ligar e na de baixo para desligar. A tecla se mexe como uma tecla basculante real: o lado apertado afunda e o outro levanta, então dá para ver de longe qual está ligada (ela também fica com a borda e a luz-guia acesas). Os nomes de cada tecla podem ser editados no painel.
- **Luminárias:** em **Planta → Luzes**, arraste para o lugar real cada lâmpada da casa: plafon, pendente, spot embutido, trilho de spots, lustre, fita LED, arandela, luminária de chão ou abajur. Em cada uma, escolha em **Acende com** o interruptor e a tecla (ex.: "Interruptor Sala · Spots"), além da cor da luz (quente, neutra ou fria). No 3D, quando você liga a tecla, só as luminárias dela acendem, com o facho e a luz no piso no lugar certo. Clicar numa luminária no 3D abre o interruptor dela. Na planta, uma linha tracejada liga cada luminária ao seu interruptor.
- **Turbo (Jet) do ar:** botão Turbo ao lado do Eco, quando o modelo expõe essa função na API da LG. Em Avançado → Copiar perfil dá para ver tudo que o aparelho oferece.
- **Tomadas:** liga e desliga, potência em tempo real (W), tensão, corrente, consumo acumulado (kWh), custo, gráfico de 24 h, timer para desligar, comportamento quando a energia volta e trava infantil.
- **Automação:** cenas (por exemplo "Dormir" ou "Sair de casa") e agendamentos por horário e dia da semana. Os agendamentos rodam sozinhos com o app na bandeja do Windows.
- **Energia:** consumo agora, nas últimas 24 h, custo e projeção para o mês, com ranking por aparelho.

## Regras "se → então"

- Em **Automação → Regras**, crie regras como "se a cafeteira ficar ligada por 60 min, desligar e me avisar", "se a temperatura da sala passar de 27°, ligar o ar em 23°", "ao pôr do sol, acender o abajur" ou "se algum aparelho ficar offline, avisar".
- **SE:** estado de um aparelho (ligado/desligado, consumo em W, temperatura ambiente ou ajustada, online/offline) mantido por X minutos, ou nascer do sol, pôr do sol ou horário fixo.
- **SÓ SE:** faixa de horário, dias da semana e um tempo mínimo antes de repetir.
- **ENTÃO:** qualquer comando de aparelho, cômodo ou cena, ou uma **notificação no Windows**.
- Há modelos prontos com um clique. A localização usada para nascer e pôr do sol fica em **Ajustes → Geral** (padrão: São Paulo).

## Novidades da versão 2.6

- O app agora se chama **SmartHouse** e tem logo nova. Ajustes, chaves e planta continuam os mesmos.
- **Planta mais fácil:** salva sozinha, tem Desfazer e Refazer (Ctrl+Z e Ctrl+Y), atalhos de uma tecla (V, C, P, J), primeiros passos e clique para adicionar aparelhos, luzes e móveis.
- Automação e Energia no visual de vidro da tela Dispositivos; Ajustes separados por seção; janela Mini no estilo iOS; cômodos da tela Minha casa em pílulas finas.

## Estilo maquete (versão 2.5)

- A casa 3D aparece como uma maquete: base de madeira, paredes creme, piso de madeira quente, móveis arredondados e cortinas nas janelas, com luz macia sobre fundo claro e câmera isométrica.
- As paredes externas viradas para a câmera ficam cortadas rentes (casa de bonecas) e trocam ao girar.
- Para voltar ao visual antigo: Ajustes → Geral → Estilo da casa 3D → Clássico.

## Visual cinematográfico (versão 2.2)

- **Abertura animada:** a câmera desce girando e as paredes sobem do chão ao abrir o app.
- **Sol e lua de verdade:** o sol segue o horário e a localização (Ajustes → Geral). Em **Planta → Paredes → Direção do norte**, gire até a seta laranja apontar para o norte real da casa, para as sombras baterem com a realidade.
- **Clima real:** chuva, garoa, neblina, nuvens e relâmpagos conforme o tempo lá fora (dados do Open-Meteo, sem cadastro). Pode desligar em Ajustes → Geral.
- **Foco no cômodo:** o resto da casa desfoca, as paredes da frente abaixam e as portas abrem.
- **Portas e janelas:** na ferramenta **Porta / janela**, escolha Janela e defina peitoril e topo. Nas portas dá para inverter o lado da dobradiça.
- **Descanso de tela:** parado por alguns minutos, a casa gira devagar e aparece um relógio grande. Mexa o mouse para voltar.

## Mais realismo (versão 2.3)

- **O dia passando:** trocar entre Dia, Noite e Automático faz o tempo correr até a hora escolhida (Dia = 13h, Noite = 22h, Automático = agora).
- **Raios de sol:** entram pelas janelas que dão para fora quando o sol bate daquele lado.
- **Telhado:** fecha a casa quando você afasta a câmera e levanta ao aproximar ou clicar.
- **Planta 2D:** botão no topo do mapa.
- **Ambientes unidos:** cada área (ex.: Sala, Jantar, Cozinha) aparece com os seus aparelhos dentro do ambiente. Dê nome ao ambiente inteiro e a cada área na Planta.
- **Clicar fora da casa** desmarca o cômodo ou aparelho.
- **Etiquetas, contorno e sons:** passe o mouse num aparelho para ver os dados. Sons, telhado e raios de sol podem ser desligados em Ajustes → Geral.

## Vista noite e animações

- O botão **Dia/noite** na tela Casa alterna entre automático (segue o nascer e o pôr do sol), dia e noite. À noite a casa escurece e só os cômodos com algo ligado acendem.
- Ao ligar um aparelho, uma onda de luz se espalha pelo cômodo. Ao desligar, ela se recolhe.

## Atualizar o app já instalado

Feche o SmartHouse pela bandeja do Windows (clique com o botão direito no ícone perto do relógio → **Sair**) e abra o novo **SmartHouse-Setup-x.y.z.exe**. Ele substitui a versão instalada no mesmo lugar e mantém tudo: planta, luminárias, cenas, regras, contas e chaves (ficam em `%APPDATA%\SmartHouse`).

## Atualizações automáticas

- Funciona no app instalado com o **SmartHouse-Setup.exe** (a versão portátil não se atualiza sozinha).
- As versões novas são publicadas no repositório **Pedrobezz/SmartHouse** (ramo `updates`). O app procura ao abrir e a cada 6 horas; em **Ajustes → Atualizações → Verificar agora** dá para procurar na hora.
- Quando encontra, baixa em segundo plano, confere se o arquivo veio inteiro e mostra **Reiniciar e atualizar**. Um clique: o app fecha, instala em silêncio e abre de novo, com tudo mantido.

## Mini Casa (janela compacta, estilo miniplayer)

- Abra pelo botão **Mini** no topo do app, pelo menu da bandeja do Windows ou com **Ctrl+Shift+M** (o mesmo atalho fecha).
- Fica **sempre por cima** das outras janelas. O ícone de alfinete liga e desliga isso.
- Abas: **Favoritos** (marque com a estrela), **Cômodos** (tudo agrupado, com liga/desliga por cômodo) e **Cenas**.
- Ar-condicionado com temperatura +/−, liga/desliga, modo, ventilação, Eco e Sono. Interruptores de várias teclas mostram um botão por tecla.
- Arraste pelo topo para mover e pelas bordas para redimensionar. O app lembra a posição e o tamanho.

## Tomadas pela rede local (sem depender da nuvem)

- Em **Ajustes → Tomadas no seu Wi-Fi → Procurar**, o app lista todas as tomadas Tuya/Ekaza que encontrar na rede, com IP e versão do protocolo.
- Cada tomada só aceita comandos criptografados com uma chave própria (a *local key*), que fica guardada na nuvem da Tuya. Na primeira vez que você conecta a nuvem Tuya, o app baixa essas chaves e **guarda neste PC**.
- Depois disso o controle é feito **direto pelo Wi-Fi**: é mais rápido, funciona sem internet e continua funcionando mesmo se o acesso grátis da Tuya expirar. Se quiser, ative **Somente rede local** para o app nunca mais usar a nuvem.
- Se você já tiver a local key de alguma tomada (de outra ferramenta, como o tinytuya), pode colar direto na lista da busca.
- Se uma tomada parar de responder depois de ser **reconfigurada no app do celular**, a chave dela mudou. Conecte a nuvem de novo uma vez para atualizar.

## Interruptores Sonoff (eWeLink)

1. Crie uma conta em **dev.ewelink.cc** e, em *My Center → Settings*, peça a conta de desenvolvedor (a aprovação pode levar alguns dias).
2. Em **Console → Create**, crie um app do tipo **OAuth2.0** / **Standard Role**, com Redirect URL `https://127.0.0.1/casa3d`.
3. No SmartHouse, vá em **Ajustes → Sonoff**, cole o **APPID** e o **APP SECRET** e clique em **Entrar com eWeLink**. Faça login com a mesma conta do app eWeLink.
4. O app baixa a chave de cada aparelho e passa a controlar **direto pelo Wi-Fi** (modo LAN da eWeLink). Interruptores de várias teclas (como o TX3C) aparecem com um botão por tecla, usando os nomes definidos no app eWeLink.

Observação: o token da eWeLink vale cerca de 1 mês e o app da plataforma cerca de 1 ano. O controle local continua funcionando com a chave salva; só é preciso entrar de novo se você trocar o interruptor de conta ou reconfigurá-lo.

## SmartHouse no iPhone (em casa e na rua)

O PC vira a central da casa e o iPhone abre o próprio SmartHouse pelo navegador, com mapa 3D, aparelhos, ar, TV, interruptores, cenas, regras e energia. A planta e os Ajustes continuam só no PC.

1. No PC: **Ajustes → Celular (iPhone)**, ligue a chave e clique em **Salvar e conectar**. Se o Windows perguntar sobre o firewall, marque **Redes privadas** e **Redes públicas** e clique em **Permitir**.
2. **Em casa:** com o iPhone no mesmo Wi-Fi, aponte a câmera para o QR code **Rede de casa** e toque no link.
3. **Fora de casa:** instale o **Tailscale** no PC (tailscale.com/download) e no iPhone (App Store) e entre com a **mesma conta** nos dois. Volte em Ajustes → Celular: aparece o QR code **Tailscale**. Leia esse, que funciona em casa e na rua. No iPhone, deixe o Tailscale ligado (ele quase não gasta bateria).
4. No Safari, toque em **Compartilhar → Adicionar à Tela de Início**. O SmartHouse vira um ícone e abre em tela cheia, como um app.
5. **Notificações:** instale o app **ntfy** no iPhone, toque em **+** e assine um tópico com nome difícil de adivinhar (ex.: `casa3d-k29fj3x8`). Digite o mesmo tópico em Ajustes → Celular e toque em **Testar**. As regras com "me avisar" passam a chegar no celular.

Segurança: o acesso exige uma chave secreta que vai dentro do QR code; senhas e chaves das contas (Tuya, LG, eWeLink) nunca saem do PC. Se perder o celular, use **Trocar chave de acesso** para desconectar todos. Pelo Tailscale nada fica aberto na internet.

Requisitos: o PC precisa ficar ligado com o SmartHouse aberto (pode estar na bandeja). A opção **Impedir que o PC entre em suspensão** evita que ele "durma"; a tela pode apagar normalmente. Ative também **Iniciar com o Windows** para o app voltar sozinho depois de uma queda de energia.

## Controle infravermelho Positivo (TV e ar antigo)

O **Smart Controle Universal Positivo** é um aparelho Tuya, então entra no app pela mesma conta Smart Life:

1. No app **Positivo Casa Inteligente**, remova o controle universal. Depois, no **Smart Life**, adicione-o de novo e recrie lá os controles da TV e dos ares (escolha a marca e teste as teclas).
2. Em **platform.tuya.com → seu projeto → Service API → Go to Authorize**, assine o serviço **IR Control Hub Open Service** (grátis).
3. No SmartHouse, clique em **Salvar e conectar** em Ajustes → Tuya. Cada controle vira um aparelho:
   - **TV:** controle remoto completo (liga/desliga, volume, canais, mudo, setas e OK, voltar, início, menu, entrada, teclado numérico e todas as outras teclas aprendidas).
   - **Ar-condicionado antigo:** o mesmo painel do ar LG, com liga/desliga, temperatura, modo e ventilação. A temperatura ambiente vem do sensor do próprio controle.
4. Posicione a TV e os ares na **Planta** e use-os em **cenas**, **agendamentos** e **regras** como qualquer outro aparelho.

Observações: o infravermelho é de mão única, então o app **presume** o estado (ligado/desligado, temperatura) a partir do último comando enviado. Se alguém usar o controle físico, o app não fica sabendo. O comando passa pela nuvem Tuya, então precisa de internet. O controle precisa "enxergar" a TV e os ares (sem obstáculos).

## Detalhes técnicos

- As tomadas usam a OpenAPI da nuvem Tuya. Quando estão na mesma rede, o app também conecta **localmente pelo Wi-Fi** (com a biblioteca tuyapi), o que é mais rápido e funciona sem internet. Se a conexão local falhar, ele volta automaticamente para a nuvem.
- O ar LG usa a API oficial **ThinQ Connect**.
- Os dados ficam em `%APPDATA%\casa-3d\casa3d.json` e não são enviados a lugar nenhum além das APIs da Tuya e da LG.

## Rodar a partir do código-fonte

```
npm install
npm start          # abre o app
npm run dist       # gera o .exe em dist/
```
Requer Node.js 20 ou mais recente.
