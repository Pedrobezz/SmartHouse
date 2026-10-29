// Novidades de cada versão (a mais nova primeiro). Mostradas depois de uma atualização.
export const CHANGELOG = [
  { version: '2.14.0', date: '2026-10-29', title: 'Mais organizado e mais seguro', items: [
    ['layers', 'Menu Vista', 'Os botões do topo da tela Casa viraram um só: em "Vista" você escolhe 3D ou planta, hora do dia, paredes, rótulos e clima, e começa o passeio. Ficam soltos só o som e o enquadrar.'],
    ['bolt', 'Energia mais clara', 'A aba Energia separa o que é medido do que é estimado, mostra o consumo por cômodo e tem meta do mês: o app avisa no PC e no celular se a projeção passar.'],
    ['bolt', 'Aviso de aparelho sem resposta', 'Quando um aparelho para de responder por mais de 2 minutos ou uma conta desconecta, aparece um aviso vermelho no topo e chega uma notificação no PC e no celular. Dá para desligar em Ajustes → Geral.'],
    ['check', 'Backup da casa', 'Em Ajustes → Geral, exporte planta, cenas, regras, horários, nomes e potências para um arquivo e restaure em outro computador. Senhas e chaves das contas não vão no arquivo.'],
    ['phone', 'App no celular', 'No celular, o SmartHouse mostra como instalar na tela inicial: abre em tela cheia, como um app, com atalhos para Dispositivos e Energia.'],
    ['gear', 'Por dentro', 'Código guardado no GitHub, partes do app separadas e testes automáticos das telas antes de cada versão.'],
  ] },
  { version: '2.13.0', date: '2026-10-28', title: 'Consumo do computador', items: [
    ['display', 'Este computador na aba Energia', 'O SmartHouse estima quanto o seu PC gasta pelo uso do processador e da placa de vídeo, somando placa-mãe, memória, discos e monitores. Toque em "Este computador" na aba Energia para ver o detalhe.'],
    ['bolt', 'Mais preciso quando dá', 'Com placa NVIDIA, usa o consumo real informado por ela. Em notebook fora da tomada, usa a descarga real da bateria. Monitores em descanso quase não contam.'],
    ['gear', 'Ajustes', 'Dá para corrigir o tipo (desktop/notebook), o número de monitores e quantos watts gastam, e a potência máxima do processador e da placa de vídeo.'],
  ] },
  { version: '2.12.0', date: '2026-10-28', title: 'Consumo das lâmpadas', items: [
    ['light', 'Potência em cada luminária', 'Informe quantos watts gasta cada luminária (plafon, spot, pendente…): no painel do interruptor, em "Lâmpadas e consumo", ou na Planta ao selecionar a luminária. Há um botão com o valor típico de LED.'],
    ['bolt', 'Lâmpadas na aba Energia', 'Cada luminária com potência aparece na aba Energia (marcada como estimado) e conta só enquanto a tecla dela está ligada.'],
    ['cube', 'Painel do ar enxuto', 'No painel do ar-condicionado, Consumo estimado, Timers, Mais opções e Avançado ficam recolhidos. Toque no título para abrir.'],
  ] },
  { version: '2.11.0', date: '2026-10-28', title: 'Consumo do ar-condicionado', items: [
    ['bolt', 'Consumo estimado do ar', 'No painel do ar, em "Consumo estimado", informe a potência da etiqueta ou escolha os BTUs (9, 12, 18 ou 24 mil) e se é inverter. O app estima quanto o ar gasta pelo modo, pela diferença entre a temperatura do ambiente e a desejada, e pelo tempo ligado.'],
    ['bolt', 'Na aba Energia', 'O ar entra na aba Energia junto com as tomadas, marcado como "estimado", com consumo das últimas 24 h, custo e projeção do mês.'],
  ] },
  { version: '2.10.1', date: '2026-10-28', title: 'Câmera solta de novo', items: [
    ['cube', 'Girar depois de desmarcar', 'Ao clicar fora da casa para desmarcar um cômodo ou aparelho, a câmera às vezes ficava presa num ângulo e voltava para ele quando você girava. Agora qualquer giro, arraste ou zoom assume o controle na hora.'],
  ] },
  { version: '2.10.0', date: '2026-10-28', title: 'Interruptores de verdade na parede', items: [
    ['light', 'Seis estilos de interruptor', 'Na casa 3D, os interruptores deixaram de ser quadrados: escolha entre vidro preto, vidro branco, clássico, minimalista, redondo e retrô. Cada tecla acende sozinha conforme o canal, e as basculantes e alavancas mudam de posição.'],
    ['plug', 'Tomadas no padrão brasileiro', 'Tomadas inteligentes aparecem como tomada de 3 pinos (branca ou preta) com uma luzinha verde quando ligadas.'],
    ['edit', 'Onde trocar', 'No painel do aparelho, em "Estilo na parede", ou na Planta, ao selecionar o aparelho preso na parede.'],
    ['light', 'Ícone de lâmpada', 'Interruptores e luzes agora mostram uma lâmpada no mapa e nas listas, em vez do símbolo de tomada.'],
  ] },
  { version: '2.9.8', date: '2026-10-28', title: 'Dia com cara de dia', items: [
    ['sun', 'Vista dia no tema escuro', 'No tema escuro, a vista de dia tinha o fundo quase preto e parecia noite. Agora o dia tem fundo claro e quente nos dois temas, e a saudação no topo troca de cor para continuar legível.'],
  ] },
  { version: '2.9.7', date: '2026-10-28', title: 'Painel enxuto e clima na mão', items: [
    ['light', 'Só as teclas à vista', 'No painel do interruptor e da tomada, nomes das teclas, teclas ligadas, configurações e as outras seções ficam recolhidas. Toque no título para abrir; o app lembra o que você deixou aberto.'],
    ['cloud', 'Botão do clima', 'Ao lado do botão de som, escolha o clima da casa 3D: tempo real, céu limpo, nublado, neblina, garoa, chuva, tempestade ou neve. Os sons acompanham.'],
  ] },
  { version: '2.9.6', date: '2026-10-28', title: 'Grupo de luzes numa tecla', items: [
    ['light', 'Uma tecla comanda várias luzes', 'No painel do interruptor, em "também liga", escolha "Um grupo de luzes…" e toque nas teclas de outros interruptores que fazem parte do grupo.'],
    ['power', 'Só desliga, só liga ou junto', 'A tecla pode apagar o grupo inteiro (apertando para qualquer lado), acender o grupo, ou ligar e desligar junto com ela. Os grupos também aparecem em Automações → Teclas ligadas.'],
  ] },
  { version: '2.9.5', date: '2026-10-28', title: 'Sons da casa', items: [
    ['speaker', 'Botão de som', 'Novo botão de alto-falante no canto da tela Casa para silenciar ou voltar os sons do ambiente: chuva, trovão, pássaros e grilos. A escolha fica guardada.'],
    ['sun', 'Pássaros de dia', 'Durante o dia, pássaros cantam baixinho ao redor da casa, com uma brisa leve nas folhas e um bem-te-vi distante de vez em quando.'],
    ['moon', 'Grilos à noite', 'À noite entram grilos suaves. Com chuva, os bichos quase somem e fica só a chuva.'],
  ] },
  { version: '2.9.4', date: '2026-10-28', title: 'Listas legíveis', items: [
    ['gear', 'Contraste nas listas de opções', 'As listas que abrem ao escolher uma opção (como "também liga" nas teclas) agora têm fundo escuro no tema escuro e branco no claro, com a opção escolhida em azul e texto legível.'],
  ] },
  { version: '2.9.3', date: '2026-10-28', title: 'Teclas no estilo Apple', items: [
    ['light', 'Teclas em cápsulas', 'As teclas dos interruptores viraram cápsulas como as da Central de Controle: apagadas são de vidro, acesas ficam branco-quente com a lâmpada amarela. Um toque em qualquer parte da tecla liga ou desliga.'],
    ['mini', 'Mesmo visual na Mini', 'Na Mini, as teclas da lista viraram pílulas com lâmpada e nome inteiro, e o interruptor aberto mostra as mesmas cápsulas.'],
  ] },
  { version: '2.9.2', date: '2026-10-28', title: 'Mini sempre à vista', items: [
    ['mini', 'Mini fixada não some com o Alt+Tab', 'Com a Mini fixada, ela continua por cima das outras janelas mesmo depois de Alt+Tab ou de clicar em outro programa.'],
    ['mini', 'Abrir a Mini traz ela para a frente', 'Pelo botão Mini, pela bandeja ou pelo atalho Ctrl+Shift+M, a Mini sai do minimizado e vem para a frente, mesmo que esteja escondida atrás de outra janela.'],
  ] },
  { version: '2.9.1', date: '2026-10-28', title: 'Painel do aparelho renovado', items: [
    ['grid', 'Mesmo visual da aba Dispositivos', 'O painel que abre ao tocar num aparelho ganhou o fundo em degradê e os cartões de vidro da aba Dispositivos, com botões e campos em pílula, nos temas claro e escuro.'],
    ['sparkles', 'Filtro de cômodos corrigido', 'A aba Dispositivos não fica mais vazia quando o cômodo escolhido no filtro deixa de existir na planta: volta para Todos.'],
  ] },
  { version: '2.9.0', date: '2026-10-28', title: 'Casa em tamanho real e luzes novas', items: [
    ['home', 'Tudo na proporção real', 'A casa agora é desenhada em tamanho real (pé-direito de 2,6 m, ajustável em Planta → Casa): sofás, camas, portas e luminárias com as medidas de verdade, sem achatamento. Use o botão Paredes (corte, meia altura, baixas) para ver dentro dos cômodos.'],
    ['light', 'Luminárias refeitas e 8 novas', 'Pendente globo, trio de pendentes, painel LED, ventilador de teto com luz, luminária de arco, tripé, luminária de mesa articulada e balizador. A aba Luzes mostra cada uma em 3D, acesa.'],
    ['cursor', 'Móveis encostam sozinhos', 'Ao arrastar sofá, cama, rack, estante, bancada e outros para perto da parede, eles encostam e ficam de costas para ela. Segure Alt para posicionar livre.'],
    ['brush', 'Prévia do pincel', 'Com o pincel, passe o mouse na parede ou no piso e veja o acabamento antes de clicar.'],
    ['plan', 'Cliques mais certeiros na Planta', 'Os nomes dos cômodos não atrapalham mais o clique nos móveis, e objetos recém-alterados já podem ser clicados na hora.'],
  ] },
  { version: '2.8.1', date: '2026-10-28', title: 'Planta leve de novo', items: [
    ['bolt', 'Sem travar ao editar', 'Os móveis novos são mais detalhados e eram montados de novo a cada alteração na Planta. Agora cada móvel é montado uma vez e reaproveitado: mexer numa parede não refaz os móveis.'],
    ['sidebar', 'Ícones centralizados', 'Com a barra lateral recolhida, os ícones ficam no centro.'],
  ] },
  { version: '2.8.0', date: '2026-10-28', title: 'Móveis novos e mais bonitos', items: [
    ['home', 'Visual limpo e arredondado', 'Todos os móveis foram refeitos: quinas suaves, almofadas e travesseiros com cantos arredondados, vasos torneados e peças redondas lisas. Sofás e poltronas sem pés, camas com cabeceira, pezeira e lençol colorido.'],
    ['display', 'TV e monitor na proporção certa', 'A TV aparece em 16:9 e o monitor não fica mais esticado na maquete. Vasos, plantas e abajures também mantêm o formato real.'],
    ['drop', 'Cubas de verdade', 'A pia da cozinha tem cuba funda recortada no tampo e torneira de bica alta; o banheiro tem cuba de apoio em forma de tigela.'],
    ['plus', '14 modelos novos', 'Estante de nichos, estante baixa, rack com nichos, puff pera, pufe, mesa lateral, espada-de-são-jorge, floreira, mesa oval, mesa bistrô, mesa com toalha, cama de ferro, armário aéreo e micro-ondas.'],
    ['sidebar', 'Barra lateral ajustada', 'Aberta, ocupa só o espaço dos nomes; recolhida, o item escolhido ganha um anel do tamanho do ícone.'],
  ] },
  { version: '2.7.7', date: '2026-10-28', title: 'Planta sem engasgos', items: [
    ['bolt', 'Editar a planta sem travar', 'Cada alteração na Planta (mover, pintar, mudar medidas) fazia a placa de vídeo recompilar os desenhos e a tela congelava por cerca de um segundo. Agora o desenho é reaproveitado e a mudança aparece na hora.'],
  ] },
  { version: '2.7.6', date: '2026-10-28', title: 'Todos os móveis em low poly', items: [
    ['home', 'Móveis redesenhados', 'Camas, mesas, cadeiras, rack, estante, cozinha, banheiro e lavanderia no mesmo estilo do sofá: faces facetadas, quinas chanfradas, pés de madeira e detalhes como livros, vasinhos, puxadores, abajur no criado-mudo e forno com vidro.'],
    ['plan', 'Miniaturas 3D na lista de móveis', 'Na Planta, a aba Móveis mostra cada móvel em 3D, do jeito que ele fica na casa, em vez do desenho visto de cima.'],
  ] },
  { version: '2.7.5', date: '2026-10-28', title: 'Cortinas', items: [
    ['window', 'Cortina aberta, fechada ou sem cortina', 'Na Planta, selecione uma janela e escolha a cortina: aberta (presa nos cantos), fechada (cobre a janela inteira) ou sem cortina. Com a cortina fechada, o sol não entra por aquela janela no 3D. Janelas internas também podem ter cortina.'],
  ] },
  { version: '2.7.4', date: '2026-10-28', title: 'Paredes que obedecem', items: [
    ['wall', 'Mover parede sem entortar as vizinhas', 'Arrastar uma parede (ou a alça azul do meio dela) move ela em paralelo. As paredes que cruzam a quina continuam retas e só esticam ou encolhem; a continuação da parede fica no lugar. Portas e janelas não escorregam.'],
    ['cursor', 'Bolinhas só mexem a ponta', 'As bolinhas das pontas mexem só aquela ponta da parede selecionada. Selecione duas paredes com Shift + clique e a quina entre elas vira uma bolinha laranja, que move as duas pontas juntas.'],
  ] },
  { version: '2.7.3', date: '2026-10-27', title: 'Sofás novos', items: [
    ['home', 'Sofá, poltrona e sofá em L em low poly', 'Estofados redesenhados com almofadas fofas e facetadas, braços com rolo, encosto inclinado, pés de madeira e almofadas soltas de cor de destaque. A cor escolhida continua valendo.'],
    ['sparkles', 'Móveis não somem mais', 'Corrigido: móveis podiam desaparecer se a casa fosse redesenhada durante a animação de abertura.'],
  ] },
  { version: '2.7.2', date: '2026-10-27', title: 'Construir com mais liberdade', items: [
    ['wall', 'Paredes do jeito que você vê na Minha casa', 'Novo botão ao lado de “Vista dia”: Paredes em corte automático, meia altura, baixas ou inteiras.'],
    ['cursor', 'Mover um cômodo inteiro', 'Na Planta, clique no piso de um cômodo e arraste: ele vai inteiro, com móveis, luzes e aparelhos. Os vizinhos ficam no lugar.'],
    ['cursor', 'Várias paredes de uma vez', 'Shift + clique junta paredes na seleção; arraste uma e todas andam juntas.'],
    ['door', 'Portas: para onde abre e maçaneta', 'Escolha para qual cômodo a porta abre (ou para fora) e de que lado fica a maçaneta.'],
    ['brush', 'Arcos pintados e pincel que gira', 'O arco agora pega a cor e o acabamento de cada lado da parede. Com o pincel ativo, arraste fora das paredes (ou use o botão direito) para girar a casa.'],
    ['window', 'Janelas por dentro', 'Janelas e portas podem ser pegas e arrastadas olhando de dentro do cômodo. O editor abre com as paredes cortadas, para elas ficarem à vista.'],
  ] },
  { version: '2.7.1', date: '2026-10-27', title: 'Spots apagados de verdade', items: [
    ['light', 'Sem cones nos spots desligados', 'O facho de luz dos spots, arandelas e pendentes só aparece quando a luz está acesa. Antes, com a qualidade gráfica alta, ficava um cone escuro mesmo com a luz apagada.'],
  ] },
  { version: '2.7.0', date: '2026-10-27', title: 'Planta em 3D', items: [
    ['cube', 'Construa direto na casa 3D', 'A Planta virou um editor em 3D: erga paredes em qualquer ângulo, ponto a ponto (Shift trava em 45°), ou arraste um cômodo inteiro. Quando as paredes fecham um espaço, o cômodo aparece sozinho. Há uma vista 2D de cima com um clique.'],
    ['wall', 'Cada parede do seu jeito', 'Comprimento, espessura e altura (inteira, meia parede ou mureta) por parede, e acabamento de cada lado: pintura em várias cores, tijolinho, azulejo, madeira, pedra ou cimento. O pincel pinta um lado com um clique, ou o cômodo inteiro com Shift.'],
    ['door', 'Portas e janelas que deslizam', 'Coloque portas (uma ou duas folhas), janelas, arcos e passagens com um clique na parede e arraste para qualquer posição, até para outra parede. Peitoril, altura e largura ajustáveis.'],
    ['divider', 'Divisórias e pisos por área', 'Uma divisória separa áreas do mesmo ambiente (sala + jantar) sem parede. Cada área tem o seu piso e a sua cor de piso.'],
    ['sparkles', 'Sua planta antiga vem junto', 'A planta que você já tinha é convertida automaticamente, com os mesmos cômodos, nomes, portas, móveis, luzes e aparelhos. Desfazer, refazer e salvamento automático continuam.'],
  ] },
  { version: '2.6.4', date: '2026-10-27', title: 'Do jeito brasileiro', items: [
    ['clock', 'Horas e números no padrão brasileiro', 'Campos de hora em 24 horas (06:45 em vez de 06:45 AM) e números com vírgula (0,85), mesmo com o Windows em outro idioma.'],
    ['plug', 'Contas conectadas mais limpas', 'Em Ajustes → Aparelhos e contas, uma conta que já funciona mostra só um resumo (Conectado · quantos aparelhos · quantos pela rede local). As chaves técnicas ficam em “Editar conta”.'],
    ['plan', 'Nomes sem encavalar na Planta', 'Os nomes dos aparelhos procuram um lugar livre (embaixo, em cima ou ao lado) e ganharam um fundo para ler sobre as paredes. A altura aparece só no aparelho selecionado.'],
    ['sparkles', 'Novidades enxutas', 'Esta janela mostra a versão mais recente aberta; as anteriores ficam recolhidas.'],
  ] },
  { version: '2.6.3', date: '2026-10-27', title: 'Mais fácil de usar', items: [
    ['grid', 'Dispositivos mais claro', 'O título agora diz quantos aparelhos estão ligados, e cada filtro de cômodo mostra quantos aparelhos tem.'],
    ['home', 'Nomes legíveis no 3D', 'Os nomes dos cômodos e das áreas na casa 3D ganharam uma pílula discreta e dão para ler sobre qualquer piso.'],
    ['sparkles', 'Automação mais organizada', 'Cada seção tem o seu botão de adicionar (Nova cena, Nova regra, Novo horário), e a Atividade mostra mensagens simples, como “sem internet”.'],
    ['edit', 'Janelas de editar renovadas', 'Cena, regra e agendamento abrem com ícone, botão de fechar, campos maiores e Salvar sempre à vista.'],
    ['gear', 'Ajustes sem barra fixa', 'O botão Salvar e conectar só aparece quando há algo para salvar.'],
  ] },
  { version: '2.6.2', date: '2026-10-27', title: 'Teclas ligadas', items: [
    ['light', 'Um interruptor comandando outro', 'No painel de cada interruptor, em "Teclas ligadas a outros interruptores", escolha qual tecla de outro interruptor muda junto. Exemplo: a 2ª tecla da sala de jantar acende também a outra metade da cozinha. Funciona apertando na parede ou no app, em cerca de 1 segundo.'],
    ['sparkles', 'Nos dois sentidos ou só de um lado', 'Escolha se as duas teclas comandam uma à outra ou se só uma segue a outra. A lista de ligações aparece em Automação → Regras, com liga e desliga.'],
  ] },
  { version: '2.6.1', date: '2026-10-27', title: 'Leve e silencioso', items: [
    ['bolt', 'Muito mais leve', 'A casa 3D só é redesenhada quando algo muda: 60 quadros por segundo enquanto você mexe, cerca de 20 com o ar, a TV ou a chuva animando, e quase nada com tudo parado (antes eram 60 o tempo todo). A sombra de contato pausa enquanto a câmera se move, e a resolução interna em telas grandes ficou limitada. As ventoinhas devem parar de disparar.'],
    ['home', 'Ícone do SmartHouse', 'O programa, o atalho na área de trabalho e o Gerenciador de Tarefas agora mostram o ícone e o nome SmartHouse, em vez do Electron.'],
    ['moon', 'Descanso de tela até você clicar', 'Mexer o mouse não tira mais o descanso de tela: ele fica até você clicar em algo ou apertar uma tecla, e esse clique não seleciona nada na casa.'],
    ['grid', 'Painel do aparelho no estilo Apple', 'O painel que abre ao clicar num aparelho ou cômodo ganhou ícone colorido, seções agrupadas como nos Ajustes do iPhone e campos em cápsula.'],
    ['phone', 'App do celular renovado', 'No iPhone, as abas viraram uma cápsula de vidro flutuante, a tela Casa ficou com a saudação discreta e os cômodos em pílulas, e Automação e Energia vêm no visual novo.'],
  ] },
  { version: '2.6.0', date: '2026-10-27', title: 'Bem-vindo ao SmartHouse', items: [
    ['home', 'Novo nome e nova logo', 'O Casa 3D agora se chama SmartHouse, com um ícone novo no estilo dos apps da Apple. Seus ajustes, chaves, planta e automações continuam todos aqui.'],
    ['plan', 'Planta muito mais fácil', 'Salva sozinha (sem botão de salvar), tem Desfazer e Refazer (Ctrl+Z e Ctrl+Y), atalhos de uma tecla (V selecionar, C cômodo, P parede, J porta e janela) e um guia de primeiros passos. Aparelhos, luzes e móveis entram com um clique, e o item escolhido aparece num cartão com o botão Concluído.'],
    ['sparkles', 'Automação e Energia de vidro', 'As duas telas ganharam o visual da tela Dispositivos: saudação, linha de informações, filtros em pílula, cartões de vidro e uma coluna lateral (Atividade e consumo por aparelho).'],
    ['gear', 'Ajustes organizados', 'Os Ajustes agora têm seções, como no iPad: Geral, Aparência e 3D, Aparelhos e contas, Celular, Atualizações e Avançado, com o botão de salvar sempre à mão.'],
    ['mini', 'Mini no estilo iOS', 'A janela Mini ganhou abas em cápsula, cartões arredondados e o novo nome.'],
    ['grid', 'Cômodos discretos na casa', 'Os cartões embaixo da casa 3D viraram uma barra fina de pílulas: luz acesa, nome, quantos estão ligados e um botão de ligar.'],
  ] },
  { version: '2.5.4', date: '2026-10-27', title: 'Noite cor de café', items: [
    ['moon', 'Fundo da noite quente', 'Na vista noite, o fundo da maquete deixou de ser azul e virou um café escuro, o oposto do creme do dia.'],
    ['home', 'Saudação sem faixa', 'Saiu a faixa clara atrás da saudação da tela Minha casa. O texto agora muda de cor sozinho: claro sobre o fundo escuro da noite e escuro sobre o creme do dia.'],
  ] },
  { version: '2.5.3', date: '2026-10-27', title: 'Nas regras da Apple', items: [
    ['home', 'Topo da casa mais discreto', 'Na tela Minha casa, os cartões de cima viraram uma linha de informações (temperatura, consumo e aparelhos ligados) com a saudação, igual à tela Dispositivos.'],
    ['grid', 'Janela em camadas', 'A área do conteúdo e o painel do cômodo agora são cartões arredondados, separados da barra lateral. No tema escuro a maquete fica sobre um fundo grafite.'],
    ['check', 'Mais acessível', 'Todos os botões têm nome para o Narrador do Windows, o foco do teclado aparece com um contorno azul, os textos pequenos cresceram, os números ficaram mais firmes e os ícones da barra lateral ganharam contraste.'],
    ['plus', 'Tamanho do texto', 'Em Ajustes → Geral dá para deixar o texto menor ou maior. Ctrl + aumenta, Ctrl − diminui e Ctrl 0 volta ao padrão.'],
  ] },
  { version: '2.5.2', date: '2026-10-27', title: 'Jeito de iPad', items: [
    ['grid', 'Barra lateral nova', 'A barra lateral agora flutua com cantos arredondados, e cada tela tem um ícone colorido, como nos Ajustes do iPhone. A tela atual fica marcada em azul.'],
    ['chevronR', 'Recolher a barra lateral', 'O botão ao lado do nome Casa 3D (ou Ctrl+B) recolhe a barra e deixa só os ícones, dando mais espaço para a casa. O app lembra a sua escolha.'],
    ['moon', 'Modo escuro do iOS', 'Fundo preto de verdade com cartões cinza-grafite, títulos grandes em negrito e botões em cápsula. O degradê azul ficou só na tela Dispositivos.'],
  ] },
  { version: '2.5.1', date: '2026-10-27', title: 'Vidro no app inteiro', items: [
    ['sparkles', 'Visual de Dispositivos em todo lugar', 'Energia, Automação, Planta, Ajustes, o painel do cômodo e as janelas agora usam o mesmo vidro fosco sobre degradê da tela Dispositivos, com cantos bem arredondados.'],
    ['grid', 'Botões e menus em pílula', 'Botões, abas, filtros e campos ganharam formato de pílula, e a barra lateral marca a tela atual com uma pílula de vidro.'],
    ['home', 'Cartões sobre a maquete', 'Os cartões por cima da casa 3D usam um vidro mais encorpado, para o texto ficar legível no fundo claro.'],
  ] },
  { version: '2.5.0', date: '2026-10-27', title: 'Casa em maquete', items: [
    ['cube', 'Novo visual de maquete', 'A casa 3D agora parece uma maquete fofa e moderna: base de madeira, paredes creme, piso de madeira quente, luz macia e sombras suaves sobre um fundo claro, em vista isométrica.'],
    ['home', 'Casa de bonecas', 'As paredes externas viradas para você ficam cortadas rentes, mostrando o interior. Ao girar a casa, elas trocam sozinhas.'],
    ['sparkles', 'Detalhes aconchegantes', 'Cortinas e varão nas janelas, móveis com cantos arredondados em nogueira, linho e creme, e poltrona mostarda.'],
    ['grid', 'Pode voltar ao clássico', 'Em Ajustes → Geral → Estilo da casa 3D dá para escolher entre Maquete e Clássico.'],
  ] },
  { version: '2.4.1', date: '2026-10-27', title: 'Atualização na hora', items: [
    ['check', 'Versão nova aparece na hora', 'O app agora consulta direto o último envio no GitHub, sem a cópia guardada que atrasava em até 5 minutos o aviso de atualização.'],
  ] },
  { version: '2.4.0', date: '2026-10-27', title: 'Dispositivos de vidro', items: [
    ['grid', 'Nova tela Dispositivos', 'Cartões de vidro fosco sobre um fundo em degradê, com saudação e indicadores no topo (clima, umidade, consumo e aparelhos ligados) e filtro por cômodo ou área em pílulas.'],
    ['ac', 'Controles no próprio cartão', 'Ar com − temperatura +, tomadas com o consumo e o gráfico do dia, TV com volume e canal, e o botão redondo de ligar em cada cartão.'],
    ['light', 'Seção Luzes', 'Um cartão por tecla de interruptor, com o desenho da luminária ligada a ela na planta (plafon, pendente, spot…), que acende quando a tecla liga.'],
  ] },
  { version: '2.3.5', date: '2026-10-27', title: 'Mini que se abre', items: [
    ['mini', 'Cartões que expandem no Mini', 'Na janela Mini, ao passar o mouse num ar-condicionado ele se abre com o ar em 3D animado e os controles de modo, ventilação, sono e direção. Nos interruptores aparecem as teclas basculantes. Os outros aparelhos descem com animação.'],
  ] },
  { version: '2.3.4', date: '2026-10-27', title: 'Luz que respeita as paredes', items: [
    ['light', 'Paredes bloqueiam a luz', 'As luzes das lâmpadas e dos cômodos agora fazem sombra: não atravessam mais as paredes e só passam por portas, arcos, passagens e janelas. O brilho no piso também para na parede.'],
    ['bolt', 'Mais leve', 'As sombras só são recalculadas quando algo muda (uma luz acende, uma porta abre, o sol anda), deixando o 3D mais leve no resto do tempo.'],
  ] },
  { version: '2.3.3', date: '2026-10-26', title: 'Turbo do ar LG', items: [
    ['bolt', 'Turbo liberado para tentar', 'Em ares LG que não declaram o Turbo (Jet) na API, o botão agora fica ativo: o app envia o comando e confere se o ar entrou em Turbo. Se o modelo não aceitar, o botão é desativado e o app avisa.'],
  ] },
  { version: '2.3.2', date: '2026-10-26', title: 'Cada área como um cômodo', items: [
    ['grid', 'Áreas do ambiente unido viram cômodos', 'Ao clicar numa parte do ambiente unido (no 3D, no nome dela ou na faixa de baixo), só aquela área fica selecionada: o 3D destaca e mostra o nome dela, e o painel lista só os aparelhos dela, com liga/desliga próprio.'],
    ['chevronR', 'Ver o ambiente inteiro', 'No painel da área, o link "parte de …" abre o ambiente inteiro com todas as áreas.'],
  ] },
  { version: '2.3.1', date: '2026-10-26', title: 'Ambientes por área', items: [
    ['grid', 'Ambiente unido dividido por área', 'Num ambiente unido (ex.: sala + jantar + cozinha), o painel mostra o nome do ambiente e cada área com os seus aparelhos e o seu liga/desliga. Clicar numa parte do piso no 3D abre direto naquela área. Na tela Dispositivos também aparece separado.'],
    ['close', 'Clicar fora desmarca', 'Clicar fora da casa fecha o painel e desmarca o cômodo ou aparelho.'],
    ['check', 'Mais simples', 'A área externa e o passeio pela casa foram removidos.'],
  ] },
  { version: '2.3.0', date: '2026-10-26', title: 'Uma casa de verdade', items: [
    ['sun', 'O dia passando', 'Ao trocar entre dia, noite e automático, o tempo corre: o sol anda, as sombras giram, entardece e as luzes da casa aparecem, com um relógio grande mostrando a hora.'],
    ['light', 'Raios de sol pelas janelas', 'De dia, fachos de luz entram pelas janelas que dão para fora, iluminam o piso e mostram a poeira flutuando.'],
    ['home', 'Telhado', 'De longe a casa aparece fechada com telhado de telhas. Ao aproximar (ou clicar nele) o telhado levanta e revela o interior. Também aparece na abertura do app.'],
    ['cube', 'Planta 2D ↔ 3D', 'Botão "Planta 2D" no topo do mapa: a câmera vai para cima, paredes e móveis achatam e vira planta baixa. "Ver em 3D" volta com animação.'],
    ['sparkles', 'Etiquetas e contorno', 'Ao passar o mouse num aparelho, aparece um cartão de vidro com os dados (e o gráfico de consumo das tomadas), e o objeto ganha um contorno luminoso.'],
    ['speaker', 'Sons', 'Clique das teclas, bip do ar-condicionado, chuva baixinha quando está chovendo e trovão na tempestade. Pode desligar em Ajustes → Geral.'],
  ] },
  { version: '2.2.1', date: '2026-10-26', title: 'Cômodo com controles de verdade', items: [
    ['grid', 'Painel do cômodo redesenhado', 'Ao clicar num cômodo, cada aparelho aparece com o seu visual: o ar com a temperatura grande, + e −, modo, ventilação, Turbo e Eco; os interruptores com as teclas basculantes; a TV com volume e canais; e as tomadas com o consumo.'],
    ['chevronR', 'Controle completo a um toque', 'A setinha de cada cartão abre o painel completo do aparelho.'],
  ] },
  { version: '2.2.0', date: '2026-10-26', title: 'Casa 3D cinematográfica', items: [
    ['sparkles', 'Abertura animada', 'Ao abrir o app, a câmera desce girando, as paredes sobem do chão e os móveis pousam em sequência.'],
    ['sun', 'Sol e lua de verdade', 'O sol segue o horário real da sua cidade: as sombras giram ao longo do dia, o fim de tarde fica dourado e à noite vem o luar com estrelas. Em Planta → Paredes, aponte o norte da casa.'],
    ['drop', 'Clima real', 'Chuva, garoa, neblina, nuvens e até relâmpagos no 3D conforme o tempo lá fora, e a temperatura de fora no topo da tela.'],
    ['focus', 'Foco no cômodo', 'Ao escolher um cômodo, o resto da casa desfoca e escurece, as paredes da frente abaixam e as portas dele se abrem.'],
    ['door', 'Portas e janelas', 'Portas com folha que abre ao passar o mouse e janelas com vidro (nova opção em Planta → Porta / janela), que brilham à noite quando o cômodo está aceso.'],
    ['plan', 'Acabamento', 'Rodapé, textura de reboco nas paredes, porcelanato e cimento queimado com reflexo, e tratamento de imagem com vinheta e cor de cinema.'],
    ['fan', 'Aparelhos animados', 'A aleta do ar abre (e balança no modo vaivém), a tela da TV acende e a hélice do ventilador gira.'],
    ['moon', 'Descanso de tela', 'Com o app parado, a casa gira devagar e aparece um relógio grande. Ajuste em Ajustes → Geral.'],
    ['grid', 'Interface com movimento', 'Números que contam ao mudar, cartões e painéis que entram com efeito de mola.'],
  ] },
  { version: '2.1.5', date: '2026-10-26', title: 'Novidades à vista', items: [
    ['sparkles', 'Atualização disponível', 'Quando sai uma versão nova, aparece um aviso azul no topo do app com o progresso do download. Clique nele para ver o que mudou e atualizar.'],
    ['check', 'O que há de novo', 'Depois de cada atualização, esta janela mostra o que mudou. Para rever depois: Ajustes → Atualizações → Ver novidades.'],
    ['clock', 'Procura mais frequente', 'O app procura versões novas a cada hora (antes eram 6 horas).'],
  ] },
  { version: '2.1.4', date: '2026-10-26', title: 'Atualização com um clique', items: [
    ['check', 'Atualizador novo', 'O app procura versões novas sozinho, baixa, confere o arquivo e instala com um clique em "Reiniciar e atualizar". Se algo falhar, ele mostra o motivo.'],
  ] },
  { version: '2.1.1', date: '2026-10-26', title: 'Cada luminária na sua tecla', items: [
    ['light', 'Escolha da tecla mais clara', 'Em "Acende com", cada tecla do interruptor aparece separada (ex.: "Interruptor Sala · Spots"). Luminárias sem tecla ficam marcadas em laranja.'],
    ['grid', 'Resumo por tecla', 'Ao selecionar um interruptor na planta, aparece quantas luminárias cada tecla acende.'],
  ] },
  { version: '2.1.0', date: '2026-10-22', title: 'Teclas de verdade e luminárias', items: [
    ['power', 'Tecla com profundidade', 'A tecla basculante afunda de um lado e levanta do outro, como uma tecla real, com a borda e a luz-guia acesas quando está ligada.'],
    ['light', 'Luminárias na planta', 'Plafon, pendente, spot, trilho, lustre, fita LED, arandela, luminária de chão e abajur, cada uma ligada à tecla certa. No 3D só elas acendem, com facho e luz no piso.'],
  ] },
  { version: '2.0.0', date: '2026-10-22', title: 'Casa 3D no iPhone', items: [
    ['phone', 'Controle pelo celular', 'Em casa ou na rua (pelo Tailscale), com mapa 3D, aparelhos, cenas e regras. Configure em Ajustes → Celular.'],
    ['bolt', 'Avisos no iPhone', 'As regras com "me avisar" podem chegar no celular pelo app ntfy.'],
  ] },
  { version: '1.9.0', date: '2026-10-22', title: 'Infravermelho', items: [
    ['tv', 'TV e ar antigo', 'O controle universal Positivo entra no app: controle remoto completo da TV e painel do ar-condicionado antigo.'],
  ] },
];

const newer = (a, b) => { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); return false; };
// versões publicadas depois de "seen" e até a atual
export function notesSince(seen, current) {
  return CHANGELOG.filter(c => !newer(c.version, current) && (!seen || newer(c.version, seen)));
}
