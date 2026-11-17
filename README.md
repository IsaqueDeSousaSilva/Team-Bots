# Team Bots

Site do projeto de extensão da Team Bots — comunidade de tecnologia focada em bots, IA e programação. Escrito em português (pt-BR).

## Stack

HTML, CSS e JavaScript puros no site. O servidor e a API usam Node.js 22.13 ou superior com SQLite integrado, sem dependências de npm. O simulador usa a build Unity WebGL já versionada.

---

## Estrutura do projeto

```
Team-Bots/
├── index.html            Página principal (única página do site)
├── style.css             Todos os estilos (tema escuro, responsivo, animações)
├── script.js             Interações: menu mobile, acordeão FAQ, toast de comunidade
├── servidor-teste.py     Servidor estático de teste da build Unity
├── api.js / banco.css   Cursos, login e progresso no site
├── backend/             API, schema SQLite, scripts e testes
├── docs/                Modelo de dados e documentação da API
│
└── simulador/            Build Unity WebGL versionada
    ├── index.html        Página standalone do simulador (abre em iframe ou direto)
    └── Build/
        ├── WebGL.loader.js           Carregador da Unity (~47 KB)
        ├── WebGL.framework.js.unityweb  Runtime JS (~90 KB, gzip)
        ├── WebGL.wasm.unityweb       WebAssembly compilado (~12,8 MB, gzip)
        └── WebGL.data.unityweb       Assets do jogo (~4,8 MB, gzip)
```

O arquivo SQLite fica em `backend/data/` e é criado no primeiro uso.

---

## Como rodar localmente

A versão com cursos, cadastro, progresso e Unity roda pelo Node:

```bash
node backend/server.mjs --demo
node --test backend/tests/api.test.mjs
```

Abra `http://127.0.0.1:3000/`. No Windows, `INICIAR.cmd` inicia o servidor. A demonstração usa banco próprio e a conta `aluno.demo` com a senha de demonstração definida em `backend/db.mjs`.

Para testar apenas a versão estática do site e o simulador:

```bash
python servidor-teste.py
```

Depois abra `http://localhost:8000/` no navegador.

### Opções do servidor

```bash
python servidor-teste.py               # porta padrão 8000
python servidor-teste.py 8080          # outra porta
python servidor-teste.py 8000 C:/outro # outra pasta
```

Para parar: **Ctrl+C** no terminal.

### Por que não usar `python -m http.server`?

O `servidor-teste.py` faz três coisas que o servidor padrão não faz:

| Header enviado | Para quê |
|---|---|
| `Content-Encoding: gzip` | Informa ao browser que os `.unityweb` já estão comprimidos, evitando double-decode |
| `Cross-Origin-Opener-Policy: same-origin` | Habilita `SharedArrayBuffer`, necessário para o Unity 6 WebGL multi-thread |
| `Cross-Origin-Embedder-Policy: require-corp` | Idem — sem este header o WebAssembly trava silenciosamente |

O servidor escuta em `127.0.0.1` (IPv4) **e** `::1` (IPv6) ao mesmo tempo, garantindo que tanto `http://localhost/` quanto `http://127.0.0.1/` funcionem independente do browser.

---

## Seções da página (`index.html`)

| Seção | ID/âncora | Descrição |
|---|---|---|
| Hero | `#home` | Título, subtítulo e botões de ação |
| Notícias / Recursos | `#resources` | Grade de cards + fórum lateral |
| Cursos | `#cursos-online` | Catálogo, materiais, videoaulas e progresso |
| Simulador | `#cursos` | Canvas Unity WebGL interativo |
| Benefícios | — | Três cards: Conexão, Hub, Cursos |
| FAQ | `#about` | Acordeão de perguntas frequentes |
| Rodapé | — | Links institucionais e redes sociais |

---

## Como o simulador é integrado na página

O simulador Unity WebGL é carregado diretamente em um `<canvas>` dentro do `index.html`, sem usar iframe.

