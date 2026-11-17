// Acesso ao banco: conexão, utilitários, senha e carga inicial.
// Usa o SQLite embutido no Node (node:sqlite) — não precisa instalar nada.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const pastaBackend = dirname(fileURLToPath(import.meta.url));
export const bancoDemo = join(pastaBackend, 'data', 'teambots-demo.sqlite');
export const agora = () => new Date().toISOString();

// ---------- senha e token ----------
export function gerarHashSenha(senha, sal = randomBytes(16).toString('hex')) {
  return sal + ':' + scryptSync(senha, sal, 64).toString('hex');
}
export function conferirSenha(senha, hashGravado) {
  const [sal, chave] = hashGravado.split(':');
  if (!sal || !chave) return false;
  const esperado = Buffer.from(chave, 'hex');
  const informado = scryptSync(senha, sal, 64);
  return esperado.length === informado.length && timingSafeEqual(esperado, informado);
}
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// ---------- conexão ----------
export function conectar(caminho = join(pastaBackend, 'data', 'teambots.sqlite')) {
  if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  db.exec(readFileSync(join(pastaBackend, 'schema.sql'), 'utf8'));
  return db;
}

export const todos = (db, sql, ...args) => db.prepare(sql).all(...args);
export const um = (db, sql, ...args) => db.prepare(sql).get(...args);
export const executar = (db, sql, ...args) => db.prepare(sql).run(...args);

