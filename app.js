import OBR from 'https://esm.sh/@owlbear-rodeo/sdk@1.5.2';
const $ = s => document.querySelector(s);
const DATA_URL = './data/catalog.json';
const NS = 'com.openai.pokemon5e-companion';
const packTabs = {dex:'pokedex_bestiary',moves:'pokemon_moves',items:'items_and_consumables',features:'pokemon_features',trainers:'trainers',rules:'rules'};
const labels = {pokedex_bestiary:'Pokédex / Pokémon',pokemon_moves:'Golpe',items_and_consumables:'Item',pokemon_features:'Característica',trainers:'Treinador',rules:'Regra'};
let catalog={}, currentTab='dex', filtered=[], selected=null, obrReady=false, selectedTokenIds=[];
const safe = v => String(v ?? '—');
const escapeHtml = s => safe(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function listForTab(){return catalog[packTabs[currentTab]]||[]}
function titleFor(o){return o.name||'Registro sem nome'}
function kindFor(o){return o._partial?'Registro de catálogo (dados parciais)':(o.type||o.system?.type?.value||labels[o._sourcePack]||'Registro')}
function render(){
 const q=$('#search').value.trim().toLocaleLowerCase('pt-BR');
 filtered=listForTab().filter(o=>titleFor(o).toLocaleLowerCase('pt-BR').includes(q));
 filtered.sort((a,b)=>titleFor(a).localeCompare(titleFor(b),'pt-BR')); if($('#sort').value==='za') filtered.reverse();
 $('#count').textContent=`${filtered.length.toLocaleString('pt-BR')} registros`;
 const view=filtered.slice(0,500);
 $('#results').innerHTML=view.length?view.map((o,i)=>`<button class="record ${selected===o?'selected':''}" data-index="${i}"><span class="name">${escapeHtml(titleFor(o))}</span><span class="meta">${escapeHtml(kindFor(o))}</span>${o._partial?'<span class="tag">ÍNDICE PARCIAL</span>':''}</button>`).join(''):'<div class="empty">Nenhum resultado encontrado.</div>';
 $('#results').querySelectorAll('.record').forEach(btn=>btn.addEventListener('click',()=>{selected=view[Number(btn.dataset.index)];render();renderDetail();$('#link-token').disabled=!obrReady||!selected||!selectedTokenIds.length}));
}
function renderDetail(){
 if(!selected){$('#detail-title').textContent='Selecione um registro';$('#detail-body').innerHTML='<p>Pesquise o catálogo e selecione um registro para ver os dados disponíveis.</p>';return}
 $('#detail-title').textContent=titleFor(selected);
 const isPartial=selected._partial;
 let stats='';
 const sys=selected.system||{}; const hp=sys.attributes?.hp||sys.hp||{}; const abilities=sys.abilities||{};
 const statItems=[['Tipo',sys.details?.type||sys.type?.value||selected.type],['Nível',sys.details?.level],['CA',sys.attributes?.ac?.value||sys.attributes?.ac],['PV',hp.value??hp.max],['Velocidade',sys.attributes?.movement?.walk],['Tamanho',sys.traits?.size]];
 for(const [k,v] of statItems){if(v!==undefined&&v!==null&&v!=='')stats+=`<div class="stat"><b>${escapeHtml(k)}</b><span>${escapeHtml(typeof v==='object'?JSON.stringify(v):v)}</span></div>`}
 let desc=selected.system?.description?.value||selected.system?.description||selected.text?.content||selected.content||'';
 if(typeof desc==='object')desc=JSON.stringify(desc);
 const overview=Object.entries(selected).filter(([k,v])=>!['_id','name','img','folder','system','effects','ownership','flags','sort','_stats','_partial','_sourcePack'].includes(k)&&typeof v!=='object').slice(0,12);
 let extra=overview.map(([k,v])=>`<p><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</p>`).join('');
 $('#detail-body').innerHTML=(isPartial?'<div class="notice">Este nome foi recuperado do banco LevelDB do Foundry, mas o registro completo não pôde ser decodificado automaticamente. O conteúdo detalhado ainda precisa ser importado.</div>':'')+(stats?`<div class="statgrid">${stats}</div>`:'')+(desc?`<p>${escapeHtml(String(desc).replace(/<[^>]*>/g,' ').slice(0,3000))}</p>`:'')+extra+(!stats&&!desc&&!extra?'<p>Não há campos detalhados recuperados para este registro.</p>':'');
}
async function updateSelection(){
 if(!obrReady)return;
 try{selectedTokenIds=await OBR.player.getSelection();}catch(e){selectedTokenIds=[]}
 $('#token-status').textContent=selectedTokenIds.length?`${selectedTokenIds.length} token(s) selecionado(s).`:'Nenhum token selecionado no mapa.';
 $('#link-token').disabled=!selected||!selectedTokenIds.length;
}
async function linkToToken(){
 if(!obrReady||!selected||!selectedTokenIds.length)return;
 try{
  await OBR.scene.items.updateItems(items=>items.map(item=>selectedTokenIds.includes(item.id)?({...item,metadata:{...(item.metadata||{}),[NS]:{name:titleFor(selected),pack:packTabs[currentTab],record:selected,linkedAt:new Date().toISOString()}}}):item));
  $('#token-status').textContent=`Vinculado “${titleFor(selected)}” a ${selectedTokenIds.length} token(s).`;
 }catch(err){$('#token-status').textContent='Não foi possível atualizar o token. Verifique permissões da extensão e tente novamente.';console.error(err)}
}
function tabs(){document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{currentTab=btn.dataset.tab;selected=null;document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b===btn));render();renderDetail();$('#link-token').disabled=true;}))}
async function main(){
 $('#results').innerHTML='<div class="empty">Carregando catálogo…</div>';
 try{const response=await fetch(DATA_URL);if(!response.ok)throw new Error('catalog fetch failed');catalog=await response.json();}
 catch(e){$('#results').innerHTML='<div class="empty">Não foi possível carregar data/catalog.json. Confirme que todos os arquivos da extensão foram hospedados juntos.</div>';return}
 const total=Object.values(catalog).reduce((n,a)=>n+a.length,0); const complete=Object.values(catalog).flat().filter(o=>!o._partial).length;
 $('#connection').textContent='Catálogo carregado';$('#token-status').textContent=`${total.toLocaleString('pt-BR')} registros indexados; ${complete.toLocaleString('pt-BR')} registros completos recuperados.`;
 tabs();$('#search').addEventListener('input',render);$('#sort').addEventListener('change',render);$('#refresh-token').addEventListener('click',updateSelection);$('#link-token').addEventListener('click',linkToToken);render();
 try{await OBR.onReady(async()=>{obrReady=true;$('#connection').textContent='Owlbear conectado';await updateSelection();OBR.player.onChange(updateSelection);});}
 catch(e){$('#connection').textContent='Modo catálogo';$('#token-status').textContent='O catálogo funciona fora do Owlbear; ferramentas de token exigem que a extensão seja aberta no Owlbear Rodeo.'}
}
main();
