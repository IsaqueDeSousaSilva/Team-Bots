// Componente React do Simulador de Eletrônica 2D (React 18+, funciona em Vite, Create React App e Next.js).
//
// 1. Copie a pasta Build da build para  public/simulador/Build/  do projeto React.
//    (tudo que está em public/ é servido como arquivo estático, sem passar pelo bundler)
// 2. Use o componente:   <Simulador />
//    Em Next.js (App Router), coloque "use client" no topo deste arquivo.
//
// Cuidados que este componente já resolve:
// - o WebGL.loader.js é carregado uma única vez, mesmo que o componente apareça várias vezes;
// - no modo de desenvolvimento (StrictMode), o React monta o componente duas vezes: só uma instância é criada;
// - ao sair da página (desmontar), o simulador é encerrado com Quit(), liberando memória.

import { useEffect, useRef, useState } from "react";

const PASTA_BUILD = "/simulador/Build";

// A Unity escuta o teclado da página inteira e bloqueia teclas como Backspace, Tab e setas.
// Isto devolve essas teclas aos campos de texto do site. Precisa rodar ANTES do WebGL.loader.js.
function protegerCamposDeTexto() {
  ["keydown", "keyup", "keypress"].forEach((tipo) => {
    window.addEventListener(tipo, (e) => {
      const alvo = e.target;
      const campoDeTexto = alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" ||
                           alvo.tagName === "SELECT" || alvo.isContentEditable;
      if (campoDeTexto) e.stopImmediatePropagation();
    }, true);
  });
}

let carregador = null;
function carregarLoader() {
  if (!carregador) {
    protegerCamposDeTexto();
    carregador = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PASTA_BUILD + "/WebGL.loader.js";
      script.onload = resolve;
      script.onerror = () => {
        carregador = null;
        reject(new Error("Arquivo não encontrado: " + script.src));
      };
      document.body.appendChild(script);
    });
  }
  return carregador;
}

export default function Simulador() {
  const canvasRef = useRef(null);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState(null);
  const [pronto, setPronto] = useState(false);
  const instanciaRef = useRef(null);

  useEffect(() => {
    let cancelado = false;

    carregarLoader()
      .then(() => {
        if (cancelado) return null;
        return window.createUnityInstance(
          canvasRef.current,
          {
            dataUrl: PASTA_BUILD + "/WebGL.data.unityweb",
            frameworkUrl: PASTA_BUILD + "/WebGL.framework.js.unityweb",
            codeUrl: PASTA_BUILD + "/WebGL.wasm.unityweb",
            companyName: "DefaultCompany",
            productName: "Simulador de Eletrônica 2D",
            productVersion: "1.0",
            showBanner: (mensagem, tipo) => {
              if (tipo === "error") setErro(mensagem);
              else console.warn("[simulador]", mensagem);
            },
          },
          (p) => !cancelado && setProgresso(p)
        );
      })
      .then((instancia) => {
        if (!instancia) return;
        if (cancelado) { instancia.Quit(); return; }
        instanciaRef.current = instancia;
        setPronto(true);
        canvasRef.current.focus();
      })
      .catch((e) => !cancelado && setErro(String(e)));

    return () => {
      cancelado = true;
      if (instanciaRef.current) {
        instanciaRef.current.Quit();
        instanciaRef.current = null;
      }
    };
  }, []);

  return (
    <div>
      <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", minHeight: 360,
                    background: "#0F1218", borderRadius: 10, overflow: "hidden" }}>
        <canvas
          id="unity-canvas"
          ref={canvasRef}
          tabIndex={-1}
          onPointerDown={() => canvasRef.current.focus()}
          style={{ display: "block", width: "100%", height: "100%", outline: "none" }}
        />
        {!pronto && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 12, color: "#E8ECF4" }}>
            {erro ? (
              <>
                <strong>Não foi possível abrir o simulador</strong>
                <span style={{ color: "#FFB4B4", maxWidth: 560, textAlign: "center" }}>{erro}</span>
              </>
            ) : (
              <>
                <strong>Simulador de Eletrônica 2D</strong>
                <div style={{ width: 320, height: 10, borderRadius: 5, background: "#222A37", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(progresso * 100)}%`, height: "100%", background: "#33A06B" }} />
                </div>
                <small>Carregando… {Math.round(progresso * 100)}%</small>
              </>
            )}
          </div>
        )}
      </div>
      <button disabled={!pronto} onClick={() => instanciaRef.current?.SetFullscreen(1)} style={{ marginTop: 10 }}>
        Tela cheia
      </button>
    </div>
  );
}