export function transacao(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const saida = fn();
    db.exec('COMMIT');
    return saida;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

// ---------- carga inicial ----------
// Os cartões, tópicos e perguntas abaixo são exatamente os que já estavam
// escritos à mão no index.html. Agora passam a vir do banco.
// Pessoas, escola e turma são FICTÍCIAS, só para demonstração.
export const SENHA_DEMO = 'TeamBots!2026';

export function carregarDadosIniciais(db, { demo = true } = {}) {
  const t = agora();

  return transacao(db, () => {
    if (um(db, "SELECT 1 FROM cursos WHERE slug = 'primeiros-circuitos'")) return false;
    if (demo) carregarDemonstracao(db, t);
    carregarCatalogo(db, t);
    return true;
  });
}

function carregarDemonstracao(db, t) {
    // Escola e turma de demonstração
    executar(db, `INSERT INTO escolas (id, nome, cidade, uf, rede, status_parceria, observacoes, criado_em)
                  VALUES (1, 'Escola Exemplo (fictícia)', 'Uberaba', 'MG', 'municipal', 'prospeccao',
                          'Registro de demonstração. Substituir pelas escolas reais da prospecção.', ?)`, t);
    executar(db, `INSERT INTO turmas (id, escola_id, nome, etapa, ano_letivo, codigo_convite, criado_em)
                  VALUES (1, 1, '9º ano A', 'fundamental_2', 2026, 'DEMO-9A', ?)`, t);

    // Pessoas
    const pessoas = [
      [1, 'Equipe Team Bots', 'equipe.demo', 'equipe', null],
      [2, 'Joraph Robad', 'joraph.demo', 'aluno', 1],
      [3, 'Junen Shammie', 'junen.demo', 'aluno', 1],
      [4, 'Aluno Demonstração', 'aluno.demo', 'aluno', 1],
    ];
    for (const [id, nome, login, papel, turma] of pessoas) {
      executar(db, `INSERT INTO usuarios (id, nome_exibicao, login, senha_hash, papel, turma_id, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`, id, nome, login, gerarHashSenha(SENHA_DEMO), papel, turma, t);
    }

    // Fórum (tópicos e os dois comentários que já apareciam na página)
    ['Desafios no desenvolvimento de bots', 'Novo desenvolvimento de bot', 'Equipe de IA'].forEach((titulo, i) =>
      executar(db, 'INSERT INTO forum_topicos (id, titulo, autor_id, criado_em) VALUES (?, ?, 1, ?)', i + 1, titulo, t));
    executar(db, `INSERT INTO forum_comentarios (id, topico_id, autor_id, resposta_a, texto, criado_em)
                  VALUES (1, 1, 2, NULL, 'Como a tecnologia pode ajudar no desenvolvimento de bots?', ?)`, t);
    executar(db, `INSERT INTO forum_comentarios (id, topico_id, autor_id, resposta_a, texto, criado_em)
                  VALUES (2, 1, 3, 1, 'Ótima pergunta! Vamos discutir.', ?)`, t);
}

function carregarCatalogo(db, t) {
    // Cartões "Conteúdos em destaque" (iguais aos do index.html)
    const cartoes = [
      ['Últimas notícias de tecnologia', 'Descubra as principais novidades de tecnologia, programação e desenvolvimento de bots.', 'blue', 'tech', 'Ler artigo →', '2023-12-11'],
      ['Atualizações da Empresa', 'Confira atualizações, projetos e novidades da nossa comunidade de desenvolvedores.', 'red', 'code', 'Ler artigo →', '2023-12-24'],
      ['Tendências de IA', 'Conheça tendências de inteligência artificial que estão transformando o mercado.', 'blue', 'robot', 'Ler artigo →', '2023-12-23'],
      ['Vitrine de Projetos', 'Veja projetos desenvolvidos pela comunidade e inspire-se para criar o seu.', 'red', 'team', 'Ver projeto →', '2023-12-11'],
    ];
    cartoes.forEach(([titulo, resumo, cor, imagem, link, data], i) =>
      executar(db, `INSERT INTO conteudos (id, titulo, resumo, cor, imagem, texto_link, publicado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`, i + 1, titulo, resumo, cor, imagem, link, data));

    // FAQ (igual ao index.html, mesma ordem de leitura)
    const perguntas = [
      ['O que é o Team Bots?', 'É uma comunidade dedicada a tecnologia, bots, programação e inteligência artificial.'],
      ['Como entrar na comunidade?', 'Clique no botão “Entrar na Comunidade” no topo da página.'],
      ['Como entrar em contato?', 'Use o link “Contato” no rodapé para iniciar uma conversa com a equipe.'],
      ['Como posso me inscrever?', 'O cadastro pode ser iniciado pelo botão de comunidade ou pela área de cursos.'],
      ['Como posso me informar sobre novidades?', 'Acompanhe os artigos e atualizações publicados na página inicial.'],
      ['Como posso me tornar um membro avançado?', 'Participe dos cursos, projetos e discussões da comunidade.'],
    ];
    perguntas.forEach(([p, r], i) =>
      executar(db, 'INSERT INTO faq (id, pergunta, resposta, ordem) VALUES (?, ?, ?, ?)', i + 1, p, r, i + 1));

    // Disciplinas citadas na proposta da extensão
    [['matematica', 'Matemática'], ['fisica', 'Física'], ['quimica', 'Química'], ['eletronica', 'Eletrônica']]
      .forEach(([slug, nome], i) => executar(db, 'INSERT INTO disciplinas VALUES (?, ?, ?)', i + 1, slug, nome));

    // Um curso de exemplo, montado a partir do escopo do simulador do G3
    // (circuito em série, polaridade, Lei de Ohm, circuito aberto/fechado).
    executar(db, `INSERT INTO cursos (id, disciplina_id, slug, titulo, descricao, etapa, publicado, criado_em)
                  VALUES (1, 4, 'primeiros-circuitos', 'Primeiros circuitos',
                          'Monte circuitos simples no simulador e descubra por que o LED acende (ou não).',
                          'ambos', 1, ?)`, t);
    const aulas = [
      ['Circuito aberto e fechado', 'texto', 'O que precisa acontecer para a corrente circular. O papel do botão.'],
      ['Pilhas em série', 'simulador', 'Uma pilha de 1,5 V não acende o LED. Ligue duas em série e observe.'],
      ['Polaridade do LED', 'simulador', 'O LED só conduz em um sentido. Inverta os terminais e compare.'],
      ['Resistor e Lei de Ohm', 'exercicio', 'Use o resistor para limitar a corrente e proteger o LED.'],
      ['Bateria de batata', 'simulador', 'Três batatas em série funcionam como bateria. Monte e teste.'],
    ];
    aulas.forEach(([titulo, tipo, resumo], i) =>
      executar(db, `INSERT INTO aulas (id, curso_id, ordem, titulo, tipo, resumo, recurso_url)
                    VALUES (?, 1, ?, ?, ?, ?, ?)`, i + 1, i + 1, titulo, tipo, resumo,
        tipo === 'simulador' ? 'simulador/index.html' : null));
}
