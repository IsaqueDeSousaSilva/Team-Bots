// Testes da API e das regras do banco.  Rodar:  node --test backend/tests/api.test.mjs
// Cada teste usa um banco em memória, então nada toca o banco real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { conectar, carregarDadosIniciais, executar, um, todos, agora, SENHA_DEMO } from '../db.mjs';
import { criarApp } from '../server.mjs';
import { cadastrarVideoaula } from '../scripts/cadastrar-videoaula.mjs';

async function subir() {
  const db = conectar(':memory:');
  carregarDadosIniciais(db);
  const servidor = createServer(criarApp(db));
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const chamar = async (caminho, { corpo, token, metodo } = {}) => {
    const r = await fetch(base + caminho, {
      method: metodo || (corpo ? 'POST' : 'GET'),
      headers: { ...(corpo && { 'Content-Type': 'application/json' }), ...(token && { Authorization: 'Bearer ' + token }) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const tipo = r.headers.get('content-type') || '';
    return { status: r.status, tipo, dados: tipo.includes('json') ? await r.json() : await r.text() };
  };
  const entrar = async (login = 'aluno.demo') =>
    (await chamar('/api/login', { corpo: { login, senha: SENHA_DEMO } })).dados.token;
  return { db, base, chamar, entrar, fechar: () => new Promise((ok) => servidor.close(ok)) };
}

test('a videoaula cadastrada aparece no curso e mantém seu progresso após edição', async () => {
  const s = await subir();
  try {
    const aula = ['primeiros-circuitos', '6', 'Videoaula de teste', 'https://example.com/aula', 'Materiais da aula'];
    const id = cadastrarVideoaula(s.db, aula);
    assert.throws(() => cadastrarVideoaula(s.db, [aula[0], '1', ...aula.slice(2)]), /outro tipo/);
    assert.throws(() => cadastrarVideoaula(s.db, [...aula.slice(0, 3), 'javascript:void(0)']), /HTTPS/);
    const token = await s.entrar();
    assert.equal((await s.chamar('/api/aulas/' + id + '/concluir', { corpo: {}, token })).status, 200);
    assert.equal(cadastrarVideoaula(s.db, [...aula.slice(0, 2), 'Título revisado', ...aula.slice(3)]), id);
    const { aulas } = (await s.chamar('/api/cursos/primeiros-circuitos', { token })).dados;
    assert.deepEqual(aulas.find(a => a.id === id), {
      id, ordem: 6, titulo: 'Título revisado', tipo: 'video', resumo: 'Materiais da aula',
      recurso_url: 'https://example.com/aula', concluida: true,
    });
  } finally { await s.fechar(); }
});

test('a carga sem demonstração cria o catálogo sem contas nem turmas fictícias', () => {
  const db = conectar(':memory:');
  try {
    assert.equal(carregarDadosIniciais(db, { demo: false }), true);
    assert.equal(carregarDadosIniciais(db, { demo: false }), false);
    assert.equal(todos(db, 'SELECT id FROM cursos').length, 1);
    assert.equal(todos(db, 'SELECT id FROM usuarios').length, 0);
    assert.equal(todos(db, 'SELECT id FROM turmas').length, 0);
  } finally { db.close(); }
});

test('servidor entrega site e Unity com cabeçalhos compatíveis', async () => {
  const s = await subir();
  try {
    const pagina = await fetch(s.base);
    const html = await pagina.text();
    assert.match(html, /id="cursos-online"/);
    assert.match(html, /id="unity-canvas"/);
    assert.equal(pagina.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(pagina.headers.get('cross-origin-embedder-policy'), 'require-corp');
    for (const [arquivo, tipo] of [
      ['wasm.unityweb', 'application/wasm'],
      ['framework.js.unityweb', 'application/javascript'],
      ['data.unityweb', 'application/octet-stream'],
    ]) {
      const resposta = await fetch(s.base + '/simulador/Build/WebGL.' + arquivo, { method: 'HEAD' });
      assert.equal(resposta.status, 200);
      assert.equal(resposta.headers.get('content-type'), tipo);
      assert.equal(resposta.headers.get('content-encoding'), 'gzip');
    }
  } finally { await s.fechar(); }
});

test('carga inicial reproduz o conteúdo que estava fixo no index.html', async () => {
  const s = await subir();
  try {
    const conteudos = (await s.chamar('/api/conteudos')).dados;
    assert.deepEqual(conteudos.map((c) => c.titulo),
      ['Últimas notícias de tecnologia', 'Atualizações da Empresa', 'Tendências de IA', 'Vitrine de Projetos']);
    assert.equal((await s.chamar('/api/faq')).dados.length, 6);
    const topicos = (await s.chamar('/api/forum/topicos')).dados;
    assert.equal(topicos.length, 3);
    assert.equal(topicos[0].comentarios, 2);
    assert.deepEqual(topicos[0].participantes, ['Joraph Robad', 'Junen Shammie']);
    assert.equal((await s.chamar('/api/saude')).dados.versao_schema, 1);
  } finally { await s.fechar(); }
});

test('carga inicial não duplica dados se rodar duas vezes', async () => {
  const s = await subir();
  try {
    assert.equal(carregarDadosIniciais(s.db), false);
    assert.equal(um(s.db, 'SELECT count(*) AS n FROM conteudos').n, 4);
  } finally { await s.fechar(); }
});

test('cadastro cria conta, vincula turma pelo código e não grava a senha', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('/api/cadastro', { corpo: { nome: 'Bia', login: 'bia9a', senha: 'segredo-123', codigo_turma: 'demo-9a' } });
    assert.equal(r.status, 201);
    assert.ok(r.dados.token);
    const linha = um(s.db, 'SELECT * FROM usuarios WHERE login = ?', 'bia9a');
    assert.equal(linha.papel, 'aluno');
    assert.equal(linha.turma_id, 1);
    assert.ok(!linha.senha_hash.includes('segredo-123'));
    assert.equal((await s.chamar('/api/eu', { token: r.dados.token })).dados.login, 'bia9a');
    // o token puro não fica no banco
    assert.equal(um(s.db, 'SELECT count(*) AS n FROM sessoes WHERE token_hash = ?', r.dados.token).n, 0);
  } finally { await s.fechar(); }
});

test('cadastro recusa login repetido, senha curta e código de turma inexistente', async () => {
  const s = await subir();
  try {
    const base = { nome: 'Teste', login: 'novo.login', senha: 'segredo-123' };
    assert.equal((await s.chamar('/api/cadastro', { corpo: { ...base, login: 'ALUNO.DEMO' } })).status, 409);
    assert.equal((await s.chamar('/api/cadastro', { corpo: { ...base, senha: '123' } })).status, 400);
    assert.equal((await s.chamar('/api/cadastro', { corpo: { ...base, codigo_turma: 'NAO-EXISTE' } })).status, 400);
    assert.equal((await s.chamar('/api/cadastro', { corpo: { ...base, login: 'com espaço' } })).status, 400);
    assert.equal(um(s.db, "SELECT count(*) AS n FROM usuarios WHERE login = 'novo.login'").n, 0);
  } finally { await s.fechar(); }
});

test('cadastro nunca cria conta com papel elevado, mesmo se o navegador pedir', async () => {
  const s = await subir();
  try {
    await s.chamar('/api/cadastro', { corpo: { nome: 'Esperto', login: 'esperto', senha: 'segredo-123', papel: 'admin' } });
    assert.equal(um(s.db, "SELECT papel FROM usuarios WHERE login = 'esperto'").papel, 'aluno');
  } finally { await s.fechar(); }
});

test('login: senha errada é recusada; logout invalida o token', async () => {
  const s = await subir();
  try {
    assert.equal((await s.chamar('/api/login', { corpo: { login: 'aluno.demo', senha: 'errada-123' } })).status, 401);
    assert.equal((await s.chamar('/api/login', { corpo: { login: 'nao.existe', senha: SENHA_DEMO } })).status, 401);
    const token = await s.entrar();
    assert.equal((await s.chamar('/api/eu', { token })).status, 200);
    await s.chamar('/api/logout', { corpo: {}, token });
    assert.equal((await s.chamar('/api/eu', { token })).status, 401);
  } finally { await s.fechar(); }
});

test('sessão vencida não vale', async () => {
  const s = await subir();
  try {
    const token = await s.entrar();
    executar(s.db, "UPDATE sessoes SET expira_em = '2000-01-01T00:00:00.000Z'");
    assert.equal((await s.chamar('/api/eu', { token })).status, 401);
  } finally { await s.fechar(); }
});

test('fórum: só comenta logado; resposta precisa ser do mesmo tópico', async () => {
  const s = await subir();
  try {
    const rota = '/api/forum/topicos/2/comentarios';
    assert.equal((await s.chamar(rota, { corpo: { texto: 'oi' } })).status, 401);
    const token = await s.entrar();
    assert.equal((await s.chamar(rota, { corpo: { texto: '   ' }, token })).status, 400);
    // comentário 1 é do tópico 1, não pode ser respondido dentro do tópico 2
    assert.equal((await s.chamar(rota, { corpo: { texto: 'oi', resposta_a: 1 }, token })).status, 400);
    assert.equal((await s.chamar('/api/forum/topicos/99/comentarios', { corpo: { texto: 'oi' }, token })).status, 404);
    assert.equal((await s.chamar(rota, { corpo: { texto: 'Primeiro!' }, token })).status, 201);
    const topicos = (await s.chamar('/api/forum/topicos')).dados;
    assert.equal(topicos[1].comentarios, 1);
    assert.deepEqual(topicos[1].participantes, ['Aluno Demonstração']);
  } finally { await s.fechar(); }
});

test('fórum: comentário oculto pela moderação some da lista e da contagem', async () => {
  const s = await subir();
  try {
    executar(s.db, 'UPDATE forum_comentarios SET oculto = 1 WHERE id = 2');
    assert.equal((await s.chamar('/api/forum/topicos')).dados[0].comentarios, 1);
    assert.equal((await s.chamar('/api/forum/topicos/1/comentarios')).dados.length, 1);
  } finally { await s.fechar(); }
});

test('cursos: concluir aula matricula, registra progresso e não conta duas vezes', async () => {
  const s = await subir();
  try {
    assert.equal((await s.chamar('/api/cursos')).dados[0].aulas, 5);
    assert.equal((await s.chamar('/api/aulas/1/concluir', { corpo: {} })).status, 401);
    const token = await s.entrar();
    await s.chamar('/api/aulas/1/concluir', { corpo: {}, token });
    await s.chamar('/api/aulas/1/concluir', { corpo: {}, token });
    const r = await s.chamar('/api/aulas/2/concluir', { corpo: {}, token });
    assert.deepEqual(r.dados, { slug: 'primeiros-circuitos', titulo: 'Primeiros circuitos', aulas_total: 5, aulas_concluidas: 2 });
    const curso = (await s.chamar('/api/cursos/primeiros-circuitos', { token })).dados;
    assert.deepEqual(curso.aulas.map((a) => a.concluida), [true, true, false, false, false]);
    // visitante vê o curso, sem progresso
    const anonimo = (await s.chamar('/api/cursos/primeiros-circuitos')).dados;
    assert.ok(anonimo.aulas.every((a) => a.concluida === false));
    assert.equal((await s.chamar('/api/aulas/999/concluir', { corpo: {}, token })).status, 404);
  } finally { await s.fechar(); }
});

test('curso não publicado não aparece', async () => {
  const s = await subir();
  try {
    executar(s.db, 'UPDATE cursos SET publicado = 0');
    assert.equal((await s.chamar('/api/cursos')).dados.length, 0);
    assert.equal((await s.chamar('/api/cursos/primeiros-circuitos')).status, 404);
  } finally { await s.fechar(); }
});

test('simulador: salva .simu, regrava com o mesmo título e isola por usuário', async () => {
  const s = await subir();
  try {
    const token = await s.entrar();
    const arquivo = JSON.stringify({ componentes: ['pilha', 'pilha', 'led'], fios: 3 });
    const a = await s.chamar('/api/simulador/projetos', { corpo: { titulo: 'Meu LED', arquivo_simu: arquivo }, token });
    assert.equal(a.status, 201);
    const b = await s.chamar('/api/simulador/projetos', { corpo: { titulo: 'Meu LED', arquivo_simu: arquivo + ' ' }, token });
    assert.equal(b.dados.id, a.dados.id);
    assert.equal((await s.chamar('/api/simulador/projetos', { token })).dados.length, 1);
    assert.equal((await s.chamar(`/api/simulador/projetos/${a.dados.id}`, { token })).dados.arquivo_simu, arquivo);
    // outra pessoa não enxerga
    const outro = await s.entrar('junen.demo');
    assert.equal((await s.chamar(`/api/simulador/projetos/${a.dados.id}`, { token: outro })).status, 404);
    assert.equal((await s.chamar('/api/simulador/projetos', { token: outro })).dados.length, 0);
    assert.equal((await s.chamar('/api/simulador/projetos')).status, 401);
  } finally { await s.fechar(); }
});

test('indicadores: só equipe; números batem com o que foi feito', async () => {
  const s = await subir();
  try {
    const aluno = await s.entrar();
    assert.equal((await s.chamar('/api/indicadores', { token: aluno })).status, 403);
    assert.equal((await s.chamar('/api/indicadores')).status, 401);
    await s.chamar('/api/aulas/1/concluir', { corpo: {}, token: aluno });
    await s.chamar('/api/simulador/projetos', { corpo: { titulo: 'X', arquivo_simu: '{}' }, token: aluno });
    const equipe = await s.entrar('equipe.demo');
    const r = (await s.chamar('/api/indicadores', { token: equipe })).dados;
    assert.deepEqual(r.escolas[0], {
      escola_id: 1, escola: 'Escola Exemplo (fictícia)', status_parceria: 'prospeccao',
      turmas: 1, alunos_cadastrados: 3, aulas_concluidas: 1, circuitos_salvos: 1,
    });
  } finally { await s.fechar(); }
});

test('banco: regras de integridade recusam dados inválidos', async () => {
  const s = await subir();
  try {
    const t = agora();
    assert.throws(() => executar(s.db, "INSERT INTO usuarios (nome_exibicao, login, senha_hash, papel, criado_em) VALUES ('X', 'x1', 'h', 'chefe', ?)", t));
    assert.throws(() => executar(s.db, "INSERT INTO turmas (escola_id, nome, etapa, ano_letivo, codigo_convite, criado_em) VALUES (999, 'T', 'medio', 2026, 'ZZ', ?)", t));
    assert.throws(() => executar(s.db, "INSERT INTO aulas (curso_id, ordem, titulo, tipo, resumo) VALUES (1, 1, 'Repetida', 'texto', 'x')"));
    assert.throws(() => executar(s.db, "INSERT INTO escolas (nome, cidade, uf, rede, criado_em) VALUES ('E', 'Uberaba', 'MGS', 'municipal', ?)", t));
    assert.throws(() => executar(s.db, 'INSERT INTO progresso_aulas VALUES (4, 12345, ?)', t));
  } finally { await s.fechar(); }
});

test('banco: apagar usuário leva junto sessões, progresso, circuitos e comentários', async () => {
  const s = await subir();
  try {
    const r = await s.chamar('/api/cadastro', { corpo: { nome: 'Temp', login: 'temp', senha: 'segredo-123' } });
    const { token, usuario } = r.dados;
    await s.chamar('/api/aulas/1/concluir', { corpo: {}, token });
    await s.chamar('/api/simulador/projetos', { corpo: { titulo: 'X', arquivo_simu: '{}' }, token });
    await s.chamar('/api/forum/topicos/1/comentarios', { corpo: { texto: 'Vou sair' }, token });
    executar(s.db, 'DELETE FROM usuarios WHERE id = ?', usuario.id);
    assert.equal(um(s.db, 'SELECT count(*) AS n FROM forum_comentarios WHERE autor_id = ?', usuario.id).n, 0);
    assert.equal(um(s.db, 'SELECT count(*) AS n FROM forum_comentarios').n, 2); // os dos outros continuam
    for (const tabela of ['sessoes', 'matriculas', 'progresso_aulas', 'simulador_projetos'])
      assert.equal(um(s.db, `SELECT count(*) AS n FROM ${tabela} WHERE usuario_id = ?`, usuario.id).n, 0, tabela);
    assert.equal(todos(s.db, 'PRAGMA foreign_key_check').length, 0);
  } finally { await s.fechar(); }
});

test('servidor: entrega o site, mas nunca o backend, o banco ou caminhos fora da pasta', async () => {
  const s = await subir();
  try {
    const pagina = await s.chamar('/');
    assert.equal(pagina.status, 200);
    assert.ok(pagina.dados.includes('TEAM BOTS'));
    assert.equal((await s.chamar('/api.js')).status, 200);
    for (const caminho of ['/backend/schema.sql', '/backend/data/teambots.sqlite', '/.git/config', '/.gitignore',
      '/..%2f..%2fetc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/nao-existe.html'])
      assert.equal((await s.chamar(caminho)).status, 404, caminho);
    assert.equal((await s.chamar('/api/nao-existe')).status, 404);
    assert.equal((await s.chamar('/', { metodo: 'DELETE' })).status, 405);
  } finally { await s.fechar(); }
});

test('servidor: JSON quebrado e corpo gigante não derrubam a API', async () => {
  const s = await subir();
  try {
    const base = (await s.chamar('/api/saude')).status;
    assert.equal(base, 200);
    const token = await s.entrar();
    const grande = await s.chamar('/api/simulador/projetos', { corpo: { titulo: 'G', arquivo_simu: 'x'.repeat(1_300_000) }, token });
    assert.equal(grande.status, 413);
    const quebrado = await fetch(s.base + '/api/login', { method: 'POST', body: '{"login": ' });
    assert.equal(quebrado.status, 400);
    const lista = await fetch(s.base + '/api/login', { method: 'POST', body: '[1,2]' });
    assert.equal(lista.status, 400);
    assert.equal((await s.chamar('/api/saude')).status, 200);
  } finally { await s.fechar(); }
});
