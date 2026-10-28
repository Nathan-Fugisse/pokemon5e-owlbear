let OBR = null;

const $ = s => document.querySelector(s);
const API = 'https://pokeapi.co/api/v2';
const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
const NS = 'com.pokemon5e.companion';
const TIMEOUT_MS = 12000;
const PAGE_SIZE = 120;
let currentTab = 'dex', species = [], filtered = [], selected = null, page = 0;
let details = new Map(), promises = new Map(), obrReady = false, selectedTokenIds = [];
const aux = {
  moves: {label:'Golpes', endpoint:'move', items:[], detailEndpoint:'move'},
  items: {label:'Itens', endpoint:'item', items:[], detailEndpoint:'item'},
  features: {label:'Habilidades Pokémon', endpoint:'ability', items:[], detailEndpoint:'ability'},
  trainers: {label:'Ferramentas de Treinador', endpoint:null, items:[
    {id:'party',name:'Equipe do treinador',description:'Monte e acompanhe uma equipe de até seis Pokémon vinculados a tokens da cena.'},
    {id:'encounter',name:'Encontro e captura',description:'Checklist de encontro: iniciativa, condição, tentativa de captura e notas da sessão.'},
    {id:'notes',name:'Notas da sessão',description:'Anotações rápidas da campanha e do treinador. As notas ficam nesta sessão da extensão.'}
  ]},
  rules: {label:'Referência rápida', endpoint:null, items:[
    {id:'types',name:'Tipos Pokémon',description:'Referência dos 18 tipos oficiais e seus nomes.'},
    {id:'sheet',name:'Ficha Pokémon 5e',description:'Estrutura de vinculação: número nacional, nome, token e campo reservado para dados de ficha 5e.'},
    {id:'disclaimer',name:'Compatibilidade de regras',description:'Esta extensão ainda não inclui o compêndio completo de regras do módulo Foundry. Os dados da PokéAPI são dados dos jogos oficiais, não regras de Pokémon 5e.'}
  ]}
};
const types = ['Normal','Fogo','Água','Elétrico','Planta','Gelo','Lutador','Veneno','Terra','Voador','Psíquico','Inseto','Pedra','Fantasma','Dragão','Sombrio','Aço','Fada'];
const typeNames = {normal:'Normal',fire:'Fogo',water:'Água',electric:'Elétrico',grass:'Planta',ice:'Gelo',fighting:'Lutador',poison:'Veneno',ground:'Terra',flying:'Voador',psychic:'Psíquico',bug:'Inseto',rock:'Pedra',ghost:'Fantasma',dragon:'Dragão',dark:'Sombrio',steel:'Aço',fairy:'Fada'};
const esc = v => String(v ?? '—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap = s => String(s||'').replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const dexNo = p => String(p.id||p.pokemonId||'').padStart(4,'0');
const imageFor = p => `${ART}/${p.pokemonId||p.id}.png`;

async function api(url, timeout=TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),timeout);
  try {
    const res = await fetch(url,{signal:controller.signal,headers:{Accept:'application/json'}});
    if (!res.ok) throw new Error(`Serviço respondeu HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Tempo limite excedido ao consultar a PokéAPI. Tente novamente.');
    throw e;
  } finally { clearTimeout(timer); }
}
function setConnection(text, kind='') { const el=$('#connection'); el.textContent=text; el.dataset.state=kind; }
function message(text, retry=false) { $('#results').innerHTML=`<div class="empty">${esc(text)}${retry?'<br><button type="button" id="retry-load" class="secondary retry">Tentar novamente</button>':''}</div>`; if(retry) $('#retry-load')?.addEventListener('click',()=>currentTab==='dex'?initDex(true):loadAuxiliary(currentTab,true).then(renderList)); }
async function loadSpeciesList(force=false) {
  if (species.length && !force) return;
  const data=await api(`${API}/pokemon-species?limit=2000&offset=0`);
  species=(data.results||[]).map(row=>{const m=row.url.match(/pokemon-species\/(\d+)\/?/);const id=m?Number(m[1]):0;return {id,pokemonId:id,name:row.name,slug:row.name,sheet5e:null};}).filter(x=>x.id).sort((a,b)=>a.id-b.id);
  if(!species.length) throw new Error('A Pokédex veio vazia.');
}
async function loadPokemon(p) {
  if(details.has(p.id)) return details.get(p.id);
  if(promises.has(p.id)) return promises.get(p.id);
  const promise=(async()=>{
    const pokemon=await api(`${API}/pokemon/${p.id}`);
    let sp=null; try {sp=await api(`${API}/pokemon-species/${p.id}`)} catch(_) {}
    const d={id:p.id,name:p.name,image:pokemon.sprites?.other?.['official-artwork']?.front_default||pokemon.sprites?.front_default||imageFor(p),types:(pokemon.types||[]).sort((a,b)=>a.slot-b.slot).map(x=>x.type.name),heightM:(pokemon.height/10).toFixed(1),weightKg:(pokemon.weight/10).toFixed(1),abilities:(pokemon.abilities||[]).map(x=>({name:x.ability.name,hidden:x.is_hidden})),stats:(pokemon.stats||[]).map(x=>({name:x.stat.name,value:x.base_stat})),baseExperience:pokemon.base_experience,generation:sp?.generation?.name||'',isLegendary:!!sp?.is_legendary,isMythical:!!sp?.is_mythical,captureRate:sp?.capture_rate??null,sheet5e:p.sheet5e||null};
    details.set(p.id,d); return d;
  })().finally(()=>promises.delete(p.id));
  promises.set(p.id,promise); return promise;
}
async function loadAuxiliary(tab,force=false) {
  const info=aux[tab]; if(!info) return;
  if(!info.endpoint) { renderList(); return; }
  if(info.items.length&&!force) return;
  info.loading=true; renderList();
  try {const data=await api(`${API}/${info.endpoint}?limit=2000&offset=0`);info.items=(data.results||[]).map(x=>({name:x.name,url:x.url,id:Number((x.url.match(/\/(\d+)\/?$/)||[])[1]||0)})); info.error='';}
  catch(e){info.error=e.message||'Falha ao carregar';info.items=[];}
  finally{info.loading=false;}
  renderList();
}
function activeList(){return currentTab==='dex'?species:(aux[currentTab]?.items||[]);}
function renderList(){
  const q=$('#search').value.trim().toLocaleLowerCase('pt-BR');
  const info=aux[currentTab];
  if(currentTab!=='dex'&&info?.loading){$('#count').textContent='Carregando…';message(`Carregando ${info.label.toLowerCase()}…`);return;}
  if(currentTab!=='dex'&&info?.error&&!info.items.length){$('#count').textContent='Indisponível';message(`${info.label}: ${info.error}`,true);return;}
  filtered=activeList().filter(x=>(x.name||'').toLocaleLowerCase('pt-BR').includes(q));
  const sort=$('#sort').value;
  if(currentTab==='dex'&&sort==='number') filtered.sort((a,b)=>a.id-b.id); else filtered.sort((a,b)=>(a.name||'').localeCompare(b.name||'','pt-BR'));
  if(sort==='za') filtered.reverse();
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)); page=Math.min(page,pages-1);
  $('#count').textContent=`${filtered.length.toLocaleString('pt-BR')} registros · ${page+1}/${pages}`;
  const slice=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
  $('#results').innerHTML=(slice.length?slice.map((p,i)=>{
    const dex=currentTab==='dex';
    return `<button type="button" class="record ${selected===p?'selected':''}" data-i="${i}">${dex?`<img class="record-image" src="${imageFor(p)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='/assets/icon.svg'">`:'<span class="record-image record-symbol">'+(currentTab==='moves'?'↗':currentTab==='items'?'◇':currentTab==='features'?'✦':currentTab==='trainers'?'♙':'§')+'</span>'}<span class="record-copy"><span class="name">${dex?'#'+dexNo(p)+' ':''}${esc(cap(p.name))}</span><span class="meta">${dex?'Selecionar para ver dados':esc(p.description||'Abrir registro')}</span></span></button>`;
  }).join(''):'<div class="empty">Nenhum registro encontrado.</div>')+`<div class="pagination"><button id="prev-page" class="secondary" ${page===0?'disabled':''}>Anterior</button><span>Página ${page+1} de ${pages}</span><button id="next-page" class="secondary" ${page>=pages-1?'disabled':''}>Próxima</button></div>`;
  $('#results').querySelectorAll('.record').forEach(btn=>btn.addEventListener('click',()=>{selected=slice[Number(btn.dataset.i)];renderList();renderDetail();updateLinkButton();}));
  $('#prev-page')?.addEventListener('click',()=>{page=Math.max(0,page-1);renderList();});
  $('#next-page')?.addEventListener('click',()=>{page=Math.min(pages-1,page+1);renderList();});
}
function renderAuxDetail(p){
  const tab=currentTab, info=aux[tab];
  $('#detail-title').textContent=cap(p.name);
  if(tab==='moves'||tab==='items'||tab==='features'){
    $('#detail-body').innerHTML='<div class="notice">Carregando detalhes do registro…</div>';
    api(p.url).then(d=>{
      if(selected!==p||currentTab!==tab)return;
      const flavor=(d.flavor_text_entries||[]).find(x=>x.language?.name==='en')?.flavor_text?.replace(/[\n\f]/g,' ')||'';
      const effect=(d.effect_entries||[]).find(x=>x.language?.name==='en')?.effect||'';
      const short=(d.effect_entries||[]).find(x=>x.language?.name==='en')?.short_effect||'';
      const rows=[];
      if(tab==='moves') rows.push(['Tipo',d.type?.name],['Categoria',d.damage_class?.name],['Poder',d.power],['Precisão',d.accuracy],['PP',d.pp],['Prioridade',d.priority]);
      if(tab==='items') rows.push(['Categoria',d.category?.name],['Preço',d.cost],['Fling power',d.fling_power]);
      if(tab==='features') rows.push(['Geração',d.generation?.name],['Pokémon associados',(d.pokemon||[]).length]);
      $('#detail-body').innerHTML=`<div class="statgrid">${rows.filter(r=>r[1]!==null&&r[1]!==undefined).map(r=>`<div class="stat"><b>${esc(r[0])}</b><span>${esc(typeof r[1]==='object'?r[1].name||JSON.stringify(r[1]):r[1])}</span></div>`).join('')}</div>${short?`<h3>Efeito</h3><p>${esc(short)}</p>`:''}${effect?`<p>${esc(effect)}</p>`:''}${flavor?`<h3>Descrição</h3><p>${esc(flavor)}</p>`:''}<p class="meta">Dados de referência da PokéAPI. Não substituem o texto ou os valores específicos do módulo Pokémon 5e.</p>`;
    }).catch(e=>{if(selected===p)$('#detail-body').innerHTML=`<div class="notice">Não foi possível carregar os detalhes. ${esc(e.message)}</div><button id="retry-detail" class="secondary">Tentar novamente</button>`;$('#retry-detail')?.addEventListener('click',()=>renderAuxDetail(p));});
    return;
  }
  if(tab==='trainers'){
    if(p.id==='party') $('#detail-body').innerHTML=`<p>Use a Pokédex para selecionar um Pokémon e vincule-o ao token selecionado no mapa.</p><ol><li>Selecione um token na cena.</li><li>Abra a aba Pokédex e escolha o Pokémon.</li><li>Clique em <b>Vincular Pokémon ao token</b>.</li></ol><p>O vínculo é salvo nos metadados do token. Uma ficha 5e completa ainda precisa ser importada do compêndio de origem.</p>`;
    else if(p.id==='encounter') $('#detail-body').innerHTML=`<h3>Checklist de encontro</h3><label class="checkline"><input type="checkbox"> Iniciativa definida</label><label class="checkline"><input type="checkbox"> Condições registradas</label><label class="checkline"><input type="checkbox"> Captura resolvida pelo mestre</label><label class="checkline"><input type="checkbox"> Recompensas e notas anotadas</label><p>Este checklist é local à interface e não implementa automaticamente regras de captura do sistema.</p>`;
    else $('#detail-body').innerHTML=`<label for="session-notes">Notas rápidas</label><textarea id="session-notes" rows="7" placeholder="Anote aqui detalhes da sessão…"></textarea><p><button id="copy-notes" class="secondary">Copiar notas</button></p><p>As notas não são sincronizadas com o Owlbear nem salvas entre sessões nesta versão.</p>`;
    $('#copy-notes')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('#session-notes').value);$('#copy-notes').textContent='Copiado';}catch(_){$('#copy-notes').textContent='Selecione e copie o texto';}}); return;
  }
  if(tab==='rules'){
    const content=p.id==='types'?`<div class="type-list">${types.map(t=>`<span class="type">${esc(t)}</span>`).join('')}</div><p>Os tipos listados são os tipos oficiais dos jogos Pokémon. Relações de efetividade e regras de dano específicas de Pokémon 5e não estão implementadas aqui.</p>`:p.id==='sheet'?`<p>O vínculo do token guarda o número nacional, o nome e um campo reservado <code>sheet5e</code>.</p><p>Para preencher uma ficha completa automaticamente, é necessário portar os dados dos atores/compêndios Pokémon 5e do módulo de Foundry. A PokéAPI não contém esses dados de RPG.</p>`:`<div class="notice">Limitação importante</div><p>Esta versão é um companion com Pokédex e referência de dados; ainda não é uma conversão integral do módulo Foundry. Não inclui compêndios completos de Pokémon 5e, classes de treinador, regras de dano, automação de golpes por nível ou gerenciamento de golpes aprendidos.</p><p>O módulo de referência conhecido <a href="https://github.com/Jerakin/p5e-foundryVTT" target="_blank" rel="noreferrer">Jerakin/p5e-foundryVTT</a> contém Pokémon, golpes e habilidades, mas é uma base antiga. A conversão fiel exige importar e mapear seus dados de compêndio.</p>`;
    $('#detail-body').innerHTML=content; return;
  }
}
async function renderDetail(){
  if(!selected){$('#detail-title').textContent=currentTab==='dex'?'Selecione um Pokémon':(aux[currentTab]?.label||'Conteúdo');$('#detail-body').innerHTML='<p>Selecione um registro para ver os detalhes.</p>';$('#sheet-status').textContent='Ficha 5e: ainda não anexada.';return;}
  if(currentTab!=='dex'){renderAuxDetail(selected);return;}
  const p=selected;$('#detail-title').textContent=`#${dexNo(p)} ${cap(p.name)}`;$('#detail-body').innerHTML=`<div class="art-wrap"><img class="pokemon-art" src="${imageFor(p)}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='/assets/icon.svg'"><span class="art-caption">Ilustração oficial · PokéAPI</span></div><div class="notice">Carregando detalhes (limite de ${TIMEOUT_MS/1000}s)…</div>`;
  $('#sheet-status').textContent=p.sheet5e?'Ficha 5e anexada.':`Ficha 5e ainda não anexada · #${p.id}`;
  try{const d=await loadPokemon(p);if(selected!==p||currentTab!=='dex')return;
    $('#detail-body').innerHTML=`<div class="art-wrap"><img class="pokemon-art" src="${esc(d.image)}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='/assets/icon.svg'"><span class="art-caption">Ilustração oficial · PokéAPI</span></div><div><b>Número nacional:</b> #${d.id}</div><div style="margin-top:6px">${d.types.map(t=>`<span class="type">${esc(typeNames[t]||cap(t))}</span>`).join('')}</div><div class="statgrid"><div class="stat"><b>Altura</b><span>${d.heightM} m</span></div><div class="stat"><b>Peso</b><span>${d.weightKg} kg</span></div><div class="stat"><b>EXP base (jogo)</b><span>${d.baseExperience??'—'}</span></div><div class="stat"><b>Taxa de captura</b><span>${d.captureRate??'—'}</span></div></div><h3>Atributos-base (jogos oficiais)</h3><div class="statgrid">${d.stats.map(s=>`<div class="stat"><b>${esc(cap(s.name))}</b><span>${s.value}</span></div>`).join('')}</div><h3>Habilidades</h3><ul>${d.abilities.map(a=>`<li>${esc(cap(a.name))}${a.hidden?' (oculta)':''}</li>`).join('')||'<li>Não informadas</li>'}</ul><p><b>Geração:</b> ${esc(cap(d.generation))}</p><p>${d.isLegendary?'Lendário. ':''}${d.isMythical?'Mítico.':''}</p><div class="notice">Dados dos jogos Pokémon; não são atributos de ficha Pokémon 5e.</div>`;
  }catch(e){if(selected===p)$('#detail-body').innerHTML=`<div class="notice">Falha ao carregar detalhes: ${esc(e.message)}</div><button id="retry-detail" class="secondary">Tentar novamente</button>`;$('#retry-detail')?.addEventListener('click',()=>{details.delete(p.id);renderDetail();});}
}
function updateLinkButton(){ $('#link-token').disabled=!(obrReady&&selected&&currentTab==='dex'&&selectedTokenIds.length); }
function setTab(tab){currentTab=tab;selected=null;page=0;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('#search').value='';$('#search').placeholder=tab==='dex'?'Pesquisar Pokémon pelo nome…':'Pesquisar por nome…';$('#sort').value=tab==='dex'?'number':'az';$('#link-token').disabled=true;$('#detail-title').textContent=tab==='dex'?'Selecione um Pokémon':aux[tab]?.label||'Conteúdo';$('#detail-body').innerHTML='<p>Selecione um registro para ver os detalhes.</p>';if(tab==='dex')renderList();else if(aux[tab]?.endpoint)loadAuxiliary(tab);else renderList();}
async function updateSelection(){if(!obrReady){$('#token-status').textContent='Abra esta extensão dentro de uma sala Owlbear para usar ferramentas de token.';return;}try{selectedTokenIds=await OBR.player.getSelection();}catch(_){selectedTokenIds=[];}$('#token-status').textContent=selectedTokenIds.length?`${selectedTokenIds.length} token(s) selecionado(s).`:'Nenhum token selecionado.';updateLinkButton();}
async function linkSelected(){if(!obrReady||!selected||currentTab!=='dex'||!selectedTokenIds.length)return;const p=selected;try{await OBR.scene.items.updateItems(items=>items.map(item=>selectedTokenIds.includes(item.id)?({...item,metadata:{...(item.metadata||{}),[NS]:{nationalDex:p.id,name:p.name,sheet5e:p.sheet5e||null}}}):item));$('#token-status').textContent=`${cap(p.name)} vinculado a ${selectedTokenIds.length} token(s).`;}catch(e){$('#token-status').textContent=`Não foi possível vincular: ${e.message||'verifique as permissões da extensão'}`;}}
function wireUI(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));$('#search').addEventListener('input',()=>{page=0;renderList();});$('#sort').addEventListener('change',()=>{page=0;renderList();});$('#refresh-token').addEventListener('click',updateSelection);$('#link-token').addEventListener('click',linkSelected);}
async function initDex(force=false){setConnection('Carregando Pokédex','loading');message('Carregando catálogo nacional…');try{await loadSpeciesList(force);setConnection('Pokédex pronta','ok');$('#token-status').textContent=`${species.length.toLocaleString('pt-BR')} Pokémon indexados. Os detalhes são carregados sob demanda.`;renderList();}catch(e){setConnection('Falha de conexão','error');message(`Não foi possível carregar a Pokédex: ${e.message}`,true);}}
async function main(){wireUI();await initDex();try{const sdk=await Promise.race([import('https://esm.sh/@owlbear-rodeo/sdk@1.5.2'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo limite ao carregar o SDK do Owlbear')),8000))]);OBR=sdk.default||sdk;OBR.onReady(async()=>{obrReady=true;setConnection('Owlbear conectado','ok');await updateSelection();try{OBR.player.onChange(updateSelection);}catch(_){}});}catch(e){setConnection(species.length?'Modo catálogo':'Aguardando conexão','');$('#token-status').textContent='Pokédex independente disponível. Integração com tokens indisponível: SDK do Owlbear não carregou.';}}
main();
