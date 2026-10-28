import OBR from 'https://esm.sh/@owlbear-rodeo/sdk@1.5.2';

const $ = s => document.querySelector(s);
const POKEAPI = 'https://pokeapi.co/api/v2';
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
const NS = 'com.pokemon5e.companion';
let currentTab = 'dex';
let species = [];
let filtered = [];
let selected = null;
let details = new Map();
let detailPromises = new Map();
let obrReady = false;
let selectedTokenIds = [];
const auxiliaryTabs = {
  moves: {label:'Golpes', endpoint:'move', items:[]},
  items: {label:'Itens', endpoint:'item', items:[]},
  features: {label:'Habilidades Pokémon', endpoint:'ability', items:[]},
  trainers: {label:'Treinadores', endpoint:null, items:[]},
  rules: {label:'Regras', endpoint:null, items:[]}
};
const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cap = s => String(s || '').split('-').map(x=>x ? x[0].toUpperCase()+x.slice(1) : x).join(' ');
const dexNo = item => String(item.id || item.pokemonId || '').padStart(4,'0');
const dexImage = item => `${SPRITES}/${item.pokemonId || item.id}.png`;

async function api(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
async function loadSpeciesList() {
  // The species endpoint returns the national species catalogue, including alternate species records
  // supported by the current PokéAPI data set.
  const data = await api(`${POKEAPI}/pokemon-species?limit=2000&offset=0`);
  species = (data.results || []).map(row => {
    const match = row.url.match(/pokemon-species\/(\d+)\/?/);
    const id = match ? Number(match[1]) : 0;
    return {id, pokemonId:id, name:row.name, slug:row.name, sheet5e:null};
  }).filter(x=>x.id).sort((a,b)=>a.id-b.id);
  if (!species.length) throw new Error('A Pokédex veio vazia.');
}
async function loadDetail(p) {
  if (details.has(p.id)) return details.get(p.id);
  if (detailPromises.has(p.id)) return detailPromises.get(p.id);
  const promise = (async()=>{
    const [pokemon, sp] = await Promise.all([
      api(`${POKEAPI}/pokemon/${p.id}`),
      api(`${POKEAPI}/pokemon-species/${p.id}`).catch(()=>null)
    ]);
    const data = {
      id:p.id, name:p.name,
      image:pokemon.sprites?.other?.['official-artwork']?.front_default || pokemon.sprites?.front_default || dexImage(p),
      types:(pokemon.types||[]).sort((a,b)=>a.slot-b.slot).map(x=>x.type.name),
      heightM:(pokemon.height/10).toFixed(1),
      weightKg:(pokemon.weight/10).toFixed(1),
      abilities:(pokemon.abilities||[]).map(x=>({name:x.ability.name, hidden:x.is_hidden})),
      stats:(pokemon.stats||[]).map(x=>({name:x.stat.name, value:x.base_stat})),
      baseExperience:pokemon.base_experience,
      generation:sp?.generation?.name || '',
      isLegendary:!!sp?.is_legendary,
      isMythical:!!sp?.is_mythical,
      captureRate:sp?.capture_rate ?? null,
      // Stable extension point for a future Pokémon 5e sheet. Keep the official game data separate.
      sheet5e:p.sheet5e || null
    };
    details.set(p.id,data);
    return data;
  })().finally(()=>detailPromises.delete(p.id));
  detailPromises.set(p.id,promise);
  return promise;
}
function activeList() {
  if (currentTab === 'dex') return species;
  return auxiliaryTabs[currentTab]?.items || [];
}
function renderList() {
  const q = $('#search').value.trim().toLocaleLowerCase('pt-BR');
  const list = activeList();
  filtered = list.filter(x => (x.name||'').toLocaleLowerCase('pt-BR').includes(q));
  const sort = $('#sort').value;
  if (currentTab === 'dex' && sort === 'number') filtered.sort((a,b)=>a.id-b.id);
  else filtered.sort((a,b)=>(a.name||'').localeCompare(b.name||'', 'pt-BR'));
  if (sort === 'za') filtered.reverse();
  $('#count').textContent = `${filtered.length.toLocaleString('pt-BR')} registros`;
  const slice = filtered.slice(0,500);
  $('#results').innerHTML = slice.length ? slice.map((p,i)=>`
    <button type="button" class="record ${selected===p?'selected':''}" data-i="${i}">
      <img class="record-image" src="${esc(dexImage(p))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="record-copy"><span class="name">${currentTab==='dex'?'#'+dexNo(p)+' ':''}${esc(cap(p.name))}</span><span class="meta">${currentTab==='dex'?'Carregar tipos e atributos':'Registro da PokéAPI'}</span></span>
    </button>`).join('') : '<div class="empty">Nenhum registro nesta aba ou nenhum resultado encontrado.</div>';
  $('#results').querySelectorAll('.record').forEach(btn=>btn.addEventListener('click',()=>{
    selected = slice[Number(btn.dataset.i)];
    renderList();
    renderDetail();
    $('#link-token').disabled = !obrReady || !selected || !selectedTokenIds.length;
  }));
}
async function renderDetail() {
  if (!selected) {
    $('#detail-title').textContent='Selecione um Pokémon';
    $('#detail-body').innerHTML='<p>Selecione um registro para carregar os dados.</p>';
    $('#sheet-status').textContent='Ficha 5e: ainda não anexada.';
    return;
  }
  const picked=selected;
  $('#detail-title').textContent=`#${dexNo(picked)} ${cap(picked.name)}`;
  $('#detail-body').innerHTML=`<div class="art-wrap"><img class="pokemon-art" src="${esc(dexImage(picked))}" alt="${esc(picked.name)}"><span class="art-caption">Ilustração oficial · PokéAPI</span></div><div class="notice">Carregando tipos, altura, peso, habilidades e atributos-base…</div>`;
  $('#sheet-status').textContent = picked.sheet5e ? 'Ficha Pokémon 5e anexada.' : `Ficha 5e: não anexada · chave preparada: nationalDex=${picked.id}`;
  try {
    const d=await loadDetail(picked);
    if (selected !== picked) return;
    const typeHtml=d.types.map(t=>`<span class="type">${esc(cap(t))}</span>`).join('');
    const statsHtml=d.stats.map(s=>`<div class="stat"><b>${esc(cap(s.name))}</b><span>${s.value}</span></div>`).join('');
    const abilitiesHtml=d.abilities.map(a=>`<li>${esc(cap(a.name))}${a.hidden?' (oculta)':''}</li>`).join('');
    $('#detail-body').innerHTML=`<div class="art-wrap"><img class="pokemon-art" src="${esc(d.image||dexImage(picked))}" alt="${esc(picked.name)}"><span class="art-caption">Ilustração oficial · PokéAPI</span></div>
      <div><b>Número nacional:</b> #${d.id}</div><div style="margin-top:6px">${typeHtml}</div>
      <div class="statgrid"><div class="stat"><b>Altura</b><span>${d.heightM} m</span></div><div class="stat"><b>Peso</b><span>${d.weightKg} kg</span></div><div class="stat"><b>EXP base (jogo)</b><span>${d.baseExperience ?? '—'}</span></div><div class="stat"><b>Taxa de captura</b><span>${d.captureRate ?? '—'}</span></div></div>
      <h3>Atributos-base (jogos oficiais)</h3><div class="statgrid">${statsHtml}</div>
      <h3>Habilidades</h3><ul>${abilitiesHtml || '<li>Não informadas</li>'}</ul>
      <p><b>Geração:</b> ${esc(cap(d.generation))}</p><p>${d.isLegendary?'Lendário. ':''}${d.isMythical?'Mítico.':''}</p>
      <div class="notice">Estes são dados dos jogos Pokémon obtidos na PokéAPI, não atributos ou valores de uma ficha Pokémon 5e.</div>`;
  } catch (e) {
    if (selected === picked) $('#detail-body').innerHTML='<div class="notice">Não foi possível carregar os detalhes agora. Confira a conexão e selecione novamente.</div>';
  }
}
async function loadAuxiliary(tab) {
  const info=auxiliaryTabs[tab];
  if (!info || info.items.length || !info.endpoint) return;
  try {
    const data=await api(`${POKEAPI}/${info.endpoint}?limit=2000&offset=0`);
    info.items=(data.results||[]).map(x=>({name:x.name,url:x.url,id:Number((x.url.match(/\/(\d+)\/?$/)||[])[1]||0)}));
  } catch(e) {
    info.items=[];
  }
}
function setTab(tab) {
  currentTab=tab;
  selected=null;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $('#search').placeholder=tab==='dex'?'Pesquisar Pokémon pelo nome…':'Pesquisar por nome…';
  $('#sort').value=tab==='dex'?'number':'az';
  $('#detail-title').textContent=tab==='dex'?'Selecione um Pokémon':(auxiliaryTabs[tab]?.label||'Conteúdo');
  $('#detail-body').innerHTML=tab==='dex'?'<p>Selecione um Pokémon para carregar todos os dados.</p>':'<p>Esta aba usa o endpoint correspondente da PokéAPI quando disponível. Os conteúdos de treinador e regras do Pokémon 5e serão adicionados em uma etapa própria.</p>';
  $('#link-token').disabled=true;
  if(tab!=='dex') loadAuxiliary(tab).then(renderList);
  renderList();
}
async function updateSelection() {
  if (!obrReady) { $('#token-status').textContent='Abra a extensão dentro de uma sala Owlbear para verificar tokens.'; return; }
  try { selectedTokenIds=await OBR.player.getSelection(); }
  catch(e) { selectedTokenIds=[]; }
  $('#token-status').textContent=selectedTokenIds.length?`${selectedTokenIds.length} token(s) selecionado(s).`:'Nenhum token selecionado.';
  $('#link-token').disabled=!selected||!selectedTokenIds.length;
}
async function linkSelected() {
  if(!obrReady||!selected||!selectedTokenIds.length)return;
  const p=selected;
  try {
    await OBR.scene.items.updateItems(items=>items.map(item=>selectedTokenIds.includes(item.id)?({
      ...item, metadata:{...(item.metadata||{}),[NS]:{nationalDex:p.id,name:p.name,sheet5e:p.sheet5e||null}}
    }):item));
    $('#token-status').textContent=`${cap(p.name)} vinculado a ${selectedTokenIds.length} token(s).`;
  } catch(e) {
    $('#token-status').textContent='Não foi possível vincular. Confira as permissões da extensão.';
  }
}
function wireUI() {
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>setTab(btn.dataset.tab)));
  $('#search').addEventListener('input',renderList);
  $('#sort').addEventListener('change',renderList);
  $('#refresh-token').addEventListener('click',updateSelection);
  $('#link-token').addEventListener('click',linkSelected);
}
async function main() {
  wireUI();
  $('#results').innerHTML='<div class="empty">Baixando lista nacional da Pokédex…</div>';
  try {
    await loadSpeciesList();
    $('#connection').textContent='Pokédex carregada';
    $('#token-status').textContent=`${species.length.toLocaleString('pt-BR')} espécies indexadas. Os detalhes são carregados ao selecionar cada Pokémon.`;
    renderList();
  } catch(e) {
    $('#connection').textContent='Erro de conexão';
    $('#results').innerHTML='<div class="empty">Não foi possível carregar a lista nacional da PokéAPI. Verifique a conexão e recarregue a extensão.</div>';
  }
  try {
    await OBR.onReady(async()=>{
      obrReady=true;
      $('#connection').textContent='Owlbear conectado';
      await updateSelection();
      OBR.player.onChange(updateSelection);
    });
  } catch(e) {
    // Standalone preview can still browse the Pokédex; Owlbear-only actions remain disabled.
  }
}
main();
