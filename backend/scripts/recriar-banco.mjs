// Apaga o banco local e cria de novo com os dados iniciais.
//   node backend/scripts/recriar-banco.mjs
import { rmSync } from 'node:fs';
import { bancoDemo, conectar, carregarDadosIniciais, um } from '../db.mjs';

const caminho = bancoDemo;
for (const sufixo of ['', '-wal', '-shm']) rmSync(caminho + sufixo, { force: true });
const db = conectar(caminho);
carregarDadosIniciais(db);
const tabelas = um(db, "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").n;
console.log(`Banco recriado em ${caminho} (${tabelas} tabelas).`);
