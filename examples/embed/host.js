import { MODEL_CATALOG } from '../../src/explorer/model-catalog.js';
import { PROJECT_CONFIG } from '../../src/generated/project.js';
import { createExplorerClient } from '../../src/explorer/embed-client.js';
import { bindHostLifecycle, revealMobileViewer } from './lifecycle.js';

// This consumer knows model IDs, not scene objects, Three.js or iframe selectors.
const $=id=>document.getElementById(id);
const names=Object.fromEntries(Object.values(MODEL_CATALOG).map(model=>[model.id,model.title]));
$('model').replaceChildren(...Object.values(MODEL_CATALOG).map(model=>{const option=document.createElement('option');option.value=model.id;option.textContent=model.title;return option;}));
$('model').value=PROJECT_CONFIG.defaultModel;
$('host-brand').textContent=PROJECT_CONFIG.brand.name+' / '+PROJECT_CONFIG.brand.product;
document.title=PROJECT_CONFIG.title+' · Independent host';
const requested=new URLSearchParams(location.search).get('explorer');
const explorerURL=new URL(requested||'../../',location.href);
if(!['http:','https:'].includes(explorerURL.protocol))throw new Error('Explorer URL must use HTTP or HTTPS.');
let client=null,iframe=null,mountVersion=0,actionVersion=0,state=null,capabilities=null,tourId=null,rootId=null,initialized=false;
const nodes=new Map();
const requestedNames=new Set();
const human=value=>String(value||'').replaceAll('-',' ').replaceAll('_',' ');
const clock=seconds=>`${Math.floor((seconds||0)/60)}:${String(Math.floor((seconds||0)%60)).padStart(2,'0')}`;
$('transport-details').textContent=`Host: ${location.origin} · Explorer: ${explorerURL.origin}`;

