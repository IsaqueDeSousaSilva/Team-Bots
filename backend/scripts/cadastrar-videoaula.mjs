import { pathToFileURL } from 'node:url';
import { bancoDemo, conectar, carregarDadosIniciais, executar, transacao, um } from '../db.mjs';

export function cadastrarVideoaula(db, [slug, ordemTexto, titulo, endereco, resumo = '']) {
  const ordem = Number(ordemTexto);
  if (!slug || !/^[a-z0-9-]+$/.test(slug) || !/^[1-9]\d*$/.test(ordemTexto ?? '')
      || !Number.isSafeInteger(ordem) || !titulo?.trim()) {
    throw new Error('Informe o curso, a ordem (inteiro positivo) e o título.');
  }
  let url;
  try { url = new URL(endereco); } catch { throw new Error('Informe uma URL HTTPS válida.'); }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Informe uma URL HTTPS sem credenciais no endereço.');
  }
  return transacao(db, () => {
    const curso = um(db, 'SELECT id FROM cursos WHERE slug = ?', slug);
    if (!curso) throw new Error('Curso não encontrado.');
    const atual = um(db, 'SELECT id, tipo FROM aulas WHERE curso_id = ? AND ordem = ?', curso.id, ordem);
    if (atual && atual.tipo !== 'video') throw new Error('A posição pertence a uma aula de outro tipo.');
    if (atual) {
      executar(db, 'UPDATE aulas SET titulo = ?, resumo = ?, recurso_url = ? WHERE id = ?',
        titulo.trim(), resumo.trim(), url.href, atual.id);
      return atual.id;
    }
    const registro = executar(db, "INSERT INTO aulas (curso_id, ordem, titulo, tipo, resumo, recurso_url) VALUES (?, ?, ?, 'video', ?, ?)",
      curso.id, ordem, titulo.trim(), resumo.trim(), url.href);
    return Number(registro.lastInsertRowid);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const demo = args[0] === '--demo';
  if (demo) args.shift();
  if (args.length < 4 || args.length > 5) {
    console.error('Uso: node backend/scripts/cadastrar-videoaula.mjs [--demo] CURSO ORDEM TÍTULO URL_HTTPS [RESUMO]');
    process.exitCode = 1;
  } else {
    const db = conectar(process.env.BANCO || (demo ? bancoDemo : undefined));
    try {
      carregarDadosIniciais(db, { demo });
      console.log('Videoaula registrada. ID:', cadastrarVideoaula(db, args));
    } catch (erro) {
      console.error(erro.message);
      process.exitCode = 1;
    } finally {
      db.close();
    }
  }
}
