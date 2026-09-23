/*
 * Language support (English source strings → Brazilian Portuguese).
 *
 * The UI is written in English. When Portuguese is active:
 *   - configuration labels (variables, views, element types, source groups, menus) are translated once,
 *   - every text node / title / placeholder added to the page is translated by a MutationObserver,
 *   - chart options are translated before being drawn (GV.i18n.chart),
 *   - numbers use the Brazilian format (1.234,5).
 * Switch with the PT/EN button in the toolbar. To translate a new string, add it to DICT.
 */
(function () {
  'use strict';
  var I = GV.i18n = {};
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem('gv:lang')); } catch (e) { /* ignore */ }
  I.lang = stored || 'pt';
  I.locale = I.lang === 'pt' ? 'pt-BR' : 'en-US';
  I.setLang = function (l) { try { localStorage.setItem('gv:lang', JSON.stringify(l)); } catch (e) { /* ignore */ } location.reload(); };

  var MONTHS = { Jan: 'jan', Feb: 'fev', Mar: 'mar', Apr: 'abr', May: 'mai', Jun: 'jun', Jul: 'jul', Aug: 'ago', Sep: 'set', Oct: 'out', Nov: 'nov', Dec: 'dez' };

  var DICT = {
    "shown on the map": "exibidos no mapa",
    "Show / hide all listed elements": "Mostrar / ocultar todos os elementos listados",
    "All shown": "Todos exibidos",
    "All hidden": "Todos ocultos",
    "Show all": "Mostrar todos",
    "Show on the map": "Mostrar no mapa",
    "Checkbox: show or hide the element in this layer · Click: select and go to · Ctrl/Shift+click: add to the selection.": "Caixa: mostra ou oculta o elemento nesta camada · Clique: seleciona e centraliza · Ctrl/Shift+clique: adiciona à seleção.",
    "Clear": "Limpar",
    "Elements of this layer": "Elementos desta camada",
    "Edit": "Editar",
    "elements": "elementos",
    "hidden by the layer filter": "ocultos pelo filtro da camada",
    "outside the global filters": "fora dos filtros globais",
    "Search in this layer…": "Buscar nesta camada…",
    "Sort": "Ordenar",
    "Value ↓": "Valor ↓",
    "Value ↑": "Valor ↑",
    "Name A–Z": "Nome A–Z",
    "Clear selection": "Limpar seleção",
    "Zoom": "Zoom",
    "Zoom to the listed elements": "Aproximar dos elementos listados",
    "No element matches the search.": "Nenhum elemento corresponde à busca.",
    "No element in this layer.": "Nenhum elemento nesta camada.",
    "Click: select and go to · Ctrl/Shift+click or checkbox: add to the selection.": "Clique: seleciona e centraliza · Ctrl/Shift+clique ou caixa: adiciona à seleção.",
    "assets": "ativos",
    "asset": "ativo",
    "Production and supply": "Produção e oferta",
    "full": "cheio",
    "deficit": "déficit",
    "No pipelines, sea routes or converters at this node.": "Nenhum duto, rota marítima ou conversor neste nó.",
    "Storage: positive = discharge into the network, negative = injection into storage.": "Armazenamento: positivo = descarga para a rede, negativo = injeção no armazenamento.",
    "Mode": "Modo",
    "Colour": "Cor",
    "Field": "Campo",
    "Range": "Faixa",
    "Stroke": "Traço",
    "Solid": "Contínua",
    "Dashed": "Tracejada",
    "Dotted": "Pontilhada",
    "Fields": "Campos",
    "Text size": "Tamanho",
    "Visible from": "Visível a partir",
    "zoom": "zoom",
    "Add condition": "Adicionar condição",
    "Add layer": "Adicionar camada",
    "Save view…": "Salvar vista…",
    "Manage views": "Gerenciar vistas",
    "Preferences": "Preferências",
    "Preferences…": "Preferências…",
    "All preferences": "Todas as preferências",
    "Map": "Mapa",
    "Appearance": "Aparência",
    "Animation": "Animação",
    "Interaction": "Interação",
    "Analysis": "Análise",
    "Data & reset": "Dados e redefinição",
    "Arcs": "Arcos",
    "Basemap place names": "Nomes de lugares no mapa base",
    "Basemap": "Mapa base",
    "Both": "Ambos",
    "Clicking a node opens": "Clicar em um nó abre",
    "Colour and size scales": "Escalas de cor e tamanho",
    "Dark": "Escuro",
    "Light": "Claro",
    "System": "Sistema",
    "Animate arrows along the flow direction": "Animar setas no sentido do fluxo",
    "Animations follow the system “reduce motion” setting.": "As animações respeitam a configuração “reduzir movimento” do sistema.",
    "Each arc layer can also switch its own animation on or off in the layer editor.": "Cada camada de arcos também pode ligar ou desligar sua própria animação no editor da camada.",
    "Fast": "Rápida",
    "Slow": "Lenta",
    "Normal": "Normal",
    "Speed": "Velocidade",
    "Flow units": "Unidade de fluxo",
    "Marginal cost units": "Unidade de custo marginal",
    "Hover tooltips": "Dicas ao passar o mouse",
    "Show a summary when hovering elements": "Mostrar um resumo ao passar o mouse sobre os elementos",
    "Keep scales fixed across periods": "Manter escalas fixas entre períodos",
    "Language": "Idioma",
    "Loaded cases": "Casos carregados",
    "Moving flow arrows": "Setas de fluxo em movimento",
    "No reference geometry loaded: pipelines are drawn straight. Load EPE shapefiles via Open case.": "Nenhuma geometria de referência carregada: dutos desenhados em linha reta. Carregue os shapefiles da EPE em Abrir caso.",
    "Panel layout": "Layout dos painéis",
    "Parallel pipelines": "Dutos paralelos",
    "gap (px)": "espaçamento (px)",
    "Pipeline routes from the reference data are turned off.": "Os traçados dos dutos da base de referência estão desligados.",
    "Pipeline trace": "Traçado dos dutos",
    "Pipelines that share the same route (or the same two nodes) are drawn side by side with this gap.": "Dutos que compartilham o mesmo traçado (ou os mesmos dois nós) são desenhados lado a lado com este espaçamento.",
    "Popup on the map": "Pop-up no mapa",
    "Properties panel": "Painel de propriedades",
    "Real (EPE)": "Real (EPE)",
    "Reduced motion": "Movimento reduzido",
    "Reference data": "Dados de referência",
    "Reset all preferences": "Redefinir todas as preferências",
    "Reset classes": "Redefinir classes",
    "Reset every preference (layers, panels, units, theme)? Saved views are kept.": "Redefinir todas as preferências (camadas, painéis, unidades, tema)? As vistas salvas são mantidas.",
    "Reset panel layout": "Redefinir layout dos painéis",
    "Saved views and annotations are kept.": "Vistas salvas e anotações são mantidas.",
    "Show city and country names": "Mostrar nomes de cidades e países",
    "Show state boundaries": "Mostrar divisas estaduais",
    "State boundaries": "Divisas estaduais",
    "Straight": "Retas",
    "The page reloads to apply the language.": "A página é recarregada para aplicar o idioma.",
    "The same colour means the same value in every period, so animations and comparisons are not distorted.": "A mesma cor significa o mesmo valor em todos os períodos, para que animações e comparações não sejam distorcidas.",
    "Theme": "Tema",
    "Upper bound of each class. Used by the map, legend, tables and charts.": "Limite superior de cada classe. Usado pelo mapa, legenda, tabelas e gráficos.",
    "Utilization classes": "Classes de carregamento",
    "Your system asks for reduced motion: animations are paused.": "Seu sistema pede movimento reduzido: as animações estão pausadas.",
    "Close": "Fechar",
    "Reset all": "Redefinir tudo",
    "Reset": "Redefinir",
    "Reset filters": "Redefinir filtros",
    "Reset this filter": "Redefinir este filtro",
    "Remove every filter": "Remover todos os filtros",
    "No active filters": "Nenhum filtro ativo",
    "Filtered-out elements stay faintly visible on the map and are removed from tables.": "Elementos filtrados ficam esmaecidos no mapa e saem das tabelas.",
    "Collapse": "Recolher",
    "Expand": "Expandir",
    "Float this panel": "Destacar este painel",
    "Map & display preferences…": "Preferências de mapa e exibição…",
    "Animate arrows (moving along the flow)": "Animar setas (movendo no sentido do fluxo)",
    "Clear conditions": "Limpar condições",
    "Dock left": "Encaixar à esquerda",
    "Dock right": "Encaixar à direita",
    "Dock bottom": "Encaixar embaixo",
    "No panel docked here. Use the Panels menu or drag a panel to that edge.": "Nenhum painel encaixado aqui. Use o menu Painéis ou arraste um painel para essa borda.",
    // ---- toolbar / general
    'Gas Network Explorer': 'Explorador da Rede de Gás', 'Case': 'Caso', 'Scenario': 'Cenário', 'Period': 'Período', 'Block': 'Bloco', 'View': 'Vista', 'Compare': 'Comparar',
    'Off': 'Desligado', 'vs previous period': 'vs período anterior', 'vs period': 'vs período', 'vs case': 'vs caso',
    'All (hours-weighted)': 'Todos (ponderado por horas)', 'Single block': 'Bloco único', 'Mean of scenarios': 'Média dos cenários', 'Median (P50)': 'Mediana (P50)',
    'Search nodes, pipelines, assets…  (Ctrl+K)': 'Buscar nós, gasodutos, ativos…  (Ctrl+K)', 'Search': 'Buscar',
    'Units ▾': 'Unidades ▾', 'Display units': 'Unidades de exibição', 'Panels ▾': 'Painéis ▾', 'Panels': 'Painéis', 'Open case ▾': 'Abrir caso ▾',
    'Show / hide panels, reset layout': 'Mostrar / ocultar painéis, restaurar layout', 'Map only (M)': 'Só o mapa (M)', 'Map only': 'Só o mapa',
    'Toggle left dock ( [ )': 'Mostrar/ocultar lateral esquerda ( [ )', 'Toggle right dock ( ] )': 'Mostrar/ocultar lateral direita ( ] )', 'Toggle bottom dock ( \\ )': 'Mostrar/ocultar painel inferior ( \\ )',
    'Light / dark theme': 'Tema claro / escuro', 'Copy link to this view': 'Copiar link desta vista', 'Help and shortcuts (?)': 'Ajuda e atalhos (?)',
    'Add an annotation (N)': 'Adicionar anotação (N)', 'Export map figure (PNG / SVG)': 'Exportar figura do mapa (PNG / SVG)',
    'SDDP case folder…': 'Pasta de caso SDDP…', 'Dataset, GeoJSON or shapefiles (.json / .geojson / .shp+.dbf)…': 'Dataset, GeoJSON ou shapefiles (.json / .geojson / .shp+.dbf)…',
    'Save current case as dataset (.json)': 'Salvar caso atual como dataset (.json)', 'Save as team-library file (.case.js)': 'Salvar como arquivo da biblioteca da equipe (.case.js)', 'Close current case': 'Fechar caso atual',
    'Flow': 'Fluxo', 'Marginal cost': 'Custo marginal', 'Clicking a node opens': 'Clicar em um nó abre', 'Popup on the map': 'Popup no mapa', 'Properties panel': 'Painel de propriedades', 'Both': 'Ambos', 'Reset panel layout': 'Restaurar layout dos painéis',
    'Previous period (←)': 'Período anterior (←)', 'Next period (→)': 'Próximo período (→)',
    'Open an SDDP gas-network case': 'Abra um caso SDDP de rede de gás', 'Open case folder…': 'Abrir pasta do caso…', 'Open dataset (.json)…': 'Abrir dataset (.json)…',
    'Pick the case folder (the one that contains': 'Escolha a pasta do caso (a que contém',
    'and the result CSVs), or drag folders onto this window. Files are read locally in your browser and are not uploaded anywhere.': 'e os CSVs de resultados), ou arraste pastas para esta janela. Os arquivos são lidos localmente no navegador e não são enviados para lugar nenhum.',
    'To compare cases, open several folders. To share a pre-loaded case with your team, see': 'Para comparar casos, abra várias pastas. Para compartilhar um caso pré-carregado com a equipe, veja',
    'Drop SDDP case folder(s), a dataset (.json) or pipeline geometry (.geojson)': 'Solte pasta(s) de caso SDDP, um dataset (.json) ou geometria de dutos (.geojson)',
    // ---- KPIs / chips
    'Supply': 'Oferta', 'Demand': 'Demanda', 'Arcs ≥ 95%': 'Arcos ≥ 95%', 'Violations': 'Violações', 'Deficit': 'Déficit', 'Click to filter': 'Clique para filtrar',
    'Production + LNG supply': 'Produção + oferta de GNL', 'City-gates + thermal plants': 'City-gates + térmicas', 'Min–max over nodes with positive marginal cost': 'Mín–máx dos nós com custo marginal positivo',
    'Comparison': 'Comparação', 'Highlight': 'Destaque', 'Remove filter': 'Remover filtro', 'Pick destination node…': 'Escolha o nó de destino…', 'Pick element to compare…': 'Escolha o elemento para comparar…', 'Click on the map to place the note…': 'Clique no mapa para posicionar a nota…',
    // ---- timeline
    'Play (Space)': 'Reproduzir (Espaço)', 'Pause (Space)': 'Pausar (Espaço)', 'Animation speed': 'Velocidade da animação', 'Click: go to period · Shift+click: set analysis range': 'Clique: ir ao período · Shift+clique: definir intervalo de análise', 'Clear analysis range': 'Limpar intervalo de análise',
    // ---- docks / panels
    'Layers': 'Camadas', 'Filters': 'Filtros', 'Legend': 'Legenda', 'Properties': 'Propriedades', 'Data checks': 'Verificação de dados', 'Tables & charts': 'Tabelas e gráficos',
    'Float this panel': 'Flutuar este painel', 'Panel position': 'Posição do painel', 'Dock left': 'Acoplar à esquerda', 'Dock right': 'Acoplar à direita', 'Dock bottom': 'Acoplar embaixo', 'Float': 'Flutuar', 'Close panel': 'Fechar painel', 'Close': 'Fechar', 'Collapse': 'Recolher', 'Expand': 'Expandir',
    'Drag to move · double-click to float': 'Arraste para mover · duplo clique para flutuar', 
    // ---- layers panel
    'Display': 'Exibição', 'Pipeline trace': 'Traçado dos dutos', 'Real (EPE)': 'Real (EPE)', 'Straight': 'Retas', 'Arcs': 'Arcos', 'Basemap': 'Mapa de fundo', 'Light': 'Claro', 'Dark': 'Escuro', 'Satellite': 'Satélite', 'Terrain': 'Relevo', 'None': 'Nenhum',
    'State boundaries': 'Limites estaduais', 'Keep colour and size scales fixed across periods': 'Manter escalas de cor e tamanho fixas entre períodos',
    'Pipeline routes from the reference data are turned off.': 'Os traçados reais da referência estão desligados.',
    'No reference geometry loaded: pipelines are drawn straight. Load EPE shapefiles via Open case.': 'Nenhuma geometria de referência carregada: dutos desenhados em reta. Carregue os shapefiles da EPE em Abrir caso.',
    'Save view…': 'Salvar vista…', 'Manage views': 'Gerenciar vistas', '+ Note': '+ Nota', 'Export figure…': 'Exportar figura…',
    'Save the current layers, filters, period, map position and notes': 'Salvar camadas, filtros, período, posição do mapa e notas atuais', 'Pin a text note on the map (N)': 'Fixar uma nota de texto no mapa (N)', 'Export the map as PNG / SVG': 'Exportar o mapa como PNG / SVG',
    '+ Add layer': '+ Adicionar camada', 'Custom (edited)': 'Personalizada (editada)', 'Choose a view…': 'Escolha uma vista…', 'Built-in': 'Padrão', 'Team views': 'Vistas da equipe', 'My views': 'Minhas vistas',
    'Arcs – pipelines, sea routes, regas': 'Arcos – dutos, rotas marítimas, regaseificação', 'Nodes (buses)': 'Nós (barras)', 'Reference data': 'Dados de referência', 'Reference data (EPE)': 'Dados de referência (EPE)', 'Assets at nodes': 'Ativos nos nós', 'Arcs (pipelines, sea routes, regas)': 'Arcos (dutos, rotas marítimas, regaseificação)',
    'The top of the list is drawn on top. Drag ⠿ to reorder. The same element type can be added several times, each with its own filter, colours, sizes and labels.': 'O topo da lista é desenhado por cima. Arraste ⠿ para reordenar. O mesmo tipo de elemento pode ser adicionado várias vezes, cada uma com seu filtro, cores, tamanhos e rótulos.',
    'No layers. Add one with “+ Add layer” or pick a view.': 'Nenhuma camada. Adicione com “+ Adicionar camada” ou escolha uma vista.',
    'Drag to reorder': 'Arraste para reordenar', 'Show / hide': 'Mostrar / ocultar', 'Labels on/off': 'Rótulos liga/desliga', 'Edit layer': 'Editar camada', 'Layer menu': 'Menu da camada', 'Double-click to rename': 'Duplo clique para renomear',
    'Duplicate': 'Duplicar', 'Move up': 'Mover para cima', 'Move down': 'Mover para baixo', 'Zoom to layer': 'Zoom na camada', 'Select all shown elements': 'Selecionar todos os elementos exibidos', 'Delete layer': 'Excluir camada',
    'Elements': 'Elementos', 'Sum per node': 'Soma por nó', 'One symbol per asset': 'Um símbolo por ativo', 'Dataset': 'Conjunto de dados', 'Keep at least one type': 'Mantenha pelo menos um tipo',
    'Filter (inputs or results)': 'Filtro (entradas ou resultados)', '+ Add condition': '+ Adicionar condição', 'Remove condition': 'Remover condição', 'contains': 'contém', 'and': 'e',
    'Line colour': 'Cor da linha', 'Symbol colour': 'Cor do símbolo', 'Line width (px)': 'Espessura da linha (px)', 'Symbol size (px)': 'Tamanho do símbolo (px)',
    'Single colour': 'Cor única', 'By data': 'Por dado', 'Fixed': 'Fixo', 'Palette': 'Paleta', 'Automatic': 'Automática', 'Utilization classes': 'Classes de carregamento', 'Blues': 'Azuis', 'Yellow–red': 'Amarelo–vermelho', 'Purples': 'Roxos', 'Diverging (− / +)': 'Divergente (− / +)',
    'Flow arrows': 'Setas de fluxo', 'Show direction arrows': 'Mostrar setas de sentido', 'Line style': 'Estilo da linha', 'solid': 'contínua', 'dashed': 'tracejada', 'dotted': 'pontilhada', 'Animate flow': 'Animar fluxo', '× arrow': '× seta',
    'Symbol': 'Símbolo', 'Shape': 'Forma', 'Position': 'Posição', 'Outline': 'Contorno', 'Custom': 'Personalizado', 'dist.': 'dist.',
    'circle': 'círculo', 'square': 'quadrado', 'triangle': 'triângulo', 'diamond': 'losango', 'hexagon': 'hexágono', 'star': 'estrela', 'Pie chart of gas origin': 'Pizza da origem do gás',
    'Position around the node, so several symbols can share one node': 'Posição ao redor do nó, para vários símbolos compartilharem a mesma barra',
    'Pie slices show the gas origin mix (source groups in js/config.js).': 'As fatias mostram a composição da origem do gás (grupos de fontes em js/config.js).',
    'Labels': 'Rótulos', 'Show labels on the map': 'Mostrar rótulos no mapa', '+ add field…': '+ adicionar campo…', 'size': 'tamanho', 'from zoom': 'a partir do zoom',
    'Layer': 'Camada', 'Opacity': 'Opacidade', 'Visible from zoom': 'Visível a partir do zoom', 'Show in legend': 'Mostrar na legenda',
    'Results': 'Resultados', 'Inputs & attributes': 'Entradas e atributos', 'Attributes': 'Atributos',
    // ---- legend
    'States': 'Estados', 'Selected': 'Selecionado', 'Highlighted': 'Destacado', 'Out of service': 'Fora de operação', 'Filtered out': 'Filtrado', 'No visible layers.': 'Nenhuma camada visível.',
    'Click to show only this class (global filter)': 'Clique para mostrar só esta classe (filtro global)', 'Gas origin': 'Origem do gás',
    'low': 'baixo', 'moderate': 'moderado', 'high': 'alto', 'near limit': 'próximo ao limite', 'violation': 'violação',
    // ---- filters panel
    'Active filters': 'Filtros ativos', 'Clear all': 'Limpar tudo', 'No filters. Filtered-out elements stay faintly visible on the map and are removed from tables.': 'Sem filtros. Elementos filtrados ficam esmaecidos no mapa e saem das tabelas.',
    'Region': 'Região', 'Arc type': 'Tipo de arco', 'Nodes with asset type': 'Nós com tipo de ativo', 'Values (current period)': 'Valores (período atual)', 'Status': 'Situação',
    'Only capacity violations and deficits': 'Só violações de capacidade e déficits', 'Only arcs in service in this period': 'Só arcos em operação neste período', 'Name or ID': 'Nome ou ID', 'e.g. GASBOL, N13, UTE': 'ex.: GASBOL, N13, UTE',
    'Violations / deficits only': 'Só violações / déficits', 'In service only': 'Só em operação', 'min': 'mín', 'max': 'máx',
    // ---- properties
    'Case overview': 'Visão geral do caso', 'Overview': 'Visão geral', 'Assets': 'Ativos', 'Balance': 'Balanço', 'Time series': 'Séries temporais', 'Connections': 'Conexões', 'Metadata': 'Metadados', 'Capacity use': 'Uso da capacidade',
    'Most loaded arcs': 'Arcos mais carregados', 'Recurring bottlenecks (≥ 95%)': 'Gargalos recorrentes (≥ 95%)', 'all periods': 'todos os períodos', 'Marginal cost ranking': 'Ranking de custo marginal', 'Deficits': 'Déficits', 'Data warnings': 'Avisos dos dados',
    'No arc reaches 95% utilization in any block.': 'Nenhum arco atinge 95% de carregamento em algum bloco.',
    'Click an element on the map to inspect it. Ctrl+click or Shift+drag to select several and compare. Right-click for network analysis (upstream, downstream, paths).': 'Clique em um elemento do mapa para inspecioná-lo. Ctrl+clique ou Shift+arrastar para selecionar vários e comparar. Botão direito para análise da rede (montante, jusante, caminhos).',
    'Zoom to': 'Aproximar', 'Copy ID': 'Copiar ID', 'Clear selection (Esc)': 'Limpar seleção (Esc)', 'Clear selection': 'Limpar seleção',
    'Net injection': 'Injeção líquida', 'Injection': 'Injeção', 'Withdrawal': 'Retirada', 'Pipeline inflow': 'Entrada por dutos', 'Pipeline outflow': 'Saída por dutos', 'Thermal consumption': 'Consumo térmico',
    'Production + LNG supply + storage discharge': 'Produção + GNL + descarga de armazenamento', 'City-gates + thermal plants + storage charge': 'City-gates + térmicas + carga de armazenamento',
    'Marginal cost over time': 'Custo marginal ao longo do tempo', 'Gas origin (mix at the node)': 'Origem do gás (mistura no nó)', 'Location': 'Localização', 'Latitude': 'Latitude', 'Longitude': 'Longitude', 'Code': 'Código', 'Process': 'Processo', 'Associated assets': 'Ativos associados',
    'No assets associated with this node.': 'Nenhum ativo associado a este nó.',
    'Nodal balance': 'Balanço nodal', 'Regasification in': 'Entrada por regaseificação', 'Production': 'Produção', 'LNG supply': 'Oferta de GNL', 'Storage discharge': 'Descarga de armazenamento', 'To regasification': 'Para regaseificação', 'City-gates': 'City-gates', 'Thermal plants': 'Térmicas', 'Storage charge': 'Carga de armazenamento',
    'Local flow diagram': 'Diagrama de fluxo local', 'Main individual sources': 'Principais fontes individuais', 'Origin of the gas delivered to each demand': 'Origem do gás entregue a cada demanda', 'Origin over time': 'Origem ao longo do tempo',
    'No gas flows through this element in the selected period.': 'Não passa gás por este elemento no período selecionado.',
    'Supply and demand': 'Oferta e demanda', 'Connected arcs': 'Arcos conectados', 'Neighbour nodes': 'Nós vizinhos', 'Network analysis': 'Análise da rede',
    'Capacity': 'Capacidade', 'Utilization': 'Carregamento', 'Idle capacity': 'Capacidade ociosa', 'Peak block util.': 'Carreg. no bloco de pico', 'Δ marginal cost': 'Δ custo marginal',
    'Capacity dual': 'Dual de capacidade', 'Congestion rent': 'Renda de congestionamento', 'P(util ≥ 95 %)': 'P(carreg. ≥ 95 %)', 'Capacity in the flow direction': 'Capacidade no sentido do fluxo',
    'Marginal cost at destination minus origin (congestion signal)': 'Custo marginal no destino menos na origem (sinal de congestionamento)', 'Capacity dual × flow': 'Dual de capacidade × fluxo',
    'Value of one more unit of capacity: (1 − loss) × CMg(destination) − CMg(origin) − tariff, positive only when the arc limits the flow (implied by the LP optimality conditions). For arcs out of service it is the value of building them.': 'Valor de uma unidade adicional de capacidade: (1 − perda) × CMg(destino) − CMg(origem) − tarifa; positivo só quando o arco limita o fluxo (condições de otimalidade do PL). Para arcos fora de operação, é o valor de construí-los.',
    'Gas origin (composition of the flow)': 'Origem do gás (composição do fluxo)', 'Flow vs capacity over time': 'Fluxo vs capacidade ao longo do tempo', 'Characteristics': 'Características', 'Type': 'Tipo', 'From': 'De', 'To': 'Para',
    'Capacity from→to': 'Capacidade origem→destino', 'Capacity to→from': 'Capacidade destino→origem', '— (unidirectional)': '— (unidirecional)', 'Length': 'Extensão', 'Efficiency': 'Eficiência', 'Loss from→to': 'Perda origem→destino', 'Transport cost': 'Custo de transporte',
    'Hours': 'Horas', 'Util.': 'Carreg.', 'Hours ≥ 95%': 'Horas ≥ 95%', 'Hours > 100%': 'Horas > 100%', 'Utilization duration curve': 'Curva de permanência do carregamento', 'Congestion (all periods)': 'Congestionamento (todos os períodos)', 'Congestion in range': 'Congestionamento no intervalo',
    'Flow and utilization': 'Fluxo e carregamento', 'Marginal cost at both ends': 'Custo marginal nas duas pontas', 'Capacity dual and congestion probability': 'Dual de capacidade e probabilidade de congestionamento',
    'Origin node': 'Nó de origem', 'Destination node': 'Nó de destino', 'Highlight upstream': 'Destacar montante', 'Highlight downstream': 'Destacar jusante', 'Compare with…': 'Comparar com…', 'No flow': 'Sem fluxo', '(reverse)': '(reverso)',
    'Consumption': 'Consumo', 'Discharge (+) / charge (−)': 'Descarga (+) / carga (−)', 'Of max production': 'Da produção máxima', 'Max production': 'Produção máxima', 'Level': 'Nível', 'Fill (of max)': 'Enchimento (do máx.)', 'Origin of the gas consumed': 'Origem do gás consumido', 'Value': 'Valor',
    'Multi-selection': 'Seleção múltipla', 'Compare in table': 'Comparar em tabela', 'Filter to selection': 'Filtrar pela seleção', 'Zoom to selection': 'Zoom na seleção', 'Variable': 'Variável', 'Sum': 'Soma', 'Mean': 'Média', 'Min': 'Mín', 'Max': 'Máx',
    'Source': 'Fonte', 'Model': 'Modelo', 'Loaded': 'Carregado', 'Name': 'Nome',
    'Initial status': 'Situação inicial', 'Existing': 'Existente', 'Future': 'Futuro', 'Modifications': 'Modificações', 'Cost from→to': 'Custo origem→destino', 'Cost to→from': 'Custo destino→origem', 'Loss to→from': 'Perda destino→origem', 'Route match': 'Casamento do traçado',
    'Min production': 'Produção mínima', 'Production cost': 'Custo de produção', 'Segment': 'Segmento', 'Elastic': 'Elástica', 'Source type': 'Tipo de fonte', 'Yes': 'Sim', 'No': 'Não',
    'Min storage': 'Armazenamento mínimo', 'Max storage': 'Armazenamento máximo', 'Initial storage': 'Armazenamento inicial', 'Charge eff.': 'Efic. de carga', 'Discharge eff.': 'Efic. de descarga', 'Input capacity': 'Capacidade de entrada', 'Capacity factor': 'Fator de capacidade',
    // ---- popup
    'Transport in': 'Transporte – entrada', 'Transport out': 'Transporte – saída', 'Regasification': 'Regaseificação', 'Production / supply': 'Produção / oferta', 'Storage': 'Armazenamento', 'Direction': 'Sentido', 'Ends': 'Extremidades',
    'Upstream': 'Montante', 'Downstream': 'Jusante', 'Details': 'Detalhes', 'Value of +1 unit of capacity': 'Valor de +1 unidade de capacidade', 'Node': 'Nó',
    // ---- tables / charts / compare
    'Pipelines': 'Gasodutos', 'Nodes': 'Nós', 'Charts': 'Gráficos', 'Rows: matching filters': 'Linhas: que passam nos filtros', 'Rows: all': 'Linhas: todas', 'Rows: selected only': 'Linhas: só selecionadas', 'Show rows': 'Linhas exibidas',
    'No grouping': 'Sem agrupamento', 'Group rows': 'Agrupar linhas', 'Columns': 'Colunas', 'Export CSV': 'Exportar CSV', 'filter…': 'filtrar…',
    'Columns: use the ☰ menu in any column header to show or hide columns': 'Colunas: use o menu ⋮ do cabeçalho para mostrar ou ocultar colunas', 'Use the ⋮ menu on a column header to show or hide columns': 'Use o menu ⋮ do cabeçalho para mostrar ou ocultar colunas',
    'No rows (check filters or the “Show” option)': 'Sem linhas (verifique os filtros ou a opção “Linhas”)',
    'ID': 'ID', 'Dir.': 'Sent.', 'Peak block util.': 'Carreg. no bloco de pico', 'Hours ≥95%': 'Horas ≥95%', 'P(util ≥ 95%)': 'P(carreg. ≥ 95%)', 'Main origin': 'Origem principal', 'Rev. capacity': 'Capacidade reversa', 'Normal': 'Normal', 'Near limit': 'Próximo ao limite', 'Violation': 'Violação', 'off': 'fora',
    'Thermal': 'Térmicas', 'Production / consumption': 'Produção / consumo', 'Of max': 'Do máx.', 'Storage level': 'Nível de armazenamento', 'Δ Flow': 'Δ Fluxo', 'Δ Util.': 'Δ Carreg.', 'Δ Marg. cost': 'Δ Custo marg.', 'Δ Withdrawal': 'Δ Retirada', 'Δ Value': 'Δ Valor',
    'Chart': 'Gráfico', 'Supply and demand mix over time': 'Composição de oferta e demanda ao longo do tempo', 'Gas origin → destination (Sankey)': 'Origem → destino do gás (Sankey)', 'Gas delivered by origin over time': 'Gás entregue por origem ao longo do tempo',
    'Capacity duals and congestion rent': 'Duais de capacidade e renda de congestionamento', 'Storage and linepack levels': 'Níveis de armazenamento e linepack', 'Utilization histogram': 'Histograma de carregamento', 'Congestion vs marginal-cost spread': 'Congestionamento vs diferencial de custo marginal',
    'Utilization duration curves': 'Curvas de permanência do carregamento', 'Marginal cost by node over time': 'Custo marginal por nó ao longo do tempo', 'Time series of selection': 'Séries temporais da seleção', 'Case / scenario comparison': 'Comparação entre casos / cenários',
    'Selected arcs.': 'Arcos selecionados.', 'Six most loaded arcs (select arcs to choose).': 'Os seis arcos mais carregados (selecione arcos para escolher).',
    'Select elements on the map (Ctrl+click or Shift+drag) to plot them here.': 'Selecione elementos no mapa (Ctrl+clique ou Shift+arrastar) para plotá-los aqui.', 'Click a period to navigate.': 'Clique em um período para navegar.',
    'Select one element to compare it across cases and scenarios.': 'Selecione um elemento para compará-lo entre casos e cenários.',
    'Storage and linepack levels as % of maximum capacity (P10–P90 band when there are several scenarios). Follows the timeline.': 'Níveis de armazenamento e linepack em % da capacidade máxima (faixa P10–P90 com vários cenários). Acompanha a linha do tempo.',
    'Gas delivered to city-gates and thermal plants, by origin, for each period. Click to go to a period.': 'Gás entregue a city-gates e térmicas, por origem, em cada período. Clique para ir a um período.',
    'Marginal cost by node over time. Selected nodes are shown if any; otherwise the 8 nodes with the highest average cost.': 'Custo marginal por nó ao longo do tempo. Mostra os nós selecionados ou, se não houver, os 8 de maior custo médio.',
    'Each point is an arc. A marginal-cost spread between the ends of a highly utilized arc indicates a binding bottleneck. Click to select.': 'Cada ponto é um arco. Diferencial de custo marginal entre as pontas de um arco muito carregado indica gargalo ativo. Clique para selecionar.',
    'Periods / cases': 'Períodos / casos', 'Selected elements': 'Elementos selecionados', 'Choose reference…': 'Escolha a referência…', 'Compare two periods or cases': 'Compare dois períodos ou casos',
    'Choose a reference period or case above (or in the toolbar). The map then shows differences (current − reference) and this table lists them, sorted by the largest absolute change.': 'Escolha um período ou caso de referência acima (ou na barra de ferramentas). O mapa passa a mostrar diferenças (atual − referência) e esta tabela as lista, da maior variação absoluta para a menor.',
    'Compare elements': 'Comparar elementos', 'Select two or more nodes or arcs (Ctrl+click, Shift+drag, or right-click → “Compare with…”).': 'Selecione dois ou mais nós ou arcos (Ctrl+clique, Shift+arrastar ou botão direito → “Comparar com…”).',
    'Current': 'Atual', 'Reference': 'Referência', 'No binding capacity in this period': 'Nenhuma capacidade restritiva neste período',
    // ---- context menu / actions
    'View details': 'Ver detalhes', 'Open time series': 'Abrir séries temporais', 'Inspect balance': 'Inspecionar balanço', 'Show connected pipelines': 'Mostrar dutos conectados', 'Show 2 hops': 'Mostrar 2 saltos', 'Isolate connected component': 'Isolar componente conectado',
    'Filter network from this node': 'Filtrar rede a partir deste nó', 'Find path to…': 'Encontrar caminho até…', 'Center map here': 'Centralizar mapa aqui', 'Show capacity usage': 'Mostrar uso da capacidade', 'Highlight upstream network': 'Destacar rede a montante',
    'Highlight downstream network': 'Destacar rede a jusante', 'Zoom to pipeline': 'Zoom no duto', 'Select node': 'Selecionar nó', 'Zoom to network': 'Zoom na rede', 'Clear selection & highlight': 'Limpar seleção e destaque', 'Copy coordinates': 'Copiar coordenadas',
    // ---- data checks
    'errors': 'erros', 'warnings': 'avisos', 'notes': 'observações', 'No issues found.': 'Nenhum problema encontrado.', 'No result files': 'Sem arquivos de resultados', 'Reading warnings': 'Avisos de leitura',
    'Nodes without coordinates': 'Nós sem coordenadas', 'Isolated nodes': 'Nós isolados', 'Arcs connecting a node to itself': 'Arcos que ligam um nó a ele mesmo', 'Flow above capacity': 'Fluxo acima da capacidade', 'Flow on arcs out of service': 'Fluxo em arcos fora de operação',
    'Nodal balance does not close': 'Balanço nodal não fecha', 'Production above its maximum': 'Produção acima do máximo', 'Unserved demand (deficit)': 'Demanda não atendida (déficit)', 'Storage level outside its limits': 'Nível de armazenamento fora dos limites',
    'Demand at nodes with zero or negative marginal cost': 'Demanda em nós com custo marginal zero ou negativo', 'Pipelines not matched to the reference traces': 'Dutos sem casamento com os traçados de referência', 'Co-located nodes drawn with an offset': 'Nós coincidentes desenhados com deslocamento',
    'Messages from the SDDP file parser.': 'Mensagens do leitor de arquivos do SDDP.', 'These nodes cannot be drawn on the map (gcnode*.dat).': 'Estes nós não podem ser desenhados no mapa (gcnode*.dat).', 'Nodes without any pipeline, sea route or converter.': 'Nós sem nenhum duto, rota marítima ou conversor.',
    'Utilization above 100 % in at least one block.': 'Carregamento acima de 100 % em pelo menos um bloco.', 'Flow reported where the capacity is zero in that period.': 'Fluxo informado onde a capacidade é zero no período.',
    'Inflows − outflows + injections − withdrawals differs from zero by more than rounding (0.2 % or 0.5 mil m³/d).': 'Entradas − saídas + injeções − retiradas difere de zero além do arredondamento (0,2 % ou 0,5 mil m³/d).',
    'Compared with MaxProd (including dated modifications).': 'Comparado com MaxProd (incluindo modificações datadas).', 'Often a sign of a free or surplus source nearby.': 'Costuma indicar uma fonte gratuita ou excedente próxima.',
    'Drawn as straight lines in “Real (EPE)” mode. Add a geometry.geojson to the case to fix them.': 'Desenhados em reta no modo “Real (EPE)”. Adicione um geometry.geojson ao caso para corrigi-los.',
    'Nodes with identical coordinates (e.g. LNG tank and gas side) are shifted slightly for display.': 'Nós com coordenadas idênticas (ex.: tanque de GNL e lado gás) são levemente deslocados na exibição.',
    'Only network inputs were found (etranflw.csv, endcmg.csv, … are missing).': 'Só foram encontradas entradas da rede (faltam etranflw.csv, endcmg.csv, …).',
    // ---- views / notes / export
    'Save view': 'Salvar vista', 'Saves the layers and their styles, trace mode, basemap and global filters. Optionally also the period, the map position and the annotations.': 'Salva as camadas e seus estilos, o modo de traçado, o mapa de fundo e os filtros globais. Opcionalmente também o período, a posição do mapa e as anotações.',
    'Period, scenario, block and comparison': 'Período, cenário, bloco e comparação', 'Map position': 'Posição do mapa', 'Download file…': 'Baixar arquivo…', 'Save in My views': 'Salvar em Minhas vistas', 'e.g. Congestion NE – Aug 2032': 'ex.: Congestionamento NE – ago 2032',
    'Views': 'Vistas', 'My views (this browser)': 'Minhas vistas (este navegador)', 'Team views (data folder)': 'Vistas da equipe (pasta data)', 'Apply': 'Aplicar', 'Delete': 'Excluir', 'Download as file to share': 'Baixar arquivo para compartilhar', 'Team-library file for the data folder': 'Arquivo da biblioteca da equipe para a pasta data',
    'No saved views yet. Use “Save view…”.': 'Nenhuma vista salva ainda. Use “Salvar vista…”.', 'None. Add .view.js files to data/ and list them in data/library.js.': 'Nenhuma. Adicione arquivos .view.js em data/ e liste-os em data/library.js.',
    'To share a view with the team: download the .js file, copy it into the app’s data folder and add its path to data/library.js. A .json file can be opened by anyone with Open case → Dataset / file.': 'Para compartilhar uma vista com a equipe: baixe o arquivo .js, copie para a pasta data do app e adicione o caminho em data/library.js. Um arquivo .json pode ser aberto por qualquer pessoa em Abrir caso → Dataset / arquivo.',
    'New annotation': 'Nova anotação', 'Edit annotation': 'Editar anotação', 'Save': 'Salvar', 'Drag to move · double-click to edit': 'Arraste para mover · duplo clique para editar',
    'Export map figure': 'Exportar figura do mapa', 'Title': 'Título', 'Subtitle': 'Subtítulo', 'Format': 'Formato', 'Resolution': 'Resolução', 'PNG (image)': 'PNG (imagem)', 'SVG (vector legend, for reports)': 'SVG (legenda vetorial, para relatórios)',
    '1× (screen)': '1× (tela)', '2× (print)': '2× (impressão)', 'Include legend of the visible layers': 'Incluir legenda das camadas visíveis', 'Include annotations': 'Incluir anotações', 'Export': 'Exportar',
    'The map is exported exactly as shown (zoom, layers, labels). Resize the window or hide panels to change its size.': 'O mapa é exportado exatamente como aparece (zoom, camadas, rótulos). Redimensione a janela ou oculte painéis para mudar o tamanho.',
    'Could not render the PNG; try SVG': 'Não foi possível gerar o PNG; tente SVG', 'Picking cancelled': 'Seleção cancelada',
    // ---- help
    'Using the explorer': 'Como usar o explorador', 'Hover': 'Passar o mouse', 'Quick summary of a node, pipeline or asset': 'Resumo rápido de um nó, duto ou ativo', 'Click': 'Clique', 'Select (opens properties)': 'Selecionar (abre propriedades)',
    'Ctrl / ⌘ + click': 'Ctrl / ⌘ + clique', 'Add or remove from selection': 'Adicionar ou remover da seleção', 'Shift + drag': 'Shift + arrastar', 'Rectangle selection': 'Seleção retangular', 'Double-click': 'Duplo clique', 'Zoom in and open detailed analysis': 'Aproximar e abrir análise detalhada',
    'Right-click': 'Botão direito', 'Context menu: upstream/downstream, paths, compare, filter…': 'Menu de contexto: montante/jusante, caminhos, comparar, filtrar…', 'Previous / next period': 'Período anterior / próximo', 'Play / pause timeline': 'Reproduzir / pausar linha do tempo',
    'Shift + click timeline': 'Shift + clique na linha do tempo', 'Set analysis range': 'Definir intervalo de análise', 'Ctrl + K or /': 'Ctrl + K ou /', 'Toggle left / right / bottom panels': 'Mostrar/ocultar painéis esquerdo / direito / inferior',
    'Fit network': 'Enquadrar a rede', 'Cancel picking, clear highlight, then clear selection': 'Cancelar escolha, limpar destaque e depois a seleção', 'Space': 'Espaço',
    // ---- maplibre controls
    'Zoom in': 'Aproximar', 'Zoom out': 'Afastar', 'Toggle attribution': 'Mostrar atribuição',
    // ---- config: element types, variables, views, groups
    'Pipeline': 'Gasoduto', 'LNG sea route': 'Rota marítima de GNL', 'LNG sea routes': 'Rotas marítimas de GNL', 'Regasification units': 'Unidades de regaseificação', 'City-gate / distribution': 'City-gate / distribuição', 'Thermal plant': 'Usina térmica',
    'Production / import': 'Produção / importação', 'Storage / linepack': 'Armazenamento / linepack',
    'Flow (signed)': 'Fluxo (com sinal)', 'Flow (absolute)': 'Fluxo (absoluto)', 'Capacity utilization': 'Carregamento da capacidade', 'Capacity (flow direction)': 'Capacidade (sentido do fluxo)', 'Marginal cost spread (to − from)': 'Diferencial de custo marginal (destino − origem)',
    'Peak block utilization': 'Carregamento no bloco de pico', 'Capacity dual (value of +1 unit of capacity)': 'Dual de capacidade (valor de +1 unidade)', 'Probability of congestion (≥ 95 %)': 'Probabilidade de congestionamento (≥ 95 %)',
    'Capacity from→to (input)': 'Capacidade origem→destino (entrada)', 'Capacity to→from (input)': 'Capacidade destino→origem (entrada)', 'Transport tariff (input)': 'Tarifa de transporte (entrada)', 'Transport tariff': 'Tarifa de transporte', 'Losses (input)': 'Perdas (entrada)', 'Losses': 'Perdas',
    'Injection (production + LNG + storage)': 'Injeção (produção + GNL + armazenamento)', 'Withdrawal (demand)': 'Retirada (demanda)', 'City-gate demand': 'Demanda de city-gates', 'Throughput (pipeline inflow)': 'Vazão passante (entrada por dutos)', 'Balance residual': 'Resíduo do balanço',
    'Number of assets (input)': 'Número de ativos (entrada)', 'Number of assets': 'Número de ativos', 'Production utilization': 'Uso da produção', 'Max production (input)': 'Produção máxima (entrada)', 'Storage fill (level / max)': 'Enchimento do armazenamento (nível / máx.)', 'Max storage (input)': 'Armazenamento máximo (entrada)',
    'Dominant gas origin': 'Origem dominante do gás', 'Gas mixed at node (inflow + injection)': 'Gás misturado no nó (entrada + injeção)', 'Traced volume': 'Volume rastreado', 'Asset type': 'Tipo de ativo', 'Region (origin)': 'Região (origem)',
    'Pipeline congestion': 'Congestionamento dos dutos', 'Loading + marginal cost + demand': 'Carregamento + custo marginal + demanda', 'Gas flow': 'Fluxo de gás', 'Marginal costs': 'Custos marginais', 'Bottlenecks & capacity duals': 'Gargalos e duais de capacidade', 'Storage & LNG': 'Armazenamento e GNL',
    'Violations & deficits': 'Violações e déficits', 'Topology & EPE reference': 'Topologia e referência EPE',
    'Pipelines – loading': 'Dutos – carregamento', 'Nodes – marginal cost': 'Nós – custo marginal', 'Thermal plants – consumption': 'Térmicas – consumo', 'City-gates – demand': 'City-gates – demanda', 'Production & LNG': 'Produção e GNL', 'All arcs – flow': 'Todos os arcos – fluxo',
    'Nodes – throughput': 'Nós – vazão passante', 'Pipelines – cost spread': 'Dutos – diferencial de custo', 'Pipelines – flow': 'Dutos – fluxo', 'Nodes – net injection': 'Nós – injeção líquida', 'Arcs – dominant origin': 'Arcos – origem dominante', 'Nodes – origin mix': 'Nós – composição da origem',
    'All arcs': 'Todos os arcos', 'Capacity dual > 0': 'Dual de capacidade > 0', 'LNG chain (sea routes + regas)': 'Cadeia de GNL (rotas marítimas + regaseificação)', 'Storage – fill level': 'Armazenamento – enchimento', 'Arcs ≥ 95% loaded': 'Arcos ≥ 95% carregados', 'Nodes with deficit': 'Nós com déficit',
    'EPE transport pipelines': 'Gasodutos de transporte (EPE)', 'Model arcs': 'Arcos do modelo', 'Nodes – region': 'Nós – região',
    'Pre-salt': 'Pré-sal', 'Bolivia / Argentina': 'Bolívia / Argentina', 'Biomethane': 'Biometano', 'Other domestic production': 'Outra produção nacional', 'LNG': 'GNL',
    'Low': 'Baixo', 'Moderate': 'Moderado', 'High': 'Alto',
    'EPE – Transport pipelines': 'EPE – Gasodutos de transporte', 'EPE – Gathering / offshore pipelines': 'EPE – Dutos de escoamento', 'EPE – Distribution networks': 'EPE – Redes de distribuição', 'EPE – Compression stations': 'EPE – Estações de compressão', 'EPE – LNG terminals': 'EPE – Terminais de GNL', 'EPE – Gas processing plants': 'EPE – UPGNs',
    'thermal': 'térmicas', 'city-gates': 'city-gates', 'SDDP case': 'Caso SDDP',
    'Size:': 'Tamanho:', 'Width:': 'Espessura:', 'Arrows:': 'Setas:', 'By block': 'Por bloco', 'at': 'em', 'Pipeline in / out': 'Entrada / saída por dutos',
    'Share of hours with utilization ≥ 95 %': 'Parcela das horas com carregamento ≥ 95 %', 'Share of hours and scenarios with utilization ≥ 95 %': 'Parcela das horas e cenários com carregamento ≥ 95 %',
    'flow w/o capacity': 'fluxo sem capacidade', 'out of service': 'fora de operação', 'no flow': 'sem fluxo', 'Of max production ': 'Da produção máxima',
    'click to go to this period': 'clique para ir a este período', 'click to pick': 'clique para escolher', 'click for all elements at this node': 'clique para ver todos os elementos deste nó',
    '% of hours': '% das horas', 'count': 'contagem', 'Block min': 'Mín. dos blocos', 'Block range': 'Faixa dos blocos', 'Flow (avg)': 'Fluxo (média)', 'Reverse capacity': 'Capacidade reversa'
  };
  var UNIT_HINT = /(m³|%|\$|km|k\$|\bh\b|px|MMBtu)/;
  var RULES = [
    [/^Select all \((\d+)\)$/, function (m) { return 'Selecionar todos (' + m[1] + ')'; }],
    [/^Showing the first (\d+)\. Refine the search to see more\.$/, function (m) { return 'Mostrando os primeiros ' + m[1] + '. Refine a busca para ver mais.'; }],
    [/^(\d+) of (\d+) pipelines follow the real route; the others are drawn straight\.$/, function (m) { return m[1] + ' de ' + m[2] + ' gasodutos seguem o traçado real; os demais são desenhados em reta.'; }],
    [/^Share from (.+)$/, function (m) { return 'Participação de ' + T(m[1]); }],
    [/^(\d+) periods × (\d+) blocks?$/, function (m) { return m[1] + ' períodos × ' + m[2] + ' blocos'; }],
    [/^(\d+) scenarios$/, function (m) { return m[1] + ' cenários'; }],
    [/^Block (\d+)$/, function (m) { return 'Bloco ' + m[1]; }], [/^block (\d+)$/, function (m) { return 'bloco ' + m[1]; }],
    [/^Scenario (\d+)$/, function (m) { return 'Cenário ' + m[1]; }], [/^scen\. (\d+)$/, function (m) { return 'cen. ' + m[1]; }],
    [/^avg\. of blocks$/, function () { return 'média dos blocos'; }],
    [/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)( \d{4})?$/, function (m) { return MONTHS[m[1]] + (m[2] || ''); }],
    [/^vs (.+)$/, function (m) { return 'vs ' + T(m[1]); }], [/^Δ vs (.+)$/, function (m) { return 'Δ vs ' + T(m[1]); }],
    [/^(\d+)% of hours$/, function (m) { return m[1] + '% das horas'; }],
    [/^peak (.+)$/, function (m) { return 'pico ' + m[1]; }],
    [/^(from|to|at|with) (.+)$/, function (m) { return { from: 'de', to: 'para', at: 'em', with: 'com' }[m[1]] + ' ' + m[2]; }],
    [/^Direction: (.+)$/, function (m) { return 'Sentido: ' + m[1]; }],
    [/^(Upstream|Downstream) of (.+)$/, function (m) { return (m[1] === 'Upstream' ? 'Montante de ' : 'Jusante de ') + m[2]; }],
    [/^(Upstream|Downstream): (\d+) nodes, (\d+) arcs \(by current flow\)$/, function (m) { return (m[1] === 'Upstream' ? 'Montante' : 'Jusante') + ': ' + m[2] + ' nós, ' + m[3] + ' arcos (pelo fluxo atual)'; }],
    [/^2 hops from (.+)$/, function (m) { return '2 saltos a partir de ' + m[1]; }], [/^Connected to (.+)$/, function (m) { return 'Conectados a ' + m[1]; }],
    [/^Component of (.+)$/, function (m) { return 'Componente de ' + m[1]; }], [/^Network from (.+)$/, function (m) { return 'Rede a partir de ' + m[1]; }],
    [/^Path (.+)$/, function (m) { return 'Caminho ' + m[1]; }],
    [/^Balance closes \(residual (.+), rounding and losses\)\.$/, function (m) { return 'O balanço fecha (resíduo ' + m[1] + ', arredondamento e perdas).'; }],
    [/^Balance residual: (.+) \(closes\)$/, function (m) { return 'Resíduo do balanço: ' + m[1] + ' (fecha)'; }], [/^Balance residual: (.+)$/, function (m) { return 'Resíduo do balanço: ' + m[1]; }],
    [/^Mix of all gas entering the node \(pipelines \+ local injections\), assuming perfect mixing at every node: (.+)\.$/, function (m) { return 'Composição de todo o gás que entra no nó (dutos + injeções locais), supondo mistura perfeita em cada nó: ' + m[1] + '.'; }],
    [/^Where the gas delivered to demands comes from, by source group and by region · use \((.+)\)\. Proportional mixing at every node\.$/, function (m) { return 'De onde vem o gás entregue às demandas, por grupo de fontes e por região · uso (' + T(m[1]) + '). Mistura proporcional em cada nó.'; }],
    [/^Implied capacity duals .* for (.+)\. Out-of-service arcs show the value of building them\. Click a bar to select the arc\.$/, function (m) { return 'Duais de capacidade implícitos (valor de uma unidade adicional de capacidade, pelas condições de otimalidade do PL) em ' + T(m[1]) + '. Arcos fora de operação mostram o valor de construí-los. Clique numa barra para selecionar o arco.'; }],
    [/^Network totals per period in (.+): supply above zero, demand below\. Click a bar to go to that period\.$/, function (m) { return 'Totais da rede por período em ' + m[1] + ': oferta acima de zero, demanda abaixo. Clique numa barra para ir ao período.'; }],
    [/^Arcs by utilization class in (.+)\. Click a bar to select those arcs\.$/, function (m) { return 'Arcos por classe de carregamento em ' + T(m[1]) + '. Clique numa barra para selecioná-los.'; }],
    [/^(.+): (.+) in every loaded case( \(open more cases to compare\))?\.$/, function (m) { return m[1] + ': ' + T(m[2]) + ' em todos os casos carregados' + (m[3] ? ' (abra mais casos para comparar)' : '') + '.'; }],
    [/^(\d+) block\(s\)(.*)$/, function (m) { return m[1] + ' bloco(s)' + m[2].replace(', max ', ', máx. ').replace(', up to ', ', até ').replace(' outside ', ' fora de '); }],
    [/^(\d+) km on network, (\d+) km access$/, function (m) { return m[1] + ' km na malha, ' + m[2] + ' km de acesso'; }],
    [/^(\d+) \(along (.+) route\)$/, function (m) { return m[1] + ' (pelo traçado ' + m[2] + ')'; }],
    [/^(\d+) \(straight line\)$/, function (m) { return m[1] + ' (em reta)'; }], [/^(\d+) km \(straight line\)$/, function (m) { return m[1] + ' km (em reta)'; }],
    [/^(\d+) \(geometry file\)$/, function (m) { return m[1] + ' (arquivo de geometria)'; }],
    [/^residual (.+)$/, function (m) { return 'resíduo ' + m[1]; }],
    [/^(\d+) elements (added to|in) selection$/, function (m) { return m[1] + ' elementos ' + (m[2] === 'in' ? 'na seleção' : 'adicionados à seleção'); }],
    [/^Loaded “(.+)”: (\d+) nodes, (\d+) arcs, (\d+) assets, (\d+) periods$/, function (m) { return 'Carregado “' + m[1] + '”: ' + m[2] + ' nós, ' + m[3] + ' arcos, ' + m[4] + ' ativos, ' + m[5] + ' períodos'; }],
    [/^Reading (\d+) files from “(.+)”…$/, function (m) { return 'Lendo ' + m[1] + ' arquivos de “' + m[2] + '”…'; }],
    [/^View “(.+)” applied$/, function (m) { return 'Vista “' + m[1] + '” aplicada'; }], [/^Copied “(.+)”$/, function (m) { return 'Copiado “' + m[1] + '”'; }],
    [/^Click on the map to place the note \(Esc to cancel\)$/, function () { return 'Clique no mapa para posicionar a nota (Esc cancela)'; }],
    [/^Annotations \((\d+)\)$/, function (m) { return 'Anotações (' + m[1] + ')'; }],
    [/^(.+) · (\d+) layers(.*)$/, function (m) { return m[1] + ' · ' + m[2] + ' camadas' + m[3].replace(' notes', ' notas'); }],
    [/^Layers \((\d+)\)$/, function (m) { return 'Camadas (' + m[1] + ')'; }],
    [/^Filter: (.+)$/, function (m) { return 'Filtro: ' + m[1]; }], [/^Labels: (.+)$/, function (m) { return 'Rótulos: ' + m[1].split(' · ').map(T).join(' · '); }],
    [/^(Width|Size|Arrows): (.+)$/, function (m) { return { Width: 'Espessura', Size: 'Tamanho', Arrows: 'Setas' }[m[1]] + ': ' + T(m[2]); }],
    [/^Utilization (.+) \((.+)\)$/, function (m) { return 'Carregamento ' + m[1] + ' (' + T(m[2]) + ')'; }],
    [/^(.+) \(current − reference\)$/, function (m) { return T(m[1]) + ' (atual − referência)'; }],
    [/^(Node|Pipeline|LNG sea route|Regasification|City-gate \/ distribution|Thermal plant|Production \/ import|LNG supply|Storage \/ linepack): (.+)$/, function (m) { return T(m[1]) + ': ' + m[2]; }],
    [/^P10–P90 (.+)$/, function (m) { return 'P10–P90 ' + T(m[1]); }],
    [/^(.+) over time$/, function (m) { var t = T(m[1]); return t !== m[1] ? t + ' ao longo do tempo' : null; }],
    [/^(.+) \((\d+)\)$/, function (m) { var t = T(m[1]); return t !== m[1] ? t + ' (' + m[2] + ')' : null; }],
    [/^(.+) \(([^()]+)\)$/, function (m) { if (!UNIT_HINT.test(m[2]) && !/^(input|entrada)$/.test(m[2])) return null; var t = T(m[1]); return t !== m[1] ? t + ' (' + (m[2] === 'input' ? 'entrada' : m[2]) + ')' : null; }],
    [/^([−+\-\d.,]+) (.+)$/, function (m) { var t = T(m[2]); return t !== m[2] ? m[1] + ' ' + t : null; }],
    [/^(.+) (low|moderate|high|near limit|violation)$/, function (m) { return m[1] + ' ' + DICT[m[2]]; }],
    [/^(.+)( ▾)$/, function (m) { var t = T(m[1]); return t !== m[1] ? t + m[2] : null; }]
  ];
  var WORDS = { 'nodes': 'nós', 'arcs': 'arcos', 'assets': 'ativos', 'periods': 'períodos', 'layers': 'camadas', 'errors': 'erros', 'warnings': 'avisos', 'notes': 'observações', 'selected': 'selecionados', 'blocks': 'blocos', 'more': 'mais' };
  var cache = {};
  function T(s) {
    if (I.lang !== 'pt' || typeof s !== 'string') return s;
    if (cache[s] !== undefined) return cache[s];
    var out = s, t = s.trim();
    if (!t || !/[A-Za-z]/.test(t)) return (cache[s] = s);
    if (DICT[t] !== undefined) out = s.replace(t, DICT[t]);
    else if (WORDS[t]) out = s.replace(t, WORDS[t]);
    else {
      var done = false;
      if (t.indexOf(' · ') > 0 && !/^.+ · \d+ layers/.test(t)) {
        var parts = t.split(' · '), tp = parts.map(T);
        if (tp.join('|') !== parts.join('|')) { out = s.replace(t, tp.join(' · ')); done = true; }
      }
      for (var i = 0; !done && i < RULES.length; i++) {
        var m = t.match(RULES[i][0]);
        if (m) { var r = RULES[i][1](m); if (r !== null && r !== undefined) { out = s.replace(t, r); done = true; } }
      }
    }
    cache[s] = out;
    return out;
  }
  I.t = T;
  GV.t = T;

  // ---------------------------------------------------------------- config (labels used by charts and legends)
  I.translateConfig = function (C) {
    if (I.lang !== 'pt') return;
    C.appName = T(C.appName);
    (C.variables || []).forEach(function (v) { v.label = T(v.label); });
    Object.keys(C.elementTypes || {}).forEach(function (k) { var e = C.elementTypes[k]; e.label = T(e.label); e.plural = T(e.plural); });
    (C.views || []).forEach(function (v) { v.label = T(v.label); v.layers.forEach(function (l) { if (l.name) l.name = T(l.name); }); });
    (C.sourceGroups || []).forEach(function (g) { g.label = T(g.label); });
    (C.basemapOptions || []).forEach(function (b) { b.label = T(b.label); });
    (C.utilizationBins || []).forEach(function (b) { b.label = T(b.label); });
    Object.keys(C.contextMenus || {}).forEach(function (k) { C.contextMenus[k].forEach(function (it) { if (it.label) it.label = T(it.label); }); });
    var sc = C.categoryColors && C.categoryColors.status;
    if (sc) Object.keys(sc).forEach(function (k) { sc[T(k)] = sc[k]; });
  };

  // ---------------------------------------------------------------- charts (canvas text)
  var CHART_KEYS = { name: 1, text: 1, source: 1, target: 1 };
  I.chart = function (opt) {
    if (I.lang !== 'pt') return opt;
    (function walk(o, key) {
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) { if (typeof o[i] === 'string' && (key === 'data' || key === 'legendData')) o[i] = T(o[i]); else if (o[i] && typeof o[i] === 'object') walk(o[i], key); } return; }
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (typeof v === 'string' && CHART_KEYS[k]) o[k] = T(v);
        else if (v && typeof v === 'object' && typeof v !== 'function') walk(v, k === 'legend' ? 'legendData' : k);
      });
    })(opt, '');
    return opt;
  };

  // ---------------------------------------------------------------- DOM
  function trText(node) {
    var p = node.parentElement;
    if (!p || p.closest('script,style,textarea,.maplibregl-canvas-container,[data-no-i18n]')) return;
    var v = node.nodeValue, r = T(v);
    if (r !== v) node.nodeValue = r;
  }
  function trAttrs(el) {
    ['title', 'placeholder', 'aria-label', 'label'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a);
      if (v) { var r = T(v); if (r !== v) el.setAttribute(a, r); }
    });
  }
  function trTree(root) {
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1) return;
    trAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
  }
  if (GV.config) I.translateConfig(GV.config);

  I.start = function () {
    document.documentElement.lang = I.lang === 'pt' ? 'pt-BR' : 'en';
    var btn = document.getElementById('btn-lang');
    if (btn) { btn.textContent = I.lang === 'pt' ? 'EN' : 'PT'; btn.title = I.lang === 'pt' ? 'Switch to English' : 'Mudar para português'; btn.onclick = function () { I.setLang(I.lang === 'pt' ? 'en' : 'pt'); }; }
    if (I.lang !== 'pt') return;
    document.title = T(document.title);
    trTree(document.body);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        if (m.type === 'characterData') trText(m.target);
        else if (m.type === 'attributes') trAttrs(m.target);
        else m.addedNodes.forEach(trTree);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'label'] });
  };
})();
