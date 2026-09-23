# Gas Network Report – Explorador da Rede de Gás

Visualizador interativo e georreferenciado para analisar casos da rede de gás do **SDDP**. Ele mostra no mapa a topologia, os fluxos, o carregamento dos dutos, os gargalos, os custos marginais, o balanço nodal e a origem do gás, com tabelas e gráficos.

O visualizador é uma página web estática: **não precisa de instalação nem de servidor**. Basta abrir o `index.html` no Chrome ou no Edge. Os arquivos do caso são lidos localmente no navegador e nunca saem do computador.

---

## Estrutura do repositório

```
gas-network-report/
├─ README.md                  ← este arquivo
├─ instructions.txt           especificação original da ferramenta
├─ indexcls.fmt, indexdat.fmt formatos de arquivos do SDDP (referência)
└─ visualizer/
   ├─ app/                    ← o visualizador (é esta pasta que se distribui)
   │  ├─ index.html           abra este arquivo para usar
   │  ├─ README.md            documentação técnica detalhada (em inglês)
   │  ├─ data/
   │  │  ├─ library.js        lista de casos e dados de referência pré-carregados
   │  │  ├─ epe-infra.js      infraestrutura de gás da EPE (traçado real dos dutos)
   │  │  └─ *.case.js         casos empacotados (pré-carregados para todos)
   │  ├─ js/, css/, assets/   código e estilo (Design System PSR)
   │  ├─ vendor/              bibliotecas e fontes (funciona sem internet)
   │  └─ tools/               scripts Node.js opcionais (empacotar casos / dados EPE)
   └─ examples/
      └─ rede-gas-brasil-2027/  caso SDDP de exemplo (entradas .dat + resultados .csv)
```

Os artefatos de execução do SDDP (`*.lp`, logs, `*.out`, `psrplot/`, `timeseries.db`…) ficam fora do git pelo `.gitignore`. O visualizador não usa esses arquivos.

---

## Como usar

1. Abra `visualizer/app/index.html` com duplo clique.
2. O caso **Rede de Gás Brasil 2027** e o traçado da EPE já carregam automaticamente, porque estão listados em `data/library.js`.
3. Principais controles:
   - **Barra superior:** caso, vista (conjunto de camadas), comparação (contra outro período ou outro caso), busca (Ctrl+K), exportar figura, link da vista, preferências (⚙).
   - **Barra de tempo** (embaixo do mapa): play, **período**, linha do tempo, **bloco** e velocidade.
   - **Camadas:** cada camada tem filtro, cor, tamanho, setas e rótulos próprios. O ícone de lista abre os elementos da camada (desmarque um elemento para tirá-lo do mapa), e o ícone de ajustes abre o editor da camada. Os dois abrem num subpainel ao lado.
   - **Filtros**, **Legenda**, **Propriedades** (clique em um nó ou duto), **Tabelas e gráficos** e **Verificação de dados**. Todos os painéis podem ser encaixados, recolhidos ou flutuar.
4. Pressione **?** dentro do app para ver todos os atalhos.

A internet só é necessária para o mapa de fundo (Esri). Sem conexão, todo o resto funciona.

---

## Como carregar um novo caso

### Arquivos necessários

Selecione a **pasta do caso SDDP**, aquela que contém:

| Tipo | Arquivos |
|---|---|
| Rede (obrigatórios) | `celecnode*.dat`, `gcnode*.dat` (coordenadas), `celectransport.dat` |
| Rede (opcionais) | `melectransport.dat`, `celecgen*.dat`, `melecgen*.dat`, `celecload*.dat`, `celecstorage*.dat`, `celecproc.dat`, `fixedconv.dat`, `comfixconv.dat`, `mfixedconv.dat` |
| Resultados | `etranflw.csv`, `endcmg.csv`, `fxcnod.csv`, `estinj.csv`, `epdger.csv`, `edemmet.csv`, `edemdef.csv`, `duraci.csv` e, se existirem, `etrancos.csv`, `epdcos.csv`, `fxccos.csv`, `estbal.csv` |

Sem os `.csv` de resultados, o caso abre só com os dados de entrada da rede. Se o caso tiver vários cenários, o visualizador mostra também a média, a P50 e a faixa P10–P90.

### Opção A: abrir só para você (sessão atual)

