let OBR = null;

const $ = s => document.querySelector(s);
const API = 'https://pokeapi.co/api/v2';
const ART = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
const NS = 'com.pokemon5e.companion';
const TIMEOUT_MS = 12000;
const PAGE_SIZE = 120;
let currentTab = 'dex', species = [], filtered = [], selected = null, page = 0;
let details = new Map(), promises = new Map(), obrReady = false, selectedTokenIds = [];
const SHEETS_KEY = 'pokemon5e-companion-sheets-v030';
let sheets = loadSheets(), sheetSyncTimer = null;
const aux = {
  moves: {label:'Golpes (jogos Pokémon)', endpoint:'move', items:[], detailEndpoint:'move'},
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
const slugify = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
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
function loadSheets(){
  try { const value=JSON.parse(localStorage.getItem(SHEETS_KEY)||'[]'); return Array.isArray(value)?value:[]; }
  catch(_){ return []; }
}
function persistSheets(){
  try { localStorage.setItem(SHEETS_KEY,JSON.stringify(sheets)); return true; }
  catch(_){ $('#sheet-save-status') && ($('#sheet-save-status').textContent='Não foi possível salvar localmente. Exporte uma cópia da ficha.'); return false; }
}
const statNames = {str:'Força',dex:'Destreza',con:'Constituição',int:'Inteligência',wis:'Sabedoria',cha:'Carisma'};
const modifier = n => {const v=Number(n);return Number.isFinite(v)?Math.floor((v-10)/2):0;};
const signed = n => n>=0?`+${n}`:String(n);
function makeSheet(p,d=null){
  const now=Date.now();
  return {id:`sheet-${p.id}-${now}`,speciesId:p.id,species:cap(p.name),nickname:'',trainer:'',edition:'2024',level:1,experience:0,nature:'',ability:d?.abilities?.[0]?.name||'',heldItem:'',types:(d?.types||[]).map(t=>typeNames[t]||cap(t)).join(', '),image:d?.image||imageFor(p),currentHP:10,maxHP:10,tempHP:0,ac:10,speed:30,initiative:0,proficiency:2,bondLevel:1,bondPoints:0,conditions:'',fainted:false,stats:{str:10,dex:10,con:10,int:10,wis:10,cha:10},moves:Array.from({length:4},()=>({name:'',type:'',time:'Ação',range:'',ppMax:5,ppCurrent:5,movePower:'dex',rollType:'attack',damage:'1d6',usesMove:true,notes:''})),traits:'',inventory:'',notes:'',tokenIds:[...selectedTokenIds],createdAt:now,updatedAt:now};
}
function sheetForSpecies(id){return sheets.find(s=>Number(s.speciesId)===Number(id));}
async function createSheetFromSelected(){
  if(currentTab!=='dex'||!selected)return;
  const p=selected;
  let sheet=sheetForSpecies(p.id);
  if(!sheet){let d=null;try{d=await loadPokemon(p)}catch(_){} sheet=makeSheet(p,d);sheets.unshift(sheet);persistSheets();}
  sheet.tokenIds=[...new Set([...(sheet.tokenIds||[]),...selectedTokenIds])];
  selected=sheet;setTab('sheets');selected=sheet;renderList();renderSheetDetail();
  if(selectedTokenIds.length) await syncSheetToTokens(sheet);
}
function renderSheetList(){
  const q=$('#search').value.trim().toLocaleLowerCase('pt-BR');
  let list=sheets.filter(s=>`${s.nickname} ${s.species} ${s.trainer}`.toLocaleLowerCase('pt-BR').includes(q));
  const sort=$('#sort').value;if(sort==='za')list.reverse();else if(sort==='az')list.sort((a,b)=>(a.nickname||a.species).localeCompare(b.nickname||b.species,'pt-BR'));
  $('#count').textContent=`${list.length} ficha(s)`;
  $('#results').innerHTML=(list.length?list.map((s,i)=>`<button type="button" class="record ${selected?.id===s.id?'selected':''}" data-sheet="${esc(s.id)}"><img class="record-image" src="${esc(s.image||'/assets/icon.svg')}" alt="" onerror="this.onerror=null;this.src='/assets/icon.svg'"><span class="record-copy"><span class="name">${esc(s.nickname||s.species)}</span><span class="meta">${esc(s.species)} · Nível ${Number(s.level)||1}${s.trainer?' · '+esc(s.trainer):''}</span><span class="tag">PV ${Number(s.currentHP)||0}/${Number(s.maxHP)||0}</span></span></button>`).join(''):'<div class="empty">Nenhuma ficha criada. Selecione um Pokémon na Pokédex e use “Criar ficha Pokémon 5e”.</div>')+`<div class="pagination"><button id="export-sheets" class="secondary">Exportar fichas</button><button id="import-sheets" class="secondary">Importar backup</button><input id="sheet-file" type="file" accept="application/json,.json" hidden></div>`;
  $('#results').querySelectorAll('[data-sheet]').forEach(b=>b.addEventListener('click',()=>{selected=sheets.find(s=>s.id===b.dataset.sheet)||null;renderSheetList();renderSheetDetail();}));
  $('#export-sheets')?.addEventListener('click',exportSheets);
  $('#import-sheets')?.addEventListener('click',()=>$('#sheet-file').click());
  $('#sheet-file')?.addEventListener('change',importSheets);
}
function exportSheets(){
  const blob=new Blob([JSON.stringify({format:'pokemon5e-companion-backup',version:1,exportedAt:new Date().toISOString(),sheets},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pokemon5e-fichas-backup.json';a.click();URL.revokeObjectURL(url);
}
async function importSheets(e){
  const file=e.target.files?.[0];if(!file)return;
  try{const data=JSON.parse(await file.text());const incoming=Array.isArray(data)?data:data.sheets;if(!Array.isArray(incoming))throw new Error('Formato de backup inválido.');
    for(const s of incoming){if(!s.id||!s.species)continue;const i=sheets.findIndex(x=>x.id===s.id);if(i>=0)sheets[i]={...sheets[i],...s};else sheets.push(s);}persistSheets();renderSheetList();$('#token-status').textContent=`Backup importado: ${incoming.length} ficha(s).`;
  }catch(err){$('#token-status').textContent=`Não foi possível importar: ${err.message}`;}finally{e.target.value='';}
}
function renderSheetDetail(){
  if(!selected){$('#detail-title').textContent='Ficha Pokémon 5e';$('#detail-body').innerHTML='<p>Selecione uma ficha na lista ou crie uma a partir da Pokédex.</p><p>As fichas são salvas localmente e podem ser sincronizadas aos metadados dos tokens selecionados no Owlbear.</p><a href="https://poke5e.app/pt/" target="_blank" rel="noreferrer">Abrir referência Pokémon 5e</a>';$('#sheet-status').textContent=`${sheets.length} ficha(s) salvas neste navegador.`;return;}
  const s=selected;$('#detail-title').textContent=s.nickname||s.species||'Ficha Pokémon 5e';
  const field=(label,key,type='text',extra='')=>`<label class="sheet-field">${label}<input name="${key}" type="${type}" value="${esc(s[key]??'')}" ${extra}></label>`;
  const statFields=Object.keys(statNames).map(k=>`<label class="sheet-stat"><span>${statNames[k]}</span><input name="stat-${k}" type="number" min="1" max="30" value="${Number(s.stats?.[k]??10)}"><small id="mod-${k}">Mod. ${signed(modifier(s.stats?.[k]??10))}</small></label>`).join('');
  const moveFields=(s.moves||[]).concat(Array.from({length:Math.max(0,4-(s.moves||[]).length)},()=>({}))).slice(0,4).map((m,i)=>{
    const statValue=({str:'str',dex:'dex',con:'con',int:'int',wis:'wis',cha:'cha'})[m.movePower]||'dex';
    const typeValue=types.find(t=>t.toLowerCase()===String(m.type||'').toLowerCase())||typeNames[String(m.type||'').toLowerCase()]||'';
    const ppMax=Number(m.ppMax??(String(m.pp||'').split('/')[1]||m.pp||5))||5;
    const ppCurrent=Number(m.ppCurrent??(String(m.pp||'').split('/')[0]||ppMax));
    return `<fieldset class="move-field" data-move-index="${i}"><legend>Golpe ${i+1}${m.name?` · <a href="https://poke5e.app/moves/${esc(slugify(m.name))}" target="_blank" rel="noreferrer">ver descrição oficial</a>`:''}</legend><div class="sheet-grid two">
    <label class="sheet-field">Nome do golpe<input name="move-${i}-name" value="${esc(m.name||'')}" placeholder="Ex.: Tackle"></label>
    <label class="sheet-field">Tipo<select name="move-${i}-type"><option value="">Selecione…</option>${types.map(t=>`<option value="${esc(t)}" ${typeValue===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
    <label class="sheet-field">Tempo<select name="move-${i}-time"><option ${String(m.time||'Ação').toLowerCase().includes('ação')?'selected':''}>Ação</option><option ${String(m.time||'').toLowerCase().includes('bônus')?'selected':''}>Ação bônus</option><option ${String(m.time||'').toLowerCase().includes('reação')?'selected':''}>Reação</option><option ${String(m.time||'').toLowerCase().includes('minuto')?'selected':''}>Minutos</option></select></label>
    <label class="sheet-field">Alcance<input name="move-${i}-range" value="${esc(m.range||'Melee / 5 pés')}" placeholder="Melee, 60 pés…"></label>
    <label class="sheet-field">Atributo de poder<select name="move-${i}-power">${Object.entries(statNames).map(([k,v])=>`<option value="${k}" ${statValue===k?'selected':''}>${v} (${signed(modifier(s.stats?.[k]??10))})</option>`).join('')}</select></label>
    <label class="sheet-field">Resolução<select name="move-${i}-roll"><option value="attack" ${(m.rollType||'attack')==='attack'?'selected':''}>Ataque (d20)</option><option value="save" ${m.rollType==='save'?'selected':''}>Teste de resistência</option><option value="none" ${m.rollType==='none'?'selected':''}>Sem rolagem</option></select></label>
    <label class="sheet-field">Dano em dados<input name="move-${i}-damage" value="${esc(m.damage||'')}" placeholder="Ex.: 1d6, 2d8, 3d10"></label>
    <label class="sheet-field">PP máximos<input name="move-${i}-ppmax" type="number" min="0" max="99" value="${ppMax}"></label>
    <label class="sheet-field">PP atuais<input name="move-${i}-ppcurrent" type="number" min="0" max="99" value="${ppCurrent}"></label>
    <label class="sheet-check"><input name="move-${i}-movebonus" type="checkbox" ${m.usesMove!==false?'checked':''}> Adiciona modificador MOVE ao dano</label>
    <label class="sheet-field">Efeitos / notas<input name="move-${i}-notes" value="${esc(m.notes||'')}" placeholder="Condição, efeito adicional…"></label></div>
    <div class="move-calcs"><span>Bônus de ataque: <b id="move-${i}-attack-bonus">${signed(modifier(s.stats?.[statValue]??10)+Number(s.proficiency||2))}</b></span><span>CD de resistência: <b id="move-${i}-save-dc">${8+modifier(s.stats?.[statValue]??10)+Number(s.proficiency||2)}</b></span><span>STAB: <b id="move-${i}-stab">${types.includes(typeValue)&&String(s.types||'').toLowerCase().split(/[,/]/).some(t=>t.trim()===typeValue.toLowerCase())?signed(Math.max(0,Number(s.proficiency||2))):'+0'}</b></span></div>
    <div class="move-actions"><button type="button" class="primary" data-move-use="${i}">Usar golpe / rolar</button><button type="button" class="secondary" data-move-damage="${i}">Rolar dano</button></div><p class="move-result" id="move-${i}-result" aria-live="polite">${esc(m.lastRoll||'Pronto para combate.')}</p></fieldset>`;
  }).join('');
  $('#detail-body').innerHTML=`<form id="pokemon-sheet-form" class="pokemon-sheet"><div class="sheet-banner"><img src="${esc(s.image||'/assets/icon.svg')}" alt="" onerror="this.onerror=null;this.src='/assets/icon.svg'"><div><strong>${esc(s.species)}</strong><span>${esc(s.types||'Tipos a definir')} · Ficha Pokémon 5e</span><span class="meta">Modelo de ficha editável; confirme valores específicos com a edição de regras da sua mesa.</span></div></div>
  <h3>Identidade</h3><div class="sheet-grid two">${field('Espécie','species')}${field('Apelido','nickname')}${field('Treinador','trainer')}${field('Nível','level','number','min="1" max="20"')}${field('Experiência','experience','number','min="0"')}<label class="sheet-field">Edição das regras<select name="edition"><option value="2024" ${s.edition==='2024'?'selected':''}>2024 (atual)</option><option value="2018" ${s.edition==='2018'?'selected':''}>2018 (original)</option></select></label>${field('Natureza','nature')}${field('Habilidade','ability')}${field('Item segurado','heldItem')}${field('Tipos','types')}</div>
  <h3>Combate</h3><div class="sheet-grid three">${field('PV atuais','currentHP','number','min="0"')}${field('PV máximos','maxHP','number','min="1"')}${field('PV temporários','tempHP','number','min="0"')}${field('Classe de Armadura','ac','number','min="0"')}${field('Deslocamento (pés)','speed','number','min="0"')}${field('Bônus de iniciativa','initiative','number')}${field('Bônus de proficiência','proficiency','number','min="0"')}${field('Nível de vínculo','bondLevel','number','min="0"')}${field('Pontos de vínculo','bondPoints','number','min="0"')}</div><div class="move-actions"><button type="button" class="primary" id="roll-initiative">Rolar iniciativa (d20)</button><button type="button" class="secondary" id="long-rest-pp">Descanso longo: recuperar PP</button></div><p id="initiative-result" class="move-result" aria-live="polite">Iniciativa: bônus ${signed(Number(s.initiative)||0)}.</p><div class="hp-tools"><label class="sheet-field">Quantidade de PV<input id="hp-adjust-amount" type="number" min="1" value="1"></label><div class="move-actions"><button type="button" class="secondary" id="apply-damage">Aplicar dano</button><button type="button" class="secondary" id="apply-heal">Curar</button></div><p id="hp-result" class="move-result" aria-live="polite">Dano consome PV temporários antes dos PV atuais.</p></div>
  <h3>Atributos</h3><p class="meta">Os modificadores são calculados automaticamente: (atributo − 10) ÷ 2, arredondado para baixo.</p><div class="sheet-stats">${statFields}</div>
  <h3>Golpes e rolagens (até quatro)</h3><p class="meta">Informe o dado de dano conforme a descrição oficial do golpe. O bônus de ataque é modificador do Atributo de Poder + proficiência; a CD é 8 + modificador + proficiência. STAB adiciona proficiência ao dano quando o tipo do golpe combina com um dos tipos do Pokémon. PP é gasto ao usar o golpe. <a href="https://poke5e.app/moves" target="_blank" rel="noreferrer">Consultar catálogo oficial dos golpes (Pokémon 5e)</a>.</p>${moveFields}<div id="combat-log" class="combat-log" aria-live="polite">As rolagens aparecerão no campo de resultado de cada golpe.</div>
  <h3>Condições e características</h3><div class="sheet-grid">${field('Condições','conditions')}${field('Características / traços','traits')}<label class="sheet-check"><input name="fainted" type="checkbox" ${s.fainted?'checked':''}> Desmaiado</label><label class="sheet-field">Inventário / itens<textarea name="inventory" rows="3">${esc(s.inventory||'')}</textarea></label><label class="sheet-field">Notas da ficha<textarea name="notes" rows="4">${esc(s.notes||'')}</textarea></label></div>
  <div class="sheet-actions"><button type="button" class="primary" id="save-sheet-now">Salvar ficha</button><button type="button" class="secondary" id="sync-sheet-now">Sincronizar com token</button><button type="button" class="secondary" id="import-sheet-token">Importar ficha do token</button><button type="button" class="secondary" id="delete-sheet">Excluir ficha</button></div><p id="sheet-save-status" class="status">Salvamento automático local ativo.</p><p class="meta">A sincronização via Owlbear grava a ficha nos metadados dos tokens vinculados. Para compartilhar entre navegadores/jogadores, selecione o token com a ficha e use “Importar ficha do token”.</p><a href="https://poke5e.app/pt/" target="_blank" rel="noreferrer">Referência oficial do projeto Pokémon 5e</a></form>`;
  const form=$('#pokemon-sheet-form');
  const readForm=()=>{
    const fd=new FormData(form);for(const k of ['species','nickname','trainer','edition','nature','ability','heldItem','types','currentHP','maxHP','tempHP','ac','speed','initiative','proficiency','bondLevel','bondPoints','experience','level','conditions','traits','inventory','notes']){if(fd.has(k))s[k]=['level','experience','currentHP','maxHP','tempHP','ac','speed','initiative','proficiency','bondLevel','bondPoints'].includes(k)?Number(fd.get(k)||0):String(fd.get(k)||'');}
    s.fainted=form.elements.fainted.checked;s.stats=s.stats||{};for(const k of Object.keys(statNames)){s.stats[k]=Number(fd.get(`stat-${k}`)||10);const mod=$(`#mod-${k}`);if(mod)mod.textContent=`Mod. ${signed(modifier(s.stats[k]))}`;}
    s.moves=Array.from({length:4},(_,i)=>{const old=s.moves?.[i]||{};return {name:String(fd.get(`move-${i}-name`)||''),type:String(fd.get(`move-${i}-type`)||''),time:String(fd.get(`move-${i}-time`)||'Ação'),range:String(fd.get(`move-${i}-range`)||''),ppMax:Number(fd.get(`move-${i}-ppmax`)||0),ppCurrent:Number(fd.get(`move-${i}-ppcurrent`)||0),movePower:String(fd.get(`move-${i}-power`)||'dex'),rollType:String(fd.get(`move-${i}-roll`)||'attack'),damage:String(fd.get(`move-${i}-damage`)||''),usesMove:fd.has(`move-${i}-movebonus`),notes:String(fd.get(`move-${i}-notes`)||''),lastRoll:old.lastRoll||''};});s.updatedAt=Date.now();
    updateMoveCalcs(form);persistSheets();const status=$('#sheet-save-status');if(status)status.textContent='Salvo localmente · '+new Date(s.updatedAt).toLocaleTimeString('pt-BR');
    if(sheetSyncTimer)clearTimeout(sheetSyncTimer);sheetSyncTimer=setTimeout(()=>{if((s.tokenIds||[]).length)syncSheetToTokens(s,true);},700);
  };
  form.addEventListener('input',readForm);form.addEventListener('change',readForm);
  $('#save-sheet-now').addEventListener('click',()=>{readForm();persistSheets();});
  $('#sync-sheet-now').addEventListener('click',()=>{readForm();s.tokenIds=[...new Set([...(s.tokenIds||[]),...selectedTokenIds])];syncSheetToTokens(s);});
  $('#import-sheet-token').addEventListener('click',importSheetFromToken);
  $('#roll-initiative').addEventListener('click',()=>{readForm();const d20=rollDie(20),bonus=Number(s.initiative)||0;$('#initiative-result').textContent=`Iniciativa: d20 (${d20}) ${signed(bonus)} = ${d20+bonus}.`;});
  $('#long-rest-pp').addEventListener('click',()=>{readForm();s.moves=s.moves.map(m=>({...m,ppCurrent:Number(m.ppMax)||0,lastRoll:m.name?`${m.name}: PP recuperados para ${Number(m.ppMax)||0}.`:m.lastRoll}));persistSheets();renderSheetDetail();});
  $('#apply-damage').addEventListener('click',()=>adjustHP('damage'));
  $('#apply-heal').addEventListener('click',()=>adjustHP('heal'));
  form.querySelectorAll('[data-move-use]').forEach(btn=>btn.addEventListener('click',()=>{readForm();useMove(Number(btn.dataset.moveUse));}));
  form.querySelectorAll('[data-move-damage]').forEach(btn=>btn.addEventListener('click',()=>{readForm();rollMoveDamage(Number(btn.dataset.moveDamage));}));
  $('#delete-sheet').addEventListener('click',()=>{if(!confirm('Excluir esta ficha deste navegador? A cópia nos tokens vinculados não será removida automaticamente.'))return;sheets=sheets.filter(x=>x.id!==s.id);persistSheets();selected=null;renderSheetList();renderSheetDetail();});
}
function adjustHP(kind){
  if(!selected)return;const amount=Math.max(0,Number($('#hp-adjust-amount')?.value)||0);if(!amount){$('#hp-result').textContent='Informe uma quantidade maior que zero.';return;}
  const before=Number(selected.currentHP)||0;let applied=0;
  if(kind==='damage'){let remaining=amount;const temp=Math.max(0,Number(selected.tempHP)||0);const absorbed=Math.min(temp,remaining);selected.tempHP=temp-absorbed;remaining-=absorbed;const hpLoss=Math.min(before,remaining);selected.currentHP=Math.max(0,before-hpLoss);applied=amount-remaining+hpLoss;selected.fainted=selected.currentHP===0;}
  else{const max=Math.max(1,Number(selected.maxHP)||1);selected.currentHP=Math.min(max,before+amount);applied=selected.currentHP-before;if(selected.currentHP>0)selected.fainted=false;}
  selected.updatedAt=Date.now();persistSheets();const label=kind==='damage'?'Dano aplicado':'PV recuperados';const result=$('#hp-result');if(result)result.textContent=`${label}: ${applied}. PV ${selected.currentHP}/${selected.maxHP}; PV temporários ${selected.tempHP||0}${selected.fainted?' · DESMAIADO':''}.`;const current=$('[name="currentHP"]'),temp=$('[name="tempHP"]');if(current)current.value=selected.currentHP;if(temp)temp.value=selected.tempHP||0;const status=$('#sheet-save-status');if(status)status.textContent='PV atualizados e salvos.';if((selected.tokenIds||[]).length){if(sheetSyncTimer)clearTimeout(sheetSyncTimer);sheetSyncTimer=setTimeout(()=>syncSheetToTokens(selected,true),500);}
}
function updateMoveCalcs(form){
  if(!selected)return;
  for(let i=0;i<4;i++){
    const power=form.elements[`move-${i}-power`]?.value||'dex';
    const mod=modifier(selected.stats?.[power]??10),prof=Math.max(0,Number(selected.proficiency)||0);
    const type=form.elements[`move-${i}-type`]?.value||'';
    const stab=String(selected.types||'').split(/[,/]/).some(t=>t.trim().toLocaleLowerCase('pt-BR')===type.trim().toLocaleLowerCase('pt-BR'))?prof:0;
    const a=$(`#move-${i}-attack-bonus`),d=$(`#move-${i}-save-dc`),st=$(`#move-${i}-stab`);
    if(a)a.textContent=signed(mod+prof);if(d)d.textContent=String(8+mod+prof);if(st)st.textContent=signed(stab);
  }
}
function rollDie(sides){return Math.floor(Math.random()*sides)+1;}
function rollDiceExpression(expr){
  const raw=String(expr||'').replace(/\s+/g,'').toLowerCase();
  if(!raw)return {total:0,detail:'sem dados'};
  if(!/^[+-]?(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/.test(raw))throw new Error('Use uma fórmula válida, por exemplo 1d6 ou 2d8+2.');
  const tokens=raw.match(/[+-]?(?:\d*d\d+|\d+)/g)||[];let total=0;const parts=[];
  for(const token of tokens){const sign=token.startsWith('-')?-1:1;const t=token.replace(/^[+-]/,'');if(t.includes('d')){const [n0,s0]=t.split('d');const n=Number(n0||1),sides=Number(s0);if(n<1||n>100||sides<2||sides>1000)throw new Error('Limite de dados: 1–100 dados, lados entre 2 e 1000.');const rolls=Array.from({length:n},()=>rollDie(sides));const subtotal=rolls.reduce((a,b)=>a+b,0)*sign;total+=subtotal;parts.push(`${sign<0?'-':''}${n}d${sides} [${rolls.join(', ')}]`);}else{const value=Number(t)*sign;total+=value;parts.push(`${value>=0?'+ ': '- '}${Math.abs(value)}`);}}
  return {total,detail:parts.join(' ')};
}
function moveStats(move){const stat=move.movePower||'dex';const mod=modifier(selected?.stats?.[stat]??10);const prof=Math.max(0,Number(selected?.proficiency)||0);const stab=String(selected?.types||'').split(/[,/]/).some(t=>t.trim().toLocaleLowerCase('pt-BR')===String(move.type||'').trim().toLocaleLowerCase('pt-BR'))?Math.max(0,prof):0;return {stat,mod,prof,attack:mod+prof,dc:8+mod+prof,stab};}
function persistMoveResult(i,result){if(!selected)return;selected.moves[i].lastRoll=result;selected.updatedAt=Date.now();persistSheets();const el=$(`#move-${i}-result`);if(el)el.textContent=result;const status=$('#sheet-save-status');if(status)status.textContent='Rolagem registrada · '+new Date().toLocaleTimeString('pt-BR');if((selected.tokenIds||[]).length){if(sheetSyncTimer)clearTimeout(sheetSyncTimer);sheetSyncTimer=setTimeout(()=>syncSheetToTokens(selected,true),500);}}
function useMove(i){const m=selected?.moves?.[i];if(!m||!m.name.trim()){persistMoveResult(i,'Preencha o nome do golpe antes de usar.');return;}if(Number(m.ppCurrent)<=0){persistMoveResult(i,'Sem PP disponível. Descanse ou recupere PP antes de usar este golpe.');return;}m.ppCurrent=Math.max(0,Number(m.ppCurrent)-1);const st=moveStats(m);let result=`${m.name}: PP ${m.ppCurrent}/${m.ppMax}. `;if(m.rollType==='save')result+=`CD de resistência ${st.dc} (${m.movePower.toUpperCase()} ${signed(st.mod)} + proficiência ${signed(st.prof)}).`;else if(m.rollType==='attack'){const d20=rollDie(20),total=d20+st.attack;result+=`Ataque: d20 (${d20}) ${signed(st.attack)} = ${total}. ${d20===20?'20 natural!':d20===1?'1 natural!':'Compare com a CA do alvo.'}`;}else result+='Efeito sem rolagem de ataque; consulte a descrição do golpe.';persistMoveResult(i,result);const pp=$(`[name="move-${i}-ppcurrent"]`);if(pp)pp.value=m.ppCurrent;}
function rollMoveDamage(i){const m=selected?.moves?.[i];if(!m||!m.name.trim()){persistMoveResult(i,'Preencha o nome do golpe antes de rolar dano.');return;}try{const st=moveStats(m);const rolled=rollDiceExpression(m.damage);const moveBonus=m.usesMove?st.mod:0;const total=rolled.total+moveBonus+st.stab;const extras=[moveBonus?`MOVE ${signed(moveBonus)}`:'',st.stab?`STAB ${signed(st.stab)}`:''].filter(Boolean).join(' + ');persistMoveResult(i,`${m.name} — dano: ${rolled.detail} = ${rolled.total}${extras?' + '+extras:''} = ${total} de dano${m.type?' '+m.type:''}.`);}catch(e){persistMoveResult(i,e.message);}}
async function syncSheetToTokens(sheet,quiet=false){
  if(!obrReady){if(!quiet)$('#token-status').textContent='Owlbear não conectado; a ficha continua salva localmente.';return false;}
  const ids=[...new Set([...(sheet.tokenIds||[]),...selectedTokenIds])];if(!ids.length){if(!quiet)$('#token-status').textContent='Selecione um token no mapa para sincronizar.';return false;}
  sheet.tokenIds=ids;sheet.updatedAt=Date.now();persistSheets();
  try{await OBR.scene.items.updateItems(items=>items.map(item=>ids.includes(item.id)?({...item,metadata:{...(item.metadata||{}),[NS]:{nationalDex:sheet.speciesId,name:sheet.species, sheet5e:JSON.parse(JSON.stringify(sheet)),updatedAt:sheet.updatedAt}}}):item));if(!quiet)$('#token-status').textContent=`Ficha de ${sheet.nickname||sheet.species} sincronizada com ${ids.length} token(s).`;const st=$('#sheet-save-status');if(st)st.textContent='Salvo localmente e sincronizado com Owlbear.';return true;}
  catch(e){if(!quiet)$('#token-status').textContent=`Falha ao sincronizar: ${e.message||'verifique permissões'}`;return false;}
}
async function importSheetFromToken(){
  if(!obrReady||!selectedTokenIds.length){$('#token-status').textContent='Selecione um token que tenha uma ficha vinculada.';return;}
  try{const items=await OBR.scene.items.getItems();const item=items.find(x=>selectedTokenIds.includes(x.id)&&x.metadata?.[NS]?.sheet5e);const imported=item?.metadata?.[NS]?.sheet5e;if(!imported)throw new Error('Nenhum token selecionado possui ficha 5e.');const copy={...imported,id:imported.id||`sheet-import-${Date.now()}`,tokenIds:[...new Set([...(imported.tokenIds||[]),item.id])],updatedAt:Date.now()};const i=sheets.findIndex(x=>x.id===copy.id);if(i>=0)sheets[i]=copy;else sheets.unshift(copy);persistSheets();selected=copy;renderSheetList();renderSheetDetail();$('#token-status').textContent='Ficha importada dos metadados do token.';}
  catch(e){$('#token-status').textContent=`Não foi possível importar a ficha: ${e.message}`;}
}
function activeList(){return currentTab==='dex'?species:currentTab==='sheets'?sheets:(aux[currentTab]?.items||[]);}
function renderList(){
  if(currentTab==='sheets'){renderSheetList();return;}
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
      $('#detail-body').innerHTML=`<div class="statgrid">${rows.filter(r=>r[1]!==null&&r[1]!==undefined).map(r=>`<div class="stat"><b>${esc(r[0])}</b><span>${esc(typeof r[1]==='object'?r[1].name||JSON.stringify(r[1]):r[1])}</span></div>`).join('')}</div>${short?`<h3>Efeito</h3><p>${esc(short)}</p>`:''}${effect?`<p>${esc(effect)}</p>`:''}${flavor?`<h3>Descrição</h3><p>${esc(flavor)}</p>`:''}<p class="meta">Dados acima são do videogame Pokémon e vêm da PokéAPI; não são os valores de RPG de Pokémon 5e. <a href="https://poke5e.app/moves" target="_blank" rel="noreferrer">Abrir catálogo oficial de golpes Pokémon 5e</a>.</p>`;
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
  if(currentTab==='sheets'){renderSheetDetail();return;}
  if(!selected){$('#detail-title').textContent=currentTab==='dex'?'Selecione um Pokémon':(aux[currentTab]?.label||'Conteúdo');$('#detail-body').innerHTML='<p>Selecione um registro para ver os detalhes.</p>';$('#sheet-status').textContent='Ficha 5e: ainda não anexada.';return;}
  if(currentTab!=='dex'){renderAuxDetail(selected);return;}
  const p=selected;$('#detail-title').textContent=`#${dexNo(p)} ${cap(p.name)}`;$('#detail-body').innerHTML=`<div class="art-wrap"><img class="pokemon-art" src="${imageFor(p)}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='/assets/icon.svg'"><span class="art-caption">Ilustração oficial · PokéAPI</span></div><div class="notice">Carregando detalhes (limite de ${TIMEOUT_MS/1000}s)…</div>`;
  $('#sheet-status').textContent=sheetForSpecies(p.id)?'Ficha 5e salva.':`Ficha 5e ainda não criada · #${p.id}`;
  try{const d=await loadPokemon(p);if(selected!==p||currentTab!=='dex')return;
    $('#detail-body').innerHTML=`<div class="art-wrap"><img class="pokemon-art" src="${esc(d.image)}" alt="${esc(p.name)}" onerror="this.onerror=null;this.src='/assets/icon.svg'"><span class="art-caption">Ilustração oficial · PokéAPI</span></div><div><b>Número nacional:</b> #${d.id}</div><div style="margin-top:6px">${d.types.map(t=>`<span class="type">${esc(typeNames[t]||cap(t))}</span>`).join('')}</div><div class="statgrid"><div class="stat"><b>Altura</b><span>${d.heightM} m</span></div><div class="stat"><b>Peso</b><span>${d.weightKg} kg</span></div><div class="stat"><b>EXP base (jogo)</b><span>${d.baseExperience??'—'}</span></div><div class="stat"><b>Taxa de captura</b><span>${d.captureRate??'—'}</span></div></div><h3>Atributos-base (jogos oficiais)</h3><div class="statgrid">${d.stats.map(s=>`<div class="stat"><b>${esc(cap(s.name))}</b><span>${s.value}</span></div>`).join('')}</div><h3>Habilidades</h3><ul>${d.abilities.map(a=>`<li>${esc(cap(a.name))}${a.hidden?' (oculta)':''}</li>`).join('')||'<li>Não informadas</li>'}</ul><p><b>Geração:</b> ${esc(cap(d.generation))}</p><p>${d.isLegendary?'Lendário. ':''}${d.isMythical?'Mítico.':''}</p><div class="notice">Dados dos jogos Pokémon; não são atributos de ficha Pokémon 5e.</div><button type="button" class="primary sheet-create" id="create-sheet">Criar / abrir ficha Pokémon 5e</button>`;
    $('#create-sheet')?.addEventListener('click',createSheetFromSelected);
  }catch(e){if(selected===p)$('#detail-body').innerHTML=`<div class="notice">Falha ao carregar detalhes: ${esc(e.message)}</div><button id="retry-detail" class="secondary">Tentar novamente</button>`;$('#retry-detail')?.addEventListener('click',()=>{details.delete(p.id);renderDetail();});}
}
function updateLinkButton(){ $('#link-token').disabled=!(obrReady&&selected&&currentTab==='dex'&&selectedTokenIds.length); }
function setTab(tab){currentTab=tab;selected=null;page=0;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('#search').value='';$('#search').placeholder=tab==='dex'?'Pesquisar Pokémon pelo nome…':tab==='sheets'?'Pesquisar fichas…':'Pesquisar por nome…';$('#sort').value=tab==='dex'?'number':'az';$('#link-token').disabled=true;$('#detail-title').textContent=tab==='dex'?'Selecione um Pokémon':aux[tab]?.label||'Conteúdo';$('#detail-body').innerHTML='<p>Selecione um registro para ver os detalhes.</p>';if(tab==='dex')renderList();else if(aux[tab]?.endpoint)loadAuxiliary(tab);else {renderList();if(tab==='sheets')renderSheetDetail();else renderDetail();}}
async function updateSelection(){if(!obrReady){$('#token-status').textContent='Abra esta extensão dentro de uma sala Owlbear para usar ferramentas de token.';return;}try{selectedTokenIds=await OBR.player.getSelection();}catch(_){selectedTokenIds=[];}$('#token-status').textContent=selectedTokenIds.length?`${selectedTokenIds.length} token(s) selecionado(s).`:'Nenhum token selecionado.';updateLinkButton();}
async function linkSelected(){
  if(!obrReady||!selected||currentTab!=='dex'||!selectedTokenIds.length)return;
  const p=selected;
  try{let d=null;try{d=await loadPokemon(p)}catch(_){}let sheet=sheetForSpecies(p.id);if(!sheet){sheet=makeSheet(p,d);sheets.unshift(sheet);}sheet.tokenIds=[...new Set([...(sheet.tokenIds||[]),...selectedTokenIds])];persistSheets();await syncSheetToTokens(sheet);$('#token-status').textContent=`${cap(p.name)} vinculado com ficha Pokémon 5e a ${selectedTokenIds.length} token(s).`;$('#sheet-status').textContent='Ficha 5e criada e vinculada.';}
  catch(e){$('#token-status').textContent=`Não foi possível vincular: ${e.message||'verifique as permissões da extensão'}`;}
}
function handleSceneItemsChange(items){
  if(!Array.isArray(items))return;
  let changed=false;
  for(const item of items){
    if(!selectedTokenIds.includes(item.id))continue;
    const remote=item.metadata?.[NS]?.sheet5e;if(!remote?.id)continue;
    const idx=sheets.findIndex(x=>x.id===remote.id);
    if(idx<0){sheets.unshift({...remote,tokenIds:[...new Set([...(remote.tokenIds||[]),item.id])]});changed=true;continue;}
    if(Number(remote.updatedAt||0)>Number(sheets[idx].updatedAt||0)){
      sheets[idx]={...remote,tokenIds:[...new Set([...(remote.tokenIds||[]),item.id])]};
      if(currentTab==='sheets'&&selected?.id===remote.id)selected=sheets[idx];
      changed=true;
    }
  }
  if(changed){persistSheets();if(currentTab==='sheets'){renderSheetList();renderSheetDetail();}$('#token-status').textContent='Ficha sincronizada a partir das alterações do token.';}
}
function wireUI(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));$('#search').addEventListener('input',()=>{page=0;renderList();});$('#sort').addEventListener('change',()=>{page=0;renderList();});$('#refresh-token').addEventListener('click',updateSelection);$('#link-token').addEventListener('click',linkSelected);}
async function initDex(force=false){setConnection('Carregando Pokédex','loading');message('Carregando catálogo nacional…');try{await loadSpeciesList(force);setConnection('Pokédex pronta','ok');$('#token-status').textContent=`${species.length.toLocaleString('pt-BR')} Pokémon indexados. ${sheets.length} ficha(s) 5e salvas neste navegador.`;renderList();}catch(e){setConnection('Falha de conexão','error');message(`Não foi possível carregar a Pokédex: ${e.message}`,true);}}
async function main(){wireUI();await initDex();try{const sdk=await Promise.race([import('https://esm.sh/@owlbear-rodeo/sdk@1.5.2'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo limite ao carregar o SDK do Owlbear')),8000))]);OBR=sdk.default||sdk;OBR.onReady(async()=>{obrReady=true;setConnection('Owlbear conectado','ok');await updateSelection();try{OBR.player.onChange(updateSelection);}catch(_){}try{OBR.scene.items.onChange(handleSceneItemsChange);}catch(_){}});}catch(e){setConnection(species.length?'Modo catálogo':'Aguardando conexão','');$('#token-status').textContent='Pokédex independente disponível. Integração com tokens indisponível: SDK do Owlbear não carregou.';}}
main();
