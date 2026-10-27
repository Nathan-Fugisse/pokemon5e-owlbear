# Pokémon 5e Companion — Owlbear Rodeo (protótipo 0.1.1)

## Deploy na Vercel

Este projeto é estático e não precisa de build nem de backend.

1. Extraia este ZIP ou envie-o pelo Vercel Drop.
2. Se a Vercel pedir configurações, use a raiz do projeto como diretório e deixe o build command vazio.
3. Depois do deploy, abra `https://SEU-PROJETO.vercel.app/manifest.json` no navegador.
4. Copie essa URL completa.
5. No Owlbear Rodeo, vá ao perfil → Extensions → Add Extension e cole a URL do manifesto.
6. Entre numa sala e habilite a extensão.

## Arquivos importantes
- `manifest.json`: manifesto de extensão Owlbear, versão 1.
- `index.html`, `style.css`, `app.js`: interface e integração inicial com o SDK.
- `data/catalog.json`: catálogo recuperado do repositório.
- `assets/icon.svg`: ícone.
- `vercel.json`: cabeçalhos para manifesto e catálogo JSON.

## Limitações
Este é um protótipo, não uma conversão completa do módulo Foundry. O catálogo contém registros completos e índices parciais; entradas parciais não possuem todas as estatísticas. A integração com tokens deve ser validada numa sala Owlbear real. Não é oficial nem afiliado ao Owlbear Rodeo ou aos autores do módulo original.

## Créditos
Consulte `LICENSE` e `UPSTREAM-README.html`. O módulo original Pokémon 5e para Foundry VTT é de Moge e Missing Glitch.
