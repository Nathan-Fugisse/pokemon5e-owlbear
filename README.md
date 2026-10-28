# Pokémon 5e Companion para Owlbear Rodeo — v0.2.0

Extensão estática para hospedar na Vercel. Esta versão corrige problemas comuns de abas e carregamento: inicialização da interface não depende do SDK do Owlbear, requisições da PokéAPI têm timeout, listas são paginadas e erros exibem opção de tentar novamente.

## Recursos implementados
- Pokédex nacional consultada dinamicamente na PokéAPI, com imagens oficiais, tipos, altura, peso, habilidades e atributos-base dos jogos.
- Abas de Golpes, Itens e Habilidades com pesquisa, paginação e painel de detalhes.
- Aba de ferramentas de treinador com checklist de encontro e notas temporárias.
- Referência de tipos e explicação de compatibilidade.
- Integração básica com Owlbear Rodeo: associa Pokémon selecionado aos tokens selecionados usando metadados `com.pokemon5e.companion`.
- Timeout de rede, mensagens de erro e tentativa de recuperação; a interface não deve ficar presa indefinidamente num indicador de carregamento.

## Instalar/atualizar na Vercel
1. Extraia o ZIP. Importe a pasta para seu repositório ou substitua os arquivos da implantação atual.
2. Faça deploy como projeto estático, sem build command e com a raiz do projeto apontando para esta pasta.
3. Confirme que `https://SEU-PROJETO.vercel.app/manifest.json` abre um JSON.
4. No Owlbear Rodeo, adicione/atualize a extensão usando essa URL de manifesto. Use sempre o mesmo endereço de manifesto nas atualizações.

## Limites importantes
Esta é uma extensão companion, não uma conversão integral do módulo Foundry. A PokéAPI contém dados dos jogos oficiais, não fichas de Pokémon 5e. O campo de metadados `sheet5e` está preparado, mas fichas completas, compêndios de Pokémon 5e, classes/subclasses de treinadores, itens específicos do sistema, regras de combate e automações de progressão ainda precisam ser portados do módulo de origem. A aba de notas não sincroniza nem persiste dados entre sessões.

## Verificação
Os arquivos são estáticos e o JavaScript deve ser validado antes do deploy. O projeto não foi publicado na sua conta Vercel nem testado dentro da sua sala Owlbear; por isso, não é possível garantir o comportamento real da implantação sem executar esse teste no ambiente.

## Fontes de dados
- PokéAPI: https://pokeapi.co/
- SDK Owlbear Rodeo: https://docs.owlbear.rodeo/
- Módulo Foundry de referência: https://github.com/Jerakin/p5e-foundryVTT