### HTML (`index.html` — seção `#cursos`)

```html
<section class="simulator-section container" id="cursos">
  <div class="simulator-wrapper" id="simulador-area">

    <!-- canvas recebe foco de teclado via tabindex="-1" -->
    <canvas id="unity-canvas" tabindex="-1"></canvas>

    <!-- camada de carregamento (some quando pronto) -->
    <div class="sim-loading" id="sim-loading">
      <span id="sim-status">Carregando…</span>
      <div class="sim-progress-bar">
        <div class="sim-progress-fill" id="sim-progress"></div>
      </div>
    </div>

    <!-- exibido se a build não for encontrada ou ocorrer erro -->
    <div class="sim-error" id="sim-error"></div>

    <!-- exibido em dispositivos móveis (simulador é desktop-only) -->
    <div class="sim-mobile-warning">
      Este simulador funciona apenas em computador (mouse e teclado).
    </div>
  </div>

  <div class="sim-toolbar">
    <button class="sim-fullscreen-btn" id="sim-fullscreen-btn" disabled>Tela cheia ⤢</button>
  </div>
</section>
```

### JavaScript (`index.html` — bloco `<script>` ao final do `<body>`)

O script roda em IIFE para não poluir o escopo global. Fluxo de execução:

1. **Proteção de teclado** — registra listeners `keydown/keyup/keypress` em modo captura *antes* de carregar o Unity, impedindo que o simulador roube teclas de campos de texto da página.
2. **Carrega `WebGL.loader.js`** dinamicamente via `document.createElement("script")`, para que a página não quebre quando `simulador/Build/` está ausente.
3. **`createUnityInstance()`** — após o loader estar pronto, inicializa o simulador no canvas com os caminhos dos assets, callback de progresso e handler de erros.
4. **Pós-carregamento** — esconde a camada de loading, habilita o botão de tela cheia, devolve o foco ao canvas e registra `pointerdown` para manter o foco em cliques futuros.

```
simulador/Build/WebGL.loader.js         ← injetado dinamicamente
simulador/Build/WebGL.data.unityweb     ← assets
simulador/Build/WebGL.framework.js.unityweb  ← runtime JS
simulador/Build/WebGL.wasm.unityweb     ← WebAssembly
```

Todos os caminhos são relativos à raiz do site (`PASTA_BUILD = "simulador/Build"`).

### Regras obrigatórias

- **Não renomeie** nenhum arquivo da pasta `Build/`
- **Não defina** `width`/`height` no `<canvas>` — dimensione apenas via CSS
- **Não use** `id="simulador"` em nenhum elemento — conflita com `window.simulador` criado pela Unity
- O listener de teclado deve ser registrado **antes** de carregar `WebGL.loader.js`
- O `<canvas>` precisa de `tabindex="-1"` para receber foco e os atalhos funcionarem (Delete, R, Ctrl+Z, Esc)

---

## Cadastrar uma videoaula

```bash
node backend/scripts/cadastrar-videoaula.mjs --demo primeiros-circuitos 6 "Título da aula" "https://exemplo.org/video" "Resumo opcional"
```

Substitua a URL pelo endereço aprovado. O comando aceita um curso existente e uma posição livre ou já ocupada por uma videoaula. Atualizações preservam o ID da aula e o progresso registrado. O site abre o vídeo em uma nova guia. Use o mesmo modo (`--demo` ou sem essa opção) e a mesma variável `BANCO` do servidor.

## Publicação

Para rodar fora do modo de demonstração, use `node backend/server.mjs`. Configure `PORTA` e `HOST` para o ambiente, coloque a aplicação atrás de HTTPS e aponte `BANCO` para um arquivo em volume persistente. A versão atual usa um processo Node com SQLite em disco, e precisa de hospedagem compatível. A migração para um banco remoto ou funções do Netlify depende da escolha de hospedagem do grupo.

Consulte [a API](docs/API.md) e [o modelo de dados](docs/BANCO-DE-DADOS.md).
