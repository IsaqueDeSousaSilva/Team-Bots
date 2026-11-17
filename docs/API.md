# API do Team Bots

Base local: `http://127.0.0.1:3000/api`. Tudo em JSON. Os exemplos com turma, fórum e contas de demonstração usam o servidor iniciado com `--demo`.

- Rotas marcadas com 🔒 exigem o cabeçalho `Authorization: Bearer <token>`.
  O token vem na resposta de `/cadastro` ou `/login` e vale 7 dias.
- Erros sempre no formato `{ "erro": "mensagem em português" }`, com o status
  HTTP correspondente (400 dado inválido, 401 sem login, 403 sem permissão,
  404 não encontrado, 409 conflito, 413 grande demais).

## Resumo

| Método | Rota | Para quê |
|---|---|---|
| GET | `/saude` | Confere se a API está no ar e a versão do schema |
| GET | `/conteudos` | Cartões "Conteúdos em destaque" |
| GET | `/faq` | Perguntas frequentes, em ordem |
| GET | `/forum/topicos` | Tópicos com contagem de comentários e participantes |
| GET | `/forum/topicos/:id/comentarios` | Comentários visíveis de um tópico |
| POST 🔒 | `/forum/topicos/:id/comentarios` | Publica comentário ou resposta |
| POST | `/cadastro` | Cria conta de aluno e já devolve o token |
| POST | `/login` | Entra e devolve o token |
| POST | `/logout` | Invalida o token |
| GET 🔒 | `/eu` | Dados de quem está logado |
| GET | `/cursos` | Cursos publicados |
| GET | `/cursos/:slug` | Curso com as aulas (e o que já foi concluído, se logado) |
| POST 🔒 | `/aulas/:id/concluir` | Marca a aula como concluída |
| GET 🔒 | `/meu-progresso` | Progresso por curso |
| GET 🔒 | `/simulador/projetos` | Circuitos salvos na conta |
| GET 🔒 | `/simulador/projetos/:id` | Um circuito, com o conteúdo do `.simu` |
| POST 🔒 | `/simulador/projetos` | Salva (ou regrava) um circuito |
| GET 🔒 | `/indicadores` | Números por escola — só papel `equipe`, `professor` ou `admin` |

## Exemplos

Os exemplos usam `curl`. No PowerShell, troque `curl` por `curl.exe`.

### Cadastro

```
curl -X POST http://localhost:3000/api/cadastro \
  -H "Content-Type: application/json" \
  -d '{"nome":"Bia","login":"bia9a","senha":"segredo-123","codigo_turma":"DEMO-9A"}'
```

```json
{
  "usuario": { "id": 5, "nome_exibicao": "Bia", "login": "bia9a", "papel": "aluno" },
  "token": "4f1c…",
  "expira_em": "2026-11-17T13:00:00.000Z"
}
```

Regras: `nome` 2–60 caracteres; `login` 3–60 (letras, números, `.`, `-`, `_`, `@`, `+`);
`senha` 8–100; `codigo_turma` opcional. O papel é sempre `aluno` — a API ignora
qualquer `papel` enviado pelo navegador.

### Login

```
curl -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"login":"aluno.demo","senha":"TeamBots!2026"}'
```

### Comentar no fórum

```
curl -X POST http://localhost:3000/api/forum/topicos/1/comentarios \
  -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" \
  -d '{"texto":"Dá para montar um bot com Arduino?","resposta_a":1}'
```

`resposta_a` é opcional e precisa ser um comentário do mesmo tópico.

### Concluir aula

```
curl -X POST http://localhost:3000/api/aulas/2/concluir \
  -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" -d '{}'
```

```json
{ "slug": "primeiros-circuitos", "titulo": "Primeiros circuitos", "aulas_total": 5, "aulas_concluidas": 2 }
```

Concluir a primeira aula já matricula o aluno no curso. Repetir a chamada não conta duas vezes.

### Salvar circuito do simulador

```
curl -X POST http://localhost:3000/api/simulador/projetos \
  -H "Content-Type: application/json" -H "Authorization: Bearer TOKEN" \
  -d '{"titulo":"Meu LED","versao_simulador":"0.5","arquivo_simu":"<conteúdo do arquivo .simu>"}'
```

Mesmo `titulo` do mesmo aluno = regrava o circuito. Limite de 1 MB. Cada aluno só enxerga os próprios.

> Hoje o simulador (build Unity v0.5) salva o `.simu` como download do navegador.
> Para o botão Salvar gravar direto na conta, o G3 precisa expor uma chamada
> JavaScript com o conteúdo do arquivo. A API e a tabela já estão prontas para receber.

### Indicadores da extensão

```
curl http://localhost:3000/api/indicadores -H "Authorization: Bearer TOKEN_DA_EQUIPE"
```

```json
{
  "gerado_em": "2026-11-10T13:00:00.000Z",
  "usuarios": 5,
  "comentarios": 3,
  "escolas": [
    { "escola_id": 1, "escola": "Escola Exemplo (fictícia)", "status_parceria": "prospeccao",
      "turmas": 1, "alunos_cadastrados": 4, "aulas_concluidas": 2, "circuitos_salvos": 0 }
  ]
}
```
