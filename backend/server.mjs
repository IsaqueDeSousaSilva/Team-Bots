// Servidor do Team Bots: entrega o site (index.html, style.css, script.js…)
// e a API /api/* que lê e grava no banco. Sem dependências externas.
//
//   node backend/server.mjs            → http://localhost:3000
//   PORTA=8080 node backend/server.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  pastaBackend, bancoDemo, agora, conectar, carregarDadosIniciais, todos, um, executar, transacao,
  gerarHashSenha, conferirSenha, hashToken,
} from './db.mjs';

const RAIZ_SITE = dirname(pastaBackend);
const DIAS_SESSAO = 7;
const LIMITE_CORPO = 1_200_000; // bytes (cabe um .simu de 1 MB)
const ARQUIVOS_PUBLICOS = new Set(['index.html', 'style.css', 'script.js', 'banco.css', 'api.js']);
const TIPOS_UNITY = {
  '.wasm.unityweb': 'application/wasm',
  '.js.unityweb': 'application/javascript',
  '.data.unityweb': 'application/octet-stream',
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.unityweb': 'application/octet-stream', '.data': 'application/octet-stream',
};

class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}
const exigir = (condicao, status, mensagem) => { if (!condicao) throw new ErroHttp(status, mensagem); };
const texto = (valor, min, max, campo) => {
  exigir(typeof valor === 'string', 400, `Campo "${campo}" é obrigatório.`);
  const limpo = valor.trim();
  exigir(limpo.length >= min && limpo.length <= max, 400, `Campo "${campo}" deve ter de ${min} a ${max} caracteres.`);
  return limpo;
};

async function lerJson(req) {
  let tamanho = 0;
  const partes = [];
  for await (const parte of req) {
    tamanho += parte.length;
    // Passou do limite: para de guardar, mas termina de receber para conseguir
    // responder 413 direito. Se for absurdo, corta a conexão.
    if (tamanho > LIMITE_CORPO * 8) { req.destroy(); throw new ErroHttp(413, 'Conteúdo grande demais.'); }
    if (tamanho <= LIMITE_CORPO) partes.push(parte);
  }
  exigir(tamanho <= LIMITE_CORPO, 413, 'Conteúdo grande demais.');
  if (!partes.length) return {};
  try {
    const dados = JSON.parse(Buffer.concat(partes).toString('utf8'));
    exigir(dados && typeof dados === 'object' && !Array.isArray(dados), 400, 'JSON inválido.');
    return dados;
  } catch (erro) {
    if (erro instanceof ErroHttp) throw erro;
    throw new ErroHttp(400, 'JSON inválido.');
  }
}

