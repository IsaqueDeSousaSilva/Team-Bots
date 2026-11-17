@echo off
rem Sobe o site + API + banco e abre o navegador. Precisa do Node.js 22.13 ou mais novo.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)
echo Abra http://127.0.0.1:3000 no navegador.
node backend\server.mjs --demo
pause
