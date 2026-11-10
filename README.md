# Team Bots

Site do projeto de extensão da Team Bots — comunidade de tecnologia focada em bots, IA e programação. Escrito em português (pt-BR).

## O que foi feito

- Estrutura HTML completa: hero, notícias/recursos, seção do simulador, benefícios, FAQ, rodapé
- Estilização com CSS próprio (`style.css`): tema escuro, responsivo, animações
- Menu mobile com toggle, acordeão de FAQ e toast de comunidade (`script.js`)
- Integração preparada para o simulador Unity WebGL via `<canvas>` dinâmico (sem quebrar quando `simulador/Build/` está ausente)
- Servidor de teste local (`servidor-teste.py`) com suporte a `Content-Encoding: gzip` para os arquivos `.unityweb`
- Exemplos de integração em `exemplos/`: canvas mínimo, canvas completo, iframe, componente React e configs de servidor (Apache, Nginx, IIS, Netlify, Vercel)

## Como rodar localmente

```bash
python servidor-teste.py
```

Abra `http://localhost:8000/` no navegador. **Nunca abra o `index.html` com dois cliques** — o simulador usa `fetch()`, que é bloqueado em URLs `file://`.

## Como integrar o simulador Unity

### 1. Obter a build

Descompacte o arquivo `SimuladorTeamBotsWEBGL-v0.5.zip` numa pasta chamada `simulador/` na raiz do projeto:

```
simulador/
├── index.html
└── Build/
    ├── WebGL.loader.js
    ├── WebGL.framework.js.unityweb
    ├── WebGL.wasm.unityweb
    └── WebGL.data.unityweb
```

> A pasta `simulador/` **não é commitada** (está no `.gitignore`). Cada membro precisa obtê-la separadamente.

### 2. Regras obrigatórias

- **Não renomeie** nenhum arquivo da pasta `Build/`
- **Não descompacte** os `.unityweb`
- **Não use** `id="simulador"` em nenhum elemento HTML — conflita com `window.simulador` criado pela Unity
- **Não defina** `width`/`height` diretamente no `<canvas>` — dimensione apenas via CSS
- O listener de proteção de teclado deve ser registrado **antes** de carregar `WebGL.loader.js`
- O `<canvas>` precisa de `tabindex="-1"` e chamadas `canvas.focus()` para os atalhos de teclado funcionarem

### 3. Verificar

Com o servidor rodando e a pasta `simulador/` no lugar, acesse `http://localhost:8000/` e confirme que a seção **Cursos** carrega o simulador sem erros no console.

