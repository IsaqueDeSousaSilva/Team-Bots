"""Servidor local para testar a build do simulador no próprio computador.

Faz o mesmo que "python -m http.server", mas envia os cabeçalhos corretos para os
arquivos .unityweb (Content-Encoding: gzip e o tipo de cada um), como um servidor
de produção bem configurado.

Escuta em 127.0.0.1 (IPv4) e ::1 (IPv6) — apenas loopback, nunca exposto na rede.

Uso (no terminal, dentro da pasta do site):
    python servidor-teste.py            -> serve a pasta atual em http://localhost:8000/
    python servidor-teste.py 8080       -> outra porta
    python servidor-teste.py 8000 C:/meu-site   -> outra pasta

Para parar: Ctrl+C no terminal.
"""
import http.server
import os
import socket
import sys
import threading

TIPOS = {
    ".wasm.unityweb": "application/wasm",
    ".js.unityweb":   "application/javascript",
    ".data.unityweb": "application/octet-stream",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Necessário para SharedArrayBuffer (Unity 6 WebGL multi-thread)
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        if self.path.split("?", 1)[0].endswith(".unityweb"):
            self.send_header("Content-Encoding", "gzip")
        super().end_headers()

    def guess_type(self, path):
        for sufixo, tipo in TIPOS.items():
            if path.endswith(sufixo):
                return tipo
        return super().guess_type(path)

    def log_message(self, fmt, *args):
        # Suprime logs de assets grandes para não poluir o terminal
        if args and str(args[1]) == "200" and any(
            str(args[0]).endswith(e) for e in (".unityweb", ".js", ".css")
        ):
            return
        super().log_message(fmt, *args)


def iniciar_servidor(host, porta, familia):
    class Servidor(http.server.ThreadingHTTPServer):
        address_family = familia

    srv = Servidor((host, porta), Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


if __name__ == "__main__":
    porta = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    if len(sys.argv) > 2:
        os.chdir(sys.argv[2])

    servidores = []

    # IPv4 loopback
    try:
        servidores.append(iniciar_servidor("127.0.0.1", porta, socket.AF_INET))
    except OSError:
        pass

    # IPv6 loopback
    if socket.has_ipv6:
        try:
            servidores.append(iniciar_servidor("::1", porta, socket.AF_INET6))
        except OSError:
            pass

    if not servidores:
        print(f"Erro: não foi possível abrir a porta {porta}.")
        sys.exit(1)

    print(f"Servindo {os.getcwd()}")
    print(f"Abra no navegador: http://localhost:{porta}/")
    print("Para parar: Ctrl+C")

    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
        for s in servidores:
            s.shutdown()
