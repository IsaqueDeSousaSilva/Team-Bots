/* ============================================================================
   TEAM BOTS — ligação do site com o banco de dados (API /api/*)

   Como funciona
   1. Ao abrir a página, pergunta para o servidor se a API está no ar.
   2. Se estiver, troca o conteúdo fixo do HTML (cartões, fórum, FAQ) pelo que
      vem do banco, monta a seção de cursos e liga o cadastro/login.
   3. Se NÃO estiver (ex.: site aberto no GitHub Pages, sem servidor), não faz
      nada: a página continua igual, com o conteúdo fixo do index.html.

   Não altera o script.js. Todo texto vindo do banco entra com textContent,
   nunca com innerHTML, para não abrir brecha de script injetado.
   ============================================================================ */
(function () {
    "use strict";

    var CHAVE_TOKEN = "teambots_token";
    var usuario = null;
    var topicoAberto = null;

    // ---------- utilitários ----------
    function guardarToken(token) {
        try {
            if (token) localStorage.setItem(CHAVE_TOKEN, token);
            else localStorage.removeItem(CHAVE_TOKEN);
        } catch (e) { /* navegador sem armazenamento: a sessão dura só esta página */ }
        guardarToken.atual = token || null;
    }
    function lerToken() {
        if (guardarToken.atual !== undefined) return guardarToken.atual;
        try { return localStorage.getItem(CHAVE_TOKEN); } catch (e) { return null; }
    }

    function api(caminho, opcoes) {
        opcoes = opcoes || {};
        var cabecalhos = { "Accept": "application/json" };
        var token = lerToken();
        if (token) cabecalhos["Authorization"] = "Bearer " + token;
        if (opcoes.corpo) cabecalhos["Content-Type"] = "application/json";
        return fetch("/api" + caminho, {
            method: opcoes.corpo ? "POST" : (opcoes.metodo || "GET"),
            headers: cabecalhos,
            body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined
        }).then(function (resposta) {
            return resposta.json().then(function (dados) {
                if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir.");
                return dados;
            });
        });
    }

    // cria um elemento: el("div", "classe", "texto", [filhos])
    function el(tag, classe, texto, filhos) {
        var no = document.createElement(tag);
        if (classe) no.className = classe;
        if (texto != null) no.textContent = texto;
        (filhos || []).forEach(function (f) { if (f) no.appendChild(f); });
        return no;
    }

    function avisar(texto) {
        var toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = texto;
        toast.classList.add("show");
        clearTimeout(avisar.relogio);
        avisar.relogio = setTimeout(function () { toast.classList.remove("show"); }, 2800);
    }

    var MESES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
        "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    function dataPorExtenso(iso) {              // "2023-12-11" → "11 DE DEZEMBRO, 2023"
        var p = String(iso).slice(0, 10).split("-");
        return Number(p[2]) + " DE " + MESES[Number(p[1]) - 1] + ", " + p[0];
    }
    function iniciais(nome) {
        var partes = String(nome).trim().split(/\s+/);
        return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
    }
    function haQuantoTempo(iso) {
        var min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        if (min < 1) return "agora";
        if (min < 60) return min + " min atrás";
        if (min < 1440) return Math.round(min / 60) + " h atrás";
        return Math.round(min / 1440) + " d atrás";
    }

    // ---------- cartões "Conteúdos em destaque" ----------
    function montarConteudos(lista) {
        var grade = document.querySelector(".news-grid");
        if (!grade || !lista.length) return;
        grade.replaceChildren.apply(grade, lista.map(function (c) {
            var link = el("a", null, c.texto_link);
            link.href = c.url;
            return el("article", "news-card " + c.cor + "-card", null, [
                el("div", "card-image " + c.imagem + "-image"),
                el("div", "card-content", null, [
                    el("span", "date", dataPorExtenso(c.publicado_em)),
                    el("h3", null, c.titulo),
                    el("p", null, c.resumo),
                    link
                ])
            ]);
        }));
    }

    // ---------- FAQ ----------
    function montarFaq(lista) {
        var grade = document.querySelector(".faq-grid");
        if (!grade || !lista.length) return;
        var metade = Math.ceil(lista.length / 2);
        function coluna(itens) {
            return el("div", "faq-column", null, itens.map(function (f) {
                var botao = el("button", "faq-question", f.pergunta + " ", [el("span", null, "⌄")]);
                var item = el("div", "faq-item", null, [
                    botao,
                    el("div", "faq-answer", null, [el("p", null, f.resposta)])
                ]);
                botao.addEventListener("click", function () { item.classList.toggle("active"); });
                return item;
            }));
        }
        grade.replaceChildren(coluna(lista.slice(0, metade)), coluna(lista.slice(metade)));
    }

    // ---------- fórum ----------
    function montarForum(topicos) {
        var forum = document.querySelector(".forum");
        if (!forum || !topicos.length) return;
        var titulo = forum.querySelector(".forum-title");
        var caixa = el("div", "comments-box");
        var nos = topicos.map(function (t) {
            var no = el("div", "forum-topic tb-clicavel", null, [
                el("div", null, null, [
                    el("h4", null, t.titulo),
                    el("span", null, "◯ " + t.comentarios + (t.comentarios === 1 ? " comentário" : " comentários"))
                ]),
                el("div", "avatars", null, t.participantes.map(function (n) { return el("i", null, iniciais(n)); }))
            ]);
            no.addEventListener("click", function () { abrirTopico(t.id, caixa); });
            return no;
        });
        forum.replaceChildren.apply(forum, [titulo].concat(nos, [caixa]));
        abrirTopico(topicoAberto || topicos[0].id, caixa);
    }

    function abrirTopico(id, caixa) {
        topicoAberto = id;
        api("/forum/topicos/" + id + "/comentarios").then(function (comentarios) {
            var respondendo = null;
            var campo = el("textarea", "tb-campo");
            campo.rows = 2;
            campo.maxLength = 1000;
            campo.placeholder = usuario ? "Escreva um comentário…" : "Entre na comunidade para comentar";
            campo.disabled = !usuario;
            campo.setAttribute("aria-label", "Novo comentário");
            var enviar = el("button", "tb-botao", "Comentar");
            enviar.type = "button";
            enviar.disabled = !usuario;

            var nos = comentarios.map(function (c) {
                var responder = el("a", null, "Responder");
                responder.href = "#";
                responder.addEventListener("click", function (evento) {
                    evento.preventDefault();
                    if (!usuario) return abrirJanela();
                    respondendo = c.resposta_a || c.id;   // respostas ficam em um só nível
                    campo.placeholder = "Respondendo a " + c.autor + "…";
                    campo.focus();
                });
                return el("div", "comment" + (c.resposta_a ? " reply" : ""), null, [
                    el("div", "avatar", iniciais(c.autor)),
                    el("div", null, null, [
                        el("strong", null, c.autor), document.createTextNode(" "),
                        el("small", null, haQuantoTempo(c.criado_em)),
                        el("p", null, c.texto),
                        responder
                    ])
                ]);
            });
            if (!nos.length) nos = [el("p", "tb-vazio", "Ninguém comentou ainda. Seja a primeira pessoa.")];

            enviar.addEventListener("click", function () {
                var texto = campo.value.trim();
                if (!texto) return campo.focus();
                enviar.disabled = true;
                api("/forum/topicos/" + id + "/comentarios", { corpo: { texto: texto, resposta_a: respondendo } })
                    .then(function () { avisar("Comentário publicado."); return api("/forum/topicos"); })
                    .then(montarForum)
                    .catch(function (erro) { avisar(erro.message); enviar.disabled = false; });
            });
            caixa.replaceChildren.apply(caixa, nos.concat([el("div", "tb-novo-comentario", null, [campo, enviar])]));
        }).catch(function (erro) { avisar(erro.message); });
    }

    // ---------- cursos ----------
    function montarCursos(cursos) {
        var secao = document.getElementById("cursos-online");
        if (!secao || !cursos.length) return;
        var lista = el("div", "tb-cursos");
        cursos.forEach(function (c) {
            var detalhe = el("div", "tb-aulas");
            var botao = el("button", "tb-botao", "Ver aulas");
            botao.type = "button";
            botao.addEventListener("click", function () {
                if (detalhe.childNodes.length) { detalhe.replaceChildren(); botao.textContent = "Ver aulas"; return; }
                carregarAulas(c.slug, detalhe);
                botao.textContent = "Fechar";
            });
            lista.appendChild(el("article", "news-card blue-card tb-curso", null, [
                el("div", "card-content", null, [
                    el("span", "date", c.disciplina.toUpperCase() + " • " + c.aulas + " AULAS"),
                    el("h3", null, c.titulo),
                    el("p", null, c.descricao),
                    botao,
                    detalhe
                ])
            ]));
        });
        secao.replaceChildren(
            el("div", "section-heading", null, [el("div", null, null, [
                el("span", "small-title", "CURSOS"),
                el("h2", null, "Aprenda na prática")
            ])]),
            lista
        );
        secao.hidden = false;
        document.querySelectorAll("[data-cursos-link]").forEach(function (link) { link.hidden = false; });
        document.querySelector("[data-simulador-link]").hidden = true;
    }

    function recursoDaAula(aula) {
        if (!aula.recurso_url) return null;
        var url;
        try { url = new URL(aula.recurso_url, location.href); } catch (e) { return null; }
        if (url.username || url.password) return null;
        if (aula.tipo === "video" ? url.protocol !== "https:" :
            url.protocol !== "https:" && url.origin !== location.origin) return null;
        var link = el("a", "tb-recurso", aula.tipo === "video" ? "Assistir à videoaula" :
            aula.tipo === "simulador" ? "Abrir simulador" : "Abrir material");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        return link;
    }

    function carregarAulas(slug, destino) {
        api("/cursos/" + slug).then(function (curso) {
            var feitas = curso.aulas.filter(function (a) { return a.concluida; }).length;
            var resumo = el("p", "tb-progresso", usuario
                ? feitas + " de " + curso.aulas.length + " aulas concluídas"
                : "Entre na comunidade para registrar o seu progresso.");
            var itens = curso.aulas.map(function (a) {
                var marca = el("button", "tb-marca" + (a.concluida ? " feita" : ""), a.concluida ? "✓ Concluída" : "Marcar como concluída");
                marca.type = "button";
                marca.disabled = a.concluida;
                marca.addEventListener("click", function () {
                    if (!usuario) return abrirJanela();
                    api("/aulas/" + a.id + "/concluir", { corpo: {} }).then(function (p) {
                        avisar("Progresso salvo: " + p.aulas_concluidas + " de " + p.aulas_total + ".");
                        carregarAulas(slug, destino);
                    }).catch(function (erro) { avisar(erro.message); });
                });
                return el("li", null, null, [
                    el("div", null, null, [
                        el("strong", null, a.ordem + ". " + a.titulo),
                        el("small", null, " · " + a.tipo),
                        el("p", null, a.resumo),
                        recursoDaAula(a)
                    ]),
                    marca
                ]);
            });
            destino.replaceChildren(resumo, el("ol", null, null, itens));
        }).catch(function (erro) { avisar(erro.message); });
    }

    // ---------- cadastro e login ----------
    var janela = null;

    function campoForm(rotulo, nome, tipo, dica) {
        var entrada = el("input", "tb-campo");
        entrada.name = nome;
        entrada.type = tipo;
        if (dica) entrada.placeholder = dica;
        if (tipo === "password") entrada.autocomplete = nome === "senha_nova" ? "new-password" : "current-password";
        var caixa = el("label", "tb-rotulo", rotulo, [entrada]);
        caixa.entrada = entrada;
        return caixa;
    }

    function criarJanela() {
        var modo = "entrar";
        var titulo = el("h3", null, "");
        var nome = campoForm("Como quer ser chamado(a)", "nome", "text", "Seu nome ou apelido");
        var login = campoForm("Login", "login", "text", "apelido ou e-mail");
        var senha = campoForm("Senha (mínimo 8 caracteres)", "senha", "password");
        var turma = campoForm("Código da turma (opcional)", "codigo_turma", "text", "ex.: DEMO-9A");
        var erro = el("p", "tb-erro");
        erro.setAttribute("role", "alert");
        var confirmar = el("button", "primary-btn tb-confirmar", "");
        confirmar.type = "submit";
        var trocar = el("button", "tb-link", "");
        trocar.type = "button";
        var fechar = el("button", "tb-fechar", "×");
        fechar.type = "button";
        fechar.setAttribute("aria-label", "Fechar");

        var form = el("form", "tb-janela", null, [fechar, titulo, nome, login, senha, turma, erro, confirmar, trocar]);
        form.setAttribute("role", "dialog");
        form.setAttribute("aria-modal", "true");
        var fundo = el("div", "tb-fundo", null, [form]);
        fundo.hidden = true;

        function aplicarModo() {
            var cadastro = modo === "cadastrar";
            titulo.textContent = cadastro ? "Criar conta" : "Entrar na comunidade";
            nome.hidden = turma.hidden = !cadastro;
            senha.entrada.autocomplete = cadastro ? "new-password" : "current-password";
            senha.firstChild.textContent = cadastro ? "Senha (mínimo 8 caracteres)" : "Senha";
            confirmar.textContent = cadastro ? "Criar conta" : "Entrar";
            trocar.textContent = cadastro ? "Já tenho conta" : "Ainda não tenho conta";
            erro.textContent = "";
        }
        trocar.addEventListener("click", function () { modo = modo === "entrar" ? "cadastrar" : "entrar"; aplicarModo(); });
        fechar.addEventListener("click", function () { fundo.hidden = true; });
        fundo.addEventListener("click", function (e) { if (e.target === fundo) fundo.hidden = true; });
        document.addEventListener("keydown", function (e) { if (e.key === "Escape") fundo.hidden = true; });

        form.addEventListener("submit", function (evento) {
            evento.preventDefault();
            confirmar.disabled = true;
            var corpo = { login: login.entrada.value, senha: senha.entrada.value };
            if (modo === "cadastrar") {
                corpo.nome = nome.entrada.value;
                corpo.codigo_turma = turma.entrada.value;
            }
            api(modo === "cadastrar" ? "/cadastro" : "/login", { corpo: corpo }).then(function (dados) {
                guardarToken(dados.token);
                usuario = dados.usuario;
                fundo.hidden = true;
                senha.entrada.value = "";
                avisar("Bem-vindo(a), " + usuario.nome_exibicao + "!");
                atualizarTela();
            }).catch(function (e) { erro.textContent = e.message; })
                .then(function () { confirmar.disabled = false; });
        });

        aplicarModo();
        document.body.appendChild(fundo);
        return { abrir: function () { fundo.hidden = false; login.entrada.focus(); } };
    }

    function abrirJanela() {
        if (!janela) janela = criarJanela();
        janela.abrir();
    }

    function ligarBotaoComunidade() {
        var botao = document.getElementById("communityBtn");
        var sair = document.getElementById("communityLogout");
        if (!botao) return;
        // roda antes do clique do script.js (que só mostrava o aviso de boas-vindas)
        botao.addEventListener("click", function (evento) {
            evento.stopImmediatePropagation();
            abrirJanela();
        }, true);
        sair.addEventListener("click", function () {
            sair.disabled = true;
            api("/logout", { corpo: {} }).then(function () {
                guardarToken(null);
                usuario = null;
                avisar("Você saiu da conta.");
                atualizarTela();
                botao.focus();
            }).catch(function (erro) { avisar(erro.message); })
              .finally(function () { sair.disabled = false; });
        });
    }

    function atualizarTela() {
        var botao = document.getElementById("communityBtn");
        var nome = document.getElementById("communityUser");
        var sair = document.getElementById("communityLogout");
        botao.hidden = Boolean(usuario);
        nome.hidden = sair.hidden = !usuario;
        nome.textContent = usuario ? "Olá, " + usuario.nome_exibicao : "";
        api("/forum/topicos").then(montarForum).catch(function () { });
        api("/cursos").then(montarCursos).catch(function () { });
    }

    // ---------- início ----------
    api("/saude").then(function () {
        ligarBotaoComunidade();
        api("/conteudos").then(montarConteudos).catch(function () { });
        api("/faq").then(montarFaq).catch(function () { });
        var pronto = lerToken()
            ? api("/eu").then(function (u) { usuario = u; }).catch(function () { guardarToken(null); })
            : Promise.resolve();
        pronto.then(atualizarTela);
    }).catch(function () {
        // Sem servidor: mantém o conteúdo fixo do index.html.
    });
})();