function log(event){
  const item=document.createElement('li');
  item.textContent=`${new Date().toLocaleTimeString()} · ${event.type}${event.requestId?` · ${event.requestId}`:''}${event.payload?.status?` · ${event.payload.status}`:''}`;
  $('event-log').prepend(item);while($('event-log').children.length>40)$('event-log').lastElementChild.remove();
}
function setMessage(message,kind='notice'){$('action-message').textContent=message;$('action-message').dataset.kind=kind;}
function showError(error){setMessage(error.message||'The action could not be completed.','error');}
async function invoke(method,params={},connection=client){
  if(!connection)throw new Error('Connect the Explorer first.');
  const event=await connection.request(method,params);
  if(event.payload.status==='failed')throw Object.assign(new Error(event.payload.error.message),{code:event.payload.error.code});
  if(event.payload.status==='cancelled')throw new Error('The view changed before this action completed.');
  return event.payload.result;
}
async function present(method,params={},connection=client){
  await revealMobileViewer({window,viewer:document.querySelector('.viewer'),onReveal:()=>setMessage('Showing this view in the Explorer.')});
  if(connection!==client)throw new Error('The Explorer changed before this action could complete.');
  return invoke(method,params,connection);
}
function action(work){return async()=>{
  const version=++actionVersion;setMessage('');
  try{await work();if(version===actionVersion&&$('action-message').dataset.kind==='error')setMessage('');}
  catch(error){if(version===actionVersion)showError(error);}
};}
function draw(next){
  if(!next||!next.lifecycle)return;
  state=next;
  if(names[state.model?.id]){
    $('model').value=state.model.id;
    if(iframe)iframe.title=`${names[state.model.id]} · Interactive Explorer`;
    const standalone=new URL(explorerURL);standalone.searchParams.set('model',state.model.id);standalone.searchParams.delete('embed');standalone.searchParams.delete('parentOrigin');$('open-explorer').href=standalone.href;
  }
  $('connection-status').textContent=state.lifecycle==='ready'?'Connected · Ready to explore':state.lifecycle==='error'?'The model could not load':`Connected · ${human(state.lifecycle)}`;
  $('model-controls').disabled=state.lifecycle!=='ready';
  const presentation=state.presentation||{},tour=state.tour||{},navigation=state.navigation||{};
  if(state.lifecycle==='ready'&&navigation.selectedId&&!nodes.has(navigation.selectedId)&&!requestedNames.has(navigation.selectedId)&&client){
    const connection=client,nodeId=navigation.selectedId;requestedNames.add(nodeId);
    invoke('getNode',{nodeId},connection).then(node=>{if(client===connection){nodes.set(node.id,node);draw(state);}}).catch(()=>{}).finally(()=>requestedNames.delete(nodeId));
  }
  for(const button of document.querySelectorAll('[data-render]'))button.setAttribute('aria-pressed',String(button.dataset.render===presentation.renderStyle));
  if(document.activeElement!==$('explosion'))$('explosion').value=Math.round((presentation.explosion||0)*100);
  $('explosion-value').textContent=`${Math.round((presentation.explosion||0)*100)}%`;
  if([...$('component').options].some(option=>option.value===navigation.selectedId))$('component').value=navigation.selectedId;
  const component=nodes.get(navigation.selectedId)?.title||human(navigation.selectedId)||'Whole model';
  const touring=tour.active;
  $('tour-start').hidden=touring||capabilities?.tours?.enabled===false;$('tour-playback').hidden=!touring;
  $('tour-toggle').textContent=tour.status==='playing'?'Pause tour':tour.status==='completed'?'Replay tour':'Resume tour';
  $('tour-time').textContent=`${clock(tour.time)}${tour.duration?` / ${clock(tour.duration)}`:''}`;
  if(tour.chapterId)$('chapter').value=tour.chapterId;
  $('actual-state').textContent=state.lifecycle==='ready'?`${component} · ${human(presentation.renderStyle)}${presentation.explosion>0?` · ${Math.round(presentation.explosion*100)}% exploded`:''}${touring?` · Tour ${tour.status}`:''}`:'Loading the model and its available controls.';
}
async function listComponents(nodeId,connection=client){
  const children=await invoke('getChildren',{nodeId},connection);
  if(client!==connection)return;
  const list=Array.isArray(children)?children:children.children;
  const selected=await invoke('getNode',{nodeId},connection);
  if(client!==connection)return;
  nodes.set(selected.id,selected);
  const options=[selected,...(list||[])];
  $('component').replaceChildren(...options.map(node=>{nodes.set(node.id,node);const option=document.createElement('option');option.value=node.id;option.textContent=node.label||node.title||human(node.id);return option;}));
  $('component').value=nodeId;
}
async function hydrate(connection){
  if(initialized||client!==connection)return;initialized=true;
  try{
    const available=await invoke('getCapabilities',{},connection);if(client!==connection)return;capabilities=available;
    for(const button of document.querySelectorAll('[data-render]'))button.hidden=!capabilities.renderStyles.enabled.includes(button.dataset.render);
    const showExplosion=capabilities.modes.enabled.includes('explode');$('explosion').hidden=!showExplosion;document.querySelector('label[for="explosion"]').hidden=!showExplosion;
    $('tour-section').hidden=!capabilities.tours.enabled;

    rootId=state.navigation.scopeId;
    await listComponents(rootId,connection);
    if(client!==connection)return;
    const tour=capabilities.tours?.items?.[0];tourId=tour?.id||null;
    $('tour-start').disabled=!tourId;$('chapter').disabled=!tourId;
    if(tourId){
      const description=await invoke('getTour',{tourId},connection);if(client!==connection)return;
      const prompt=document.createElement('option');prompt.value='';prompt.textContent='Choose a chapter';
      $('chapter').replaceChildren(prompt,...description.chapters.map(chapter=>{const option=document.createElement('option');option.value=chapter.id;option.textContent=chapter.label||chapter.title;return option;}));
    }
    const current=await invoke('getState',{},connection);if(client===connection)draw(current);
  }catch(error){if(client===connection){initialized=false;showError(error);}}
}
function receive(event,connection){
  if(client!==connection)return;log(event);
  if(['stateChanged','ready','helloAck'].includes(event.type)){
    draw(event.payload?.state||event.payload);
    if(state?.lifecycle==='ready')void hydrate(connection);
  }
  if(event.type==='takeover')setMessage('You have control. Resume the tour whenever you are ready.');
  if(event.type==='error')showError(event.payload?.error||event.payload||{});
}
async function disconnect(){
  const previous=client,previousFrame=iframe;client=null;iframe=null;
  $('model-controls').disabled=true;initialized=false;state=null;capabilities=null;tourId=null;nodes.clear();requestedNames.clear();
  if(previous){try{await previous.request('dispose',{}, {timeoutMs:1500});}catch{/* Removing the frame is the final disposal boundary. */}finally{previous.close();}}
  previousFrame?.remove();
  if(!client&&!iframe){$('viewer-empty').hidden=false;$('connection-status').textContent='Disconnected';$('actual-state').textContent='The Explorer has been released.';}
}
async function mount({reveal=false}={}){
  const version=++mountVersion;const model=$('model').value;
  await disconnect();if(version!==mountVersion)return;
  $('viewer-empty').hidden=true;$('connection-status').textContent='Connecting…';setMessage('');
  const url=new URL(explorerURL);url.searchParams.set('model',model);url.searchParams.set('embed','1');url.searchParams.set('parentOrigin',location.origin);
  const standalone=new URL(url);standalone.searchParams.delete('embed');standalone.searchParams.delete('parentOrigin');$('open-explorer').href=standalone.href;
  iframe=document.createElement('iframe');iframe.title=`${names[model]} · Interactive Explorer`;iframe.allow='fullscreen';iframe.src=url.href;
  const frame=iframe;
  iframe.addEventListener('load',()=>{
    if(frame!==iframe||version!==mountVersion)return;
    client?.close();initialized=false;nodes.clear();
    const connection=createExplorerClient({iframe:frame,origin:url.origin});client=connection;
    connection.subscribe(event=>receive(event,connection));
    connection.ready.then(payload=>{if(client!==connection)return;draw(payload.state);if(state?.lifecycle==='ready')void hydrate(connection);}).catch(error=>{if(client===connection)showError(error);});
  });
  $('viewer-mount').replaceChildren(iframe);
  if(reveal)await revealMobileViewer({window,viewer:document.querySelector('.viewer')});
}
$('model').addEventListener('change',action(()=>mount({reveal:true})));
$('remount').addEventListener('click',action(()=>mount({reveal:true})));$('empty-remount').addEventListener('click',action(()=>mount({reveal:true})));
$('destroy').addEventListener('click',action(async()=>{++mountVersion;await disconnect();}));
$('component').addEventListener('change',action(()=>present('select',{nodeId:$('component').value})));
$('focus-component').addEventListener('click',action(async()=>{const nodeId=$('component').value;await present('focus',{nodeId});const children=await invoke('getChildren',{nodeId});if((Array.isArray(children)?children:children.children)?.length)await listComponents(nodeId);}));
$('root-component').addEventListener('click',action(async()=>{await present('focus',{nodeId:rootId});await listComponents(rootId);}));
for(const button of document.querySelectorAll('[data-render]'))button.addEventListener('click',action(()=>present('setRenderStyle',{style:button.dataset.render})));
$('explosion').addEventListener('input',()=>{$('explosion-value').textContent=`${$('explosion').value}%`;});
$('explosion').addEventListener('change',action(()=>present('setExplosion',{progress:Number($('explosion').value)/100})));
$('tour-start').addEventListener('click',action(()=>present('startTour',{tourId})));
$('tour-toggle').addEventListener('click',action(async()=>{
  const connection=client;
  if(state.tour.status==='completed'){await present('seekTour',{seconds:0},connection);await present('resumeTour',{},connection);}
  else await present(state.tour.status==='playing'?'pauseTour':'resumeTour',{},connection);
}));
$('tour-exit').addEventListener('click',action(()=>present('exitTour',{restore:true})));
$('chapter').addEventListener('change',action(async()=>{
  // Preparation emits state updates that can repaint this select. Retain the
  // visitor's chosen chapter before awaiting the shared player's preparation.
  const chapterId=$('chapter').value,connection=client;
  if(!chapterId)return;
  if(!state.tour.active)await present('startTour',{tourId},connection);
  await present('goToTourChapter',{chapterId},connection);
}));
$('capture-view').addEventListener('click',action(async()=>{$('bookmark').value=JSON.stringify(await invoke('captureView'),null,2);$('restore-view').disabled=false;setMessage('View captured. It remains on this page until you close it.','success');}));
$('bookmark').addEventListener('input',()=>{$('restore-view').disabled=!$('bookmark').value.trim();});
$('restore-view').addEventListener('click',action(async()=>{let bookmark;try{bookmark=JSON.parse($('bookmark').value);}catch{throw new Error('The view bookmark must be valid JSON.');}await present('restoreView',{bookmark});}));
bindHostLifecycle({window,getClient:()=>client});
void mount();
