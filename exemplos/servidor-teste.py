"""Servidor local para testar a build do simulador no próprio computador.

Faz o mesmo que "python -m http.server", mas envia os cabeçalhos corretos para os
arquivos .unityweb (Content-Encoding: gzip e o tipo de cada um), como um servidor
de produção bem configurado.

Uso (no terminal, dentro da pasta do site):
    python servidor-teste.py            -> serve a pasta atual em http://localhost:8000/
    python servidor-teste.py 8080       -> outra porta
    python servidor-teste.py 8000 C:/meu-site   -> outra pasta

Para parar: Ctrl+C no terminal.
"""
import http.server
import os
import sys

TIPOS = {
    ".wasm.unityweb": "application/wasm",
    ".js.unityweb": "application/javascript",
    ".data.unityweb": "application/octet-stream",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.split("?", 1)[0].endswith(".unityweb"):
            self.send_header("Content-Encoding", "gzip")
        super().end_headers()

    def guess_type(self, path):
        for final, tipo in TIPOS.items():
            if path.endswith(final):
                return tipo
        return super().guess_type(path)


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    if len(sys.argv) > 2:
        os.chdir(sys.argv[2])
    with http.server.ThreadingHTTPServer(("127.0.0.1", porta), Handler) as servidor:
        print(f"Servindo {os.getcwd()}")
        print(f"Abra no navegador: http://localhost:{porta}/")
        servidor.serve_forever()
