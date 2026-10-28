# Pokémon 5e Companion — Owlbear Rodeo v0.1.3

## Deploy na Vercel
Projeto estático, sem backend e sem comando de build.

1. Extraia o ZIP.
2. Importe os arquivos em um projeto Vercel (a raiz deve conter `manifest.json`, `index.html`, `app.js` e `vercel.json`).
3. Faça o deploy.
4. Abra `https://SEU-PROJETO.vercel.app/manifest.json` para conferir o manifesto público.
5. No Owlbear Rodeo, abra Extensions → Add Extension e cole essa URL.
6. Ao atualizar o projeto na Vercel, mantenha o mesmo nome/domínio e URL do manifesto; o Owlbear continuará apontando para o mesmo manifesto.

## Pokédex
A lista nacional é carregada do endpoint `https://pokeapi.co/api/v2/pokemon-species?limit=2000&offset=0`. Ao selecionar um Pokémon, a extensão busca detalhes em `/pokemon/{id}` e `/pokemon-species/{id}`: imagem oficial, tipos, altura, peso, habilidades, atributos-base e alguns dados de espécie. Os detalhes são buscados sob demanda para não fazer mais de mil requisições simultâneas. A lista nacional é atualizada automaticamente conforme a PokéAPI atualiza o endpoint.

## Fichas Pokémon 5e
Cada entrada possui `id` (número nacional estável) e `sheet5e: null`. No futuro, um arquivo de fichas pode mapear `nationalDex`/`id` para a ficha de jogo, sem cadastrar os Pokémon de novo. Os atributos-base mostrados agora são os dos jogos oficiais e não são tratados como estatísticas de Pokémon 5e.

## Abas
Pokédex, golpes, itens e habilidades usam a PokéAPI. As abas de treinadores e regras estão preparadas como áreas da interface, mas ainda precisam receber conteúdo específico do sistema.

## Créditos
Dados e imagens consultados da PokéAPI e do repositório PokeAPI Sprites. Pokémon e nomes relacionados são marcas de seus respectivos titulares. Esta extensão é comunitária, não oficial e não afiliada à Nintendo, The Pokémon Company, PokéAPI ou Owlbear Rodeo.
