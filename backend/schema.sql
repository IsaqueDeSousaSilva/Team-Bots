-- =====================================================================
-- TEAM BOTS — Plataforma de apoio ao ensino de exatas (extensão UNIUBE)
-- Modelo de dados v1 · SQLite (node:sqlite)
--
-- Convenções
--   * nomes em português, snake_case, tabelas no plural
--   * datas em texto ISO-8601 UTC (ex.: 2026-11-10T12:00:00.000Z)
--   * booleanos como INTEGER 0/1 com CHECK
--   * o script é idempotente: pode rodar a cada subida do servidor
--
-- Privacidade (o público inclui menores de idade)
--   * não guardamos CPF, endereço, telefone nem data de nascimento
--   * e-mail é opcional; o aluno pode entrar só com apelido + senha
--   * senha nunca é gravada: apenas o hash (scrypt)
-- =====================================================================
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  versao      INTEGER PRIMARY KEY,
  descricao   TEXT NOT NULL,
  aplicado_em TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_version
VALUES (1, 'Modelo inicial: pessoas, cursos, conteudo, forum, simulador, IA', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- ---------------------------------------------------------------------
-- 1. EXTENSÃO: escolas parceiras e turmas atendidas (frente de prospecção)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS escolas (
  id              INTEGER PRIMARY KEY,
  nome            TEXT NOT NULL UNIQUE,
  cidade          TEXT NOT NULL,
  uf              TEXT NOT NULL CHECK (length(uf) = 2),
  rede            TEXT NOT NULL CHECK (rede IN ('municipal', 'estadual', 'federal', 'privada')),
  status_parceria TEXT NOT NULL DEFAULT 'prospeccao'
                  CHECK (status_parceria IN ('prospeccao', 'em_conversa', 'aceita', 'recusada')),
  contato_nome    TEXT,            -- pessoa da escola (direção/coordenação)
  observacoes     TEXT,
  criado_em       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turmas (
  id            INTEGER PRIMARY KEY,
  escola_id     INTEGER NOT NULL REFERENCES escolas (id),
  nome          TEXT NOT NULL,                       -- ex.: "9º ano B"
  etapa         TEXT NOT NULL CHECK (etapa IN ('fundamental_2', 'medio')),
  ano_letivo    INTEGER NOT NULL,
  codigo_convite TEXT NOT NULL UNIQUE,               -- o aluno digita no cadastro
  criado_em     TEXT NOT NULL,
  UNIQUE (escola_id, nome, ano_letivo)
);

-- ---------------------------------------------------------------------
-- 2. PESSOAS E ACESSO
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY,
  nome_exibicao TEXT NOT NULL,
  login         TEXT NOT NULL UNIQUE COLLATE NOCASE, -- apelido ou e-mail
  email         TEXT UNIQUE COLLATE NOCASE,          -- opcional
  senha_hash    TEXT NOT NULL,                       -- "sal:hash" (scrypt)
  papel         TEXT NOT NULL DEFAULT 'aluno'
                CHECK (papel IN ('aluno', 'professor', 'equipe', 'admin')),
  turma_id      INTEGER REFERENCES turmas (id),
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,                       -- sha256 do token; o token puro só existe no navegador
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  criado_em  TEXT NOT NULL,
  expira_em  TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- 3. CURSOS (menu "Cursos" do site)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disciplinas (
  id   INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cursos (
  id            INTEGER PRIMARY KEY,
  disciplina_id INTEGER NOT NULL REFERENCES disciplinas (id),
  slug          TEXT NOT NULL UNIQUE,
  titulo        TEXT NOT NULL,
  descricao     TEXT NOT NULL,
  etapa         TEXT NOT NULL CHECK (etapa IN ('fundamental_2', 'medio', 'ambos')),
  publicado     INTEGER NOT NULL DEFAULT 0 CHECK (publicado IN (0, 1)),
  criado_em     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS aulas (
  id        INTEGER PRIMARY KEY,
  curso_id  INTEGER NOT NULL REFERENCES cursos (id) ON DELETE CASCADE,
  ordem     INTEGER NOT NULL CHECK (ordem > 0),
  titulo    TEXT NOT NULL,
  tipo      TEXT NOT NULL CHECK (tipo IN ('texto', 'video', 'exercicio', 'simulador')),
  resumo    TEXT NOT NULL,
  recurso_url TEXT,                                  -- vídeo, PDF ou página do simulador
  UNIQUE (curso_id, ordem)
);

CREATE TABLE IF NOT EXISTS matriculas (
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  curso_id   INTEGER NOT NULL REFERENCES cursos (id) ON DELETE CASCADE,
  criado_em  TEXT NOT NULL,
  PRIMARY KEY (usuario_id, curso_id)
);

CREATE TABLE IF NOT EXISTS progresso_aulas (
  usuario_id   INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  aula_id      INTEGER NOT NULL REFERENCES aulas (id) ON DELETE CASCADE,
  concluido_em TEXT NOT NULL,
  PRIMARY KEY (usuario_id, aula_id)
);

-- ---------------------------------------------------------------------
-- 4. CONTEÚDO DA PÁGINA INICIAL (cartões "Conteúdos em destaque" e FAQ)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conteudos (
  id           INTEGER PRIMARY KEY,
  titulo       TEXT NOT NULL,
  resumo       TEXT NOT NULL,
  cor          TEXT NOT NULL CHECK (cor IN ('blue', 'red')),            -- classe blue-card / red-card
  imagem       TEXT NOT NULL CHECK (imagem IN ('tech', 'code', 'robot', 'team')), -- classe *-image
  texto_link   TEXT NOT NULL DEFAULT 'Ler artigo →',
  url          TEXT NOT NULL DEFAULT '#',
  publicado_em TEXT NOT NULL,                        -- data mostrada no cartão
  visivel      INTEGER NOT NULL DEFAULT 1 CHECK (visivel IN (0, 1))
);

CREATE TABLE IF NOT EXISTS faq (
  id       INTEGER PRIMARY KEY,
  pergunta TEXT NOT NULL UNIQUE,
  resposta TEXT NOT NULL,
  ordem    INTEGER NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------
-- 5. FÓRUM DE DISCUSSÕES
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forum_topicos (
  id        INTEGER PRIMARY KEY,
  titulo    TEXT NOT NULL,
  autor_id  INTEGER NOT NULL REFERENCES usuarios (id),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forum_comentarios (
  id          INTEGER PRIMARY KEY,
  topico_id   INTEGER NOT NULL REFERENCES forum_topicos (id) ON DELETE CASCADE,
  autor_id    INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  resposta_a  INTEGER REFERENCES forum_comentarios (id) ON DELETE CASCADE, -- NULL = comentário raiz
  texto       TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 1000),
  oculto      INTEGER NOT NULL DEFAULT 0 CHECK (oculto IN (0, 1)),         -- moderação
  criado_em   TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- 6. SIMULADOR DE ELETRÔNICA 2D (build Unity WebGL do G3)
--    Hoje o simulador salva/abre um arquivo .simu pelo navegador.
--    Esta tabela guarda esses arquivos na conta do aluno.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS simulador_projetos (
  id               INTEGER PRIMARY KEY,
  usuario_id       INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  titulo           TEXT NOT NULL,
  versao_simulador TEXT NOT NULL,                    -- ex.: "0.5"
  arquivo_simu     TEXT NOT NULL CHECK (length(arquivo_simu) <= 1048576), -- conteúdo do .simu (até 1 MB)
  criado_em        TEXT NOT NULL,
  atualizado_em    TEXT NOT NULL,
  UNIQUE (usuario_id, titulo)
);

-- ---------------------------------------------------------------------
-- 7. TUTOR COM IA (estrutura pronta; a interface com a IA ainda não foi definida)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ia_documentos (             -- base de conhecimento que alimenta a IA
  id            INTEGER PRIMARY KEY,
  disciplina_id INTEGER REFERENCES disciplinas (id),
  titulo        TEXT NOT NULL,
  fonte         TEXT NOT NULL,                       -- de onde veio (apostila, aula, link)
  texto         TEXT NOT NULL,
  aprovado_por  INTEGER REFERENCES usuarios (id) ON DELETE SET NULL, -- só entra na IA depois de revisado
  criado_em     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ia_conversas (
  id         INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
  aula_id    INTEGER REFERENCES aulas (id) ON DELETE SET NULL, -- contexto da dúvida, se houver
  criado_em  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ia_mensagens (
  id          INTEGER PRIMARY KEY,
  conversa_id INTEGER NOT NULL REFERENCES ia_conversas (id) ON DELETE CASCADE,
  autor       TEXT NOT NULL CHECK (autor IN ('aluno', 'tutor')),
  texto       TEXT NOT NULL,
  criado_em   TEXT NOT NULL
);

-- ---------------------------------------------------------------------
-- ÍNDICES (colunas de junção e de ordenação mais usadas)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_turmas_escola        ON turmas (escola_id);
CREATE INDEX IF NOT EXISTS ix_usuarios_turma       ON usuarios (turma_id);
CREATE INDEX IF NOT EXISTS ix_sessoes_usuario      ON sessoes (usuario_id);
CREATE INDEX IF NOT EXISTS ix_cursos_disciplina    ON cursos (disciplina_id);
CREATE INDEX IF NOT EXISTS ix_progresso_aula       ON progresso_aulas (aula_id);
CREATE INDEX IF NOT EXISTS ix_conteudos_publicacao ON conteudos (visivel, publicado_em);
CREATE INDEX IF NOT EXISTS ix_comentarios_topico   ON forum_comentarios (topico_id, criado_em);
CREATE INDEX IF NOT EXISTS ix_ia_mensagens_conversa ON ia_mensagens (conversa_id, criado_em);

-- ---------------------------------------------------------------------
-- VISÕES (consultas prontas para o site e para o relatório da extensão)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS vw_forum_topicos;
CREATE VIEW vw_forum_topicos AS
SELECT t.id,
       t.titulo,
       t.criado_em,
       u.nome_exibicao AS autor,
       (SELECT count(*) FROM forum_comentarios c
         WHERE c.topico_id = t.id AND c.oculto = 0) AS comentarios
  FROM forum_topicos t
  JOIN usuarios u ON u.id = t.autor_id;

DROP VIEW IF EXISTS vw_progresso_curso;
CREATE VIEW vw_progresso_curso AS
SELECT m.usuario_id,
       c.id     AS curso_id,
       c.slug,
       c.titulo,
       (SELECT count(*) FROM aulas a WHERE a.curso_id = c.id) AS aulas_total,
       (SELECT count(*) FROM progresso_aulas p
          JOIN aulas a ON a.id = p.aula_id
         WHERE a.curso_id = c.id AND p.usuario_id = m.usuario_id) AS aulas_concluidas
  FROM matriculas m
  JOIN cursos c ON c.id = m.curso_id;

-- Evidência para a DreamShaper: alcance por escola parceira.
DROP VIEW IF EXISTS vw_indicadores_escola;
CREATE VIEW vw_indicadores_escola AS
SELECT e.id   AS escola_id,
       e.nome AS escola,
       e.status_parceria,
       (SELECT count(*) FROM turmas t WHERE t.escola_id = e.id) AS turmas,
       (SELECT count(*) FROM usuarios u JOIN turmas t ON t.id = u.turma_id
         WHERE t.escola_id = e.id AND u.papel = 'aluno') AS alunos_cadastrados,
       (SELECT count(*) FROM progresso_aulas p
          JOIN usuarios u ON u.id = p.usuario_id
          JOIN turmas t ON t.id = u.turma_id
         WHERE t.escola_id = e.id) AS aulas_concluidas,
       (SELECT count(*) FROM simulador_projetos s
          JOIN usuarios u ON u.id = s.usuario_id
          JOIN turmas t ON t.id = u.turma_id
         WHERE t.escola_id = e.id) AS circuitos_salvos
  FROM escolas e;