export function criarApp(db) {
  // ---------- sessão ----------
  function abrirSessao(usuarioId) {
    const token = randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + DIAS_SESSAO * 864e5).toISOString();
    executar(db, 'DELETE FROM sessoes WHERE expira_em < ?', agora());
    executar(db, 'INSERT INTO sessoes VALUES (?, ?, ?, ?)', hashToken(token), usuarioId, agora(), expira);
    return { token, expira_em: expira };
  }
  function usuarioDaRequisicao(req) {
    const cabecalho = req.headers.authorization || '';
    if (!cabecalho.startsWith('Bearer ')) return null;
    return um(db, `SELECT u.id, u.nome_exibicao, u.login, u.papel, u.turma_id
                     FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
                    WHERE s.token_hash = ? AND s.expira_em > ? AND u.ativo = 1`,
      hashToken(cabecalho.slice(7)), agora()) || null;
  }
  const logado = (req) => {
    const usuario = usuarioDaRequisicao(req);
    exigir(usuario, 401, 'Faça login para continuar.');
    return usuario;
  };

  // ---------- rotas: [método, expressão, função(contexto)] ----------
  const rotas = [
    ['GET', /^\/api\/saude$/, () => ({
      ok: true,
      versao_schema: um(db, 'SELECT max(versao) AS v FROM schema_version').v,
      agora: agora(),
    })],

    // --- página inicial ---
    ['GET', /^\/api\/conteudos$/, () => todos(db,
      `SELECT id, titulo, resumo, cor, imagem, texto_link, url, publicado_em
         FROM conteudos WHERE visivel = 1 ORDER BY id`)],
    ['GET', /^\/api\/faq$/, () => todos(db, 'SELECT id, pergunta, resposta FROM faq ORDER BY ordem')],

    // --- fórum ---
    ['GET', /^\/api\/forum\/topicos$/, () => todos(db, 'SELECT * FROM vw_forum_topicos ORDER BY id').map((t) => ({
      ...t,
      participantes: todos(db, `SELECT DISTINCT u.nome_exibicao AS nome FROM forum_comentarios c
                                  JOIN usuarios u ON u.id = c.autor_id
                                 WHERE c.topico_id = ? AND c.oculto = 0 LIMIT 3`, t.id).map((p) => p.nome),
    }))],
    ['GET', /^\/api\/forum\/topicos\/(\d+)\/comentarios$/, ({ ids }) => {
      exigir(um(db, 'SELECT 1 FROM forum_topicos WHERE id = ?', ids[0]), 404, 'Tópico não encontrado.');
      return todos(db, `SELECT c.id, c.resposta_a, c.texto, c.criado_em, u.nome_exibicao AS autor
                          FROM forum_comentarios c JOIN usuarios u ON u.id = c.autor_id
                         WHERE c.topico_id = ? AND c.oculto = 0 ORDER BY c.criado_em, c.id`, ids[0]);
    }],
    ['POST', /^\/api\/forum\/topicos\/(\d+)\/comentarios$/, ({ req, ids, corpo }) => {
      const usuario = logado(req);
      exigir(um(db, 'SELECT 1 FROM forum_topicos WHERE id = ?', ids[0]), 404, 'Tópico não encontrado.');
      const mensagem = texto(corpo.texto, 1, 1000, 'texto');
      let respostaA = null;
      if (corpo.resposta_a != null) {
        respostaA = Number(corpo.resposta_a);
        exigir(um(db, 'SELECT 1 FROM forum_comentarios WHERE id = ? AND topico_id = ?', respostaA, ids[0]),
          400, 'O comentário respondido não pertence a este tópico.');
      }
      const r = executar(db, `INSERT INTO forum_comentarios (topico_id, autor_id, resposta_a, texto, criado_em)
                              VALUES (?, ?, ?, ?, ?)`, ids[0], usuario.id, respostaA, mensagem, agora());
      return { status: 201, corpo: { id: Number(r.lastInsertRowid) } };
    }],

    // --- acesso ---
    ['POST', /^\/api\/cadastro$/, ({ corpo }) => {
      const nome = texto(corpo.nome, 2, 60, 'nome');
      const login = texto(corpo.login, 3, 60, 'login');
      exigir(/^[\w.@+-]+$/.test(login), 400, 'O login aceita letras, números, ponto, traço e @.');
      const senha = texto(corpo.senha, 8, 100, 'senha');
      let turmaId = null;
      if (corpo.codigo_turma) {
        const turma = um(db, 'SELECT id FROM turmas WHERE codigo_convite = ?', String(corpo.codigo_turma).trim().toUpperCase());
        exigir(turma, 400, 'Código da turma não encontrado.');
        turmaId = turma.id;
      }
      exigir(!um(db, 'SELECT 1 FROM usuarios WHERE login = ?', login), 409, 'Este login já está em uso.');
      return transacao(db, () => {
        const r = executar(db, `INSERT INTO usuarios (nome_exibicao, login, email, senha_hash, papel, turma_id, criado_em)
                                VALUES (?, ?, ?, ?, 'aluno', ?, ?)`,
          nome, login, login.includes('@') ? login : null, gerarHashSenha(senha), turmaId, agora());
        const id = Number(r.lastInsertRowid);
        return { status: 201, corpo: { usuario: { id, nome_exibicao: nome, login, papel: 'aluno' }, ...abrirSessao(id) } };
      });
    }],
    ['POST', /^\/api\/login$/, ({ corpo }) => {
      const login = texto(corpo.login, 1, 60, 'login');
      const senha = texto(corpo.senha, 1, 100, 'senha');
      const u = um(db, 'SELECT id, nome_exibicao, login, papel, senha_hash FROM usuarios WHERE login = ? AND ativo = 1', login);
      exigir(u && conferirSenha(senha, u.senha_hash), 401, 'Login ou senha incorretos.');
      const { senha_hash, ...usuario } = u;
      return { usuario, ...abrirSessao(u.id) };
    }],
    ['POST', /^\/api\/logout$/, ({ req }) => {
      const cabecalho = req.headers.authorization || '';
      if (cabecalho.startsWith('Bearer ')) executar(db, 'DELETE FROM sessoes WHERE token_hash = ?', hashToken(cabecalho.slice(7)));
      return { ok: true };
    }],
    ['GET', /^\/api\/eu$/, ({ req }) => logado(req)],

    // --- cursos e progresso ---
    ['GET', /^\/api\/cursos$/, () => todos(db,
      `SELECT c.slug, c.titulo, c.descricao, c.etapa, d.nome AS disciplina,
              (SELECT count(*) FROM aulas a WHERE a.curso_id = c.id) AS aulas
         FROM cursos c JOIN disciplinas d ON d.id = c.disciplina_id
        WHERE c.publicado = 1 ORDER BY c.id`)],
    ['GET', /^\/api\/cursos\/([a-z0-9-]+)$/, ({ req, ids }) => {
      const curso = um(db, `SELECT c.id, c.slug, c.titulo, c.descricao, c.etapa, d.nome AS disciplina
                              FROM cursos c JOIN disciplinas d ON d.id = c.disciplina_id
                             WHERE c.slug = ? AND c.publicado = 1`, ids[0]);
      exigir(curso, 404, 'Curso não encontrado.');
      const usuario = usuarioDaRequisicao(req);
      const aulas = todos(db, `SELECT a.id, a.ordem, a.titulo, a.tipo, a.resumo, a.recurso_url,
                                      EXISTS (SELECT 1 FROM progresso_aulas p
                                               WHERE p.aula_id = a.id AND p.usuario_id = ?) AS concluida
                                 FROM aulas a WHERE a.curso_id = ? ORDER BY a.ordem`, usuario?.id ?? 0, curso.id)
        .map((a) => ({ ...a, concluida: !!a.concluida }));
      const { id, ...publico } = curso;
      return { ...publico, aulas };
    }],
    ['POST', /^\/api\/aulas\/(\d+)\/concluir$/, ({ req, ids }) => {
      const usuario = logado(req);
      const aula = um(db, 'SELECT a.id, a.curso_id FROM aulas a JOIN cursos c ON c.id = a.curso_id WHERE a.id = ? AND c.publicado = 1', ids[0]);
      exigir(aula, 404, 'Aula não encontrada.');
      transacao(db, () => {
        executar(db, 'INSERT OR IGNORE INTO matriculas VALUES (?, ?, ?)', usuario.id, aula.curso_id, agora());
        executar(db, 'INSERT OR IGNORE INTO progresso_aulas VALUES (?, ?, ?)', usuario.id, aula.id, agora());
      });
      return um(db, 'SELECT slug, titulo, aulas_total, aulas_concluidas FROM vw_progresso_curso WHERE usuario_id = ? AND curso_id = ?',
        usuario.id, aula.curso_id);
    }],
    ['GET', /^\/api\/meu-progresso$/, ({ req }) => todos(db,
      'SELECT slug, titulo, aulas_total, aulas_concluidas FROM vw_progresso_curso WHERE usuario_id = ?', logado(req).id)],

    // --- simulador: circuitos (.simu) guardados na conta ---
    ['GET', /^\/api\/simulador\/projetos$/, ({ req }) => todos(db,
      `SELECT id, titulo, versao_simulador, length(arquivo_simu) AS tamanho, atualizado_em
         FROM simulador_projetos WHERE usuario_id = ? ORDER BY atualizado_em DESC`, logado(req).id)],
    ['GET', /^\/api\/simulador\/projetos\/(\d+)$/, ({ req, ids }) => {
      const projeto = um(db, `SELECT id, titulo, versao_simulador, arquivo_simu, atualizado_em
                                FROM simulador_projetos WHERE id = ? AND usuario_id = ?`, ids[0], logado(req).id);
      exigir(projeto, 404, 'Projeto não encontrado.');
      return projeto;
    }],
    ['POST', /^\/api\/simulador\/projetos$/, ({ req, corpo }) => {
      const usuario = logado(req);
      const titulo = texto(corpo.titulo, 1, 80, 'titulo');
      const versao = texto(corpo.versao_simulador ?? '0.5', 1, 20, 'versao_simulador');
      const arquivo = texto(corpo.arquivo_simu, 1, 1_048_576, 'arquivo_simu');
      const t = agora();
      // mesmo título = nova versão do mesmo circuito (grava por cima)
      executar(db, `INSERT INTO simulador_projetos (usuario_id, titulo, versao_simulador, arquivo_simu, criado_em, atualizado_em)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT (usuario_id, titulo) DO UPDATE
                       SET arquivo_simu = excluded.arquivo_simu,
                           versao_simulador = excluded.versao_simulador,
                           atualizado_em = excluded.atualizado_em`, usuario.id, titulo, versao, arquivo, t, t);
      const { id } = um(db, 'SELECT id FROM simulador_projetos WHERE usuario_id = ? AND titulo = ?', usuario.id, titulo);
      return { status: 201, corpo: { id } };
    }],

    // --- indicadores da extensão (só equipe/professor) ---
    ['GET', /^\/api\/indicadores$/, ({ req }) => {
      exigir(['equipe', 'professor', 'admin'].includes(logado(req).papel), 403, 'Acesso restrito à equipe.');
      return {
        gerado_em: agora(),
        usuarios: um(db, 'SELECT count(*) AS n FROM usuarios WHERE ativo = 1').n,
        comentarios: um(db, 'SELECT count(*) AS n FROM forum_comentarios WHERE oculto = 0').n,
        escolas: todos(db, 'SELECT * FROM vw_indicadores_escola ORDER BY escola'),
      };
    }],
  ];

  // ---------- arquivos do site ----------
  async function servirArquivo(caminhoUrl, req, res) {
    let relativo;
    try { relativo = decodeURIComponent(caminhoUrl); } catch { throw new ErroHttp(400, 'Endereço inválido.'); }
    if (relativo.endsWith('/')) relativo += 'index.html';
    relativo = relativo.slice(1);
    const unity = /^simulador\/(?:index\.html|Build\/WebGL\.(?:loader\.js|framework\.js\.unityweb|wasm\.unityweb|data\.unityweb))$/.test(relativo);
    exigir(ARQUIVOS_PUBLICOS.has(relativo) || unity, 404, 'Não encontrado.');
    const destino = join(RAIZ_SITE, relativo);
    let conteudo;
    try { conteudo = await readFile(destino); } catch { throw new ErroHttp(404, 'Não encontrado.'); }
    const tipoUnity = Object.keys(TIPOS_UNITY).find((sufixo) => relativo.endsWith(sufixo));
    res.writeHead(200, {
      'Content-Type': TIPOS_UNITY[tipoUnity] || TIPOS[extname(destino).toLowerCase()] || 'application/octet-stream',
      ...(tipoUnity && conteudo[0] === 0x1f && conteudo[1] === 0x8b ? { 'Content-Encoding': 'gzip' } : {}),
      'Content-Length': conteudo.length,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : conteudo);
  }

  // ---------- entrada ----------
  return async function atender(req, res) {
    const url = new URL(req.url, 'http://local');
    const responderJson = (status, corpo) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(corpo));
    };
    try {
      if (!url.pathname.startsWith('/api/')) {
        exigir(req.method === 'GET' || req.method === 'HEAD', 405, 'Método não permitido.');
        return await servirArquivo(url.pathname, req, res);
      }
      for (const [metodo, expressao, funcao] of rotas) {
        const achou = url.pathname.match(expressao);
        if (!achou || metodo !== req.method) continue;
        const corpo = req.method === 'POST' ? await lerJson(req) : {};
        const saida = await funcao({ req, corpo, ids: achou.slice(1) });
        return saida && saida.status && saida.corpo
          ? responderJson(saida.status, saida.corpo)
          : responderJson(200, saida);
      }
      throw new ErroHttp(404, 'Rota não encontrada.');
    } catch (erro) {
      if (erro instanceof ErroHttp) return responderJson(erro.status, { erro: erro.message });
      console.error(erro);
      return responderJson(500, { erro: 'Erro interno.' });
    }
  };
}

// Só sobe o servidor quando este arquivo é executado diretamente.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const demo = process.argv.includes('--demo');
  const host = process.env.HOST || '127.0.0.1';
  if (demo && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('A demonstração deve rodar em loopback.');
  const db = conectar(process.env.BANCO || (demo ? bancoDemo : undefined));
  if (!demo && um(db, "SELECT 1 FROM usuarios WHERE login IN ('equipe.demo', 'aluno.demo', 'joraph.demo', 'junen.demo')")) {
    throw new Error('Este banco contém contas de demonstração. Use --demo ou selecione outro arquivo com BANCO.');
  }
  if (carregarDadosIniciais(db, { demo })) console.log('Banco criado e dados iniciais carregados.');
  const porta = Number(process.env.PORTA || 3000);
  createServer(criarApp(db)).listen(porta, host, () => {
    console.log(`Team Bots no ar: http://localhost:${porta}`);
    console.log(`API:            http://localhost:${porta}/api/saude`);
  });
}
