# Pokémon 5e Companion para Owlbear Rodeo — v0.4.0

Extensão estática para a Vercel, com interface em português e ficha editável de Pokémon 5e inspirada nas categorias e no fluxo público de gerenciamento do [Pokémon 5e Reference](https://poke5e.app/pt/). Não é afiliada ao site e não reproduz integralmente seu código nem seu banco de dados.

## Ficha Pokémon 5e
- Criação de ficha a partir de um Pokémon selecionado na Pokédex.
- Identidade: espécie, apelido, treinador, nível, experiência, edição 2018/2024, natureza, habilidade, item segurado e tipos.
- Combate: PV atuais/máximos/temporários, CA, deslocamento, iniciativa, proficiência, vínculo e condições.
- Seis atributos editáveis com cálculo automático dos modificadores.
- Quatro espaços de golpes com atributo de poder, tipo, tempo, alcance, dados de dano, PP atual/máximo, bônus MOVE e cálculo automático de ataque, CD e STAB.
- Rolagem de iniciativa, ataque d20, dano com dados e modificadores, consumo de PP, aplicação de dano/cura em PV e recuperação de PP em descanso longo.
- Salvamento automático local no navegador, backup JSON de exportação/importação e sincronização da ficha nos metadados dos tokens selecionados do Owlbear.
- Importação da ficha armazenada em metadados de token para outro navegador/cliente, quando o token e seus metadados forem acessíveis na sala.

## Dados e precisão
A PokéAPI fornece dados dos jogos oficiais (tipos, imagens, habilidades, etc.), não os valores de ficha de Pokémon 5e. Por isso, campos de regras como PV, CA, nível, atributos, golpes e vínculo são editáveis e não são inventados a partir dos atributos dos jogos. A extensão ainda não contém um compêndio local completo dos 830 golpes de Pokémon 5e: os dados do golpe (especialmente os dados de dano por nível e efeitos especiais) devem ser conferidos no catálogo oficial e preenchidos na ficha. A aba “Golpes (jogos)” é explicitamente separada e mostra dados de videogame da PokéAPI, não regras de RPG. A automação de condições, tipos, efeitos especiais, dano por resistência/vulnerabilidade, críticos, evolução e progressão ainda não é integral. Confirme cálculos e valores com a edição de regras usada pela sua mesa.

## Publicar
1. Extraia o ZIP e publique o conteúdo da pasta como projeto estático na Vercel.
2. Sem comando de build; diretório raiz deve conter `manifest.json`, `index.html`, `app.js`, `style.css` e `vercel.json`.
3. Verifique `https://SEU-PROJETO.vercel.app/manifest.json`.
4. Adicione/atualize a extensão no Owlbear Rodeo com essa URL. Use a mesma URL de manifesto em atualizações futuras.

## Sincronização
As fichas são salvas no armazenamento local deste navegador. Ao clicar em **Sincronizar com token**, a ficha é gravada em `metadata.com.pokemon5e.companion.sheet5e` nos tokens selecionados e vinculados. Para recuperar em outro cliente, selecione o token e use **Importar ficha do token**. O SDK do Owlbear e as permissões da sala precisam estar disponíveis; não existe servidor externo de conta/backup automático nesta versão.

## Fontes e atribuição
- Referência pública Pokémon 5e: https://poke5e.app/pt/
- Repositório da referência: https://github.com/Auroratide/poke5e
- PokéAPI: https://pokeapi.co/
- Owlbear Rodeo SDK: https://docs.owlbear.rodeo/

O site de referência descreve as edições 2018 e 2024; a edição 2024 é a atual segundo sua página de configurações. A ficha inclui o seletor de edição, mas não aplica automaticamente todas as diferenças de regra.