1. No app, clique em **Open case → Pasta de caso SDDP…** e escolha a pasta do caso. Também dá para **arrastar a pasta** para a janela.
2. O Chrome pergunta se pode "enviar" os arquivos ao site. Pode confirmar: a leitura é local e nada é enviado.
3. O caso aparece no seletor **Caso**. Para comparar, abra vários casos e use **Comparar → vs <caso>**.

Os dutos são encaixados automaticamente no traçado real da EPE. Para ver linhas retas ou arcos, use **⚙ Preferências → Mapa → Traçado dos dutos**.

### Opção B: deixar o caso pré-carregado para todos (biblioteca da equipe)

1. Abra o caso como na opção A.
2. Use **Open case → Salvar como arquivo da biblioteca da equipe (.case.js)**.
3. Copie o arquivo para `visualizer/app/data/`.
4. Acrescente o caminho em `visualizer/app/data/library.js`:
   ```js
   GV.loadLibrary([
     'data/epe-infra.js',
     'data/rede-gas-brasil-2027.case.js',
     'data/meu-novo-caso.case.js'      // ← novo caso
   ]);
   ```
5. Faça o commit. Quem abrir essa cópia do app verá o caso direto no seletor.

Pela linha de comando, com Node.js, o mesmo arquivo pode ser gerado assim:

```bash
cd visualizer/app
node tools/pack-case.js "<pasta do caso SDDP>" "Nome do caso" data/meu-novo-caso.case.js --check
```

O `--check` também imprime um resumo (nós, arcos, ativos, períodos, blocos) e os maiores resíduos do balanço nodal, o que ajuda a validar o caso.

### Opção C: mandar um caso para quem já tem o app

Use **Open case → Salvar caso atual como dataset (.json)** e envie o arquivo. Quem receber abre com **Open case → Dataset, GeoJSON ou shapefiles…** ou arrasta o arquivo para a janela.

### Traçado próprio dos dutos (opcional)

Para substituir o traçado automático da EPE, coloque um `geometry.geojson` com `LineString`s na pasta do caso. Cada feição é associada a um duto pela propriedade `id` (ex.: `P12`), `code` ou `name`. Os detalhes estão em `visualizer/app/README.md`.

---

## Compartilhar com outras pessoas

- **Zip:** compacte a pasta `visualizer/app` e envie. Quem receber extrai o zip e abre o `index.html`. A pasta vai com os casos da biblioteca e os dados da EPE.
- **Pasta compartilhada** (Dropbox, SharePoint, Teams): copie `visualizer/app` para lá. Todos abrem o mesmo `index.html` e recebem as atualizações.
- **Vistas da equipe:** em **Gerenciar vistas**, baixe a vista como `.view.js`, copie o arquivo para `data/` e liste-o em `library.js`.
- **Link da vista** (🔗): abre no mesmo caso, período, bloco, camadas e posição do mapa, para quem tem a mesma cópia do app.

As preferências pessoais (tema, unidades, painéis, vistas e anotações próprias) ficam no navegador de cada usuário.

> Os arquivos `*.case.js` contêm os resultados completos do caso. Confirme que os dados podem ser compartilhados antes de enviar.

---

## Atualizar os dados da EPE

```bash
cd visualizer/app
node tools/pack-reference.js "<pasta com epe_shapefiles>" data/epe-infra.js
```

Também dá para arrastar os `.shp/.dbf/.cpg` para a janela e usá-los só na sessão atual.

---

## Desenvolvimento

- O app não tem etapa de build: são HTML, CSS e JavaScript puros, e as bibliotecas ficam em `vendor/` (MapLibre GL, ECharts, Tabulator, Font Awesome, fontes Inter e JetBrains Mono).
- Para testar com um servidor local (opcional; o `file://` também funciona):
  ```bash
  python -m http.server 8765 --directory visualizer/app
  ```
  Depois acesse http://localhost:8765. A mesma configuração está em `.claude/launch.json`.
- A interface está em português (pt-BR), e o inglês fica em ⚙ Preferências → Aparência → Idioma. As traduções estão em `js/i18n.js`.
- A arquitetura, as convenções de unidades do SDDP e o cálculo dos duais de capacidade e da origem do gás estão documentados em `visualizer/app/README.md`.
