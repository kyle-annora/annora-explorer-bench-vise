import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DampedMotion } from '../../src/explorer/motion.js';
globalThis.window={matchMedia:()=>({matches:false})};
const {AssemblyScene}=await import('../../src/explorer/scene.js');

function fixture(){
  const scene=Object.create(AssemblyScene.prototype),surface=new THREE.Scene();
  Object.assign(scene,{renderStyle:'engineering',technical:false,scopeId:'root',rootId:'root',selectedId:'root',model:{},scene:surface,
    meshes:new Map(),edges:new Map(),active:[],contextMeshes:[],nodes:new Map([['root',{id:'root',meshNames:['A','B']}],['drive',{id:'drive',meshNames:['A']}],['frame',{id:'frame',meshNames:['B']}]]),
    surfacePass:{enabled:true},outputPass:{enabled:true},outline:{enabled:true,selectedObjects:[]},fxaa:{enabled:true},copyPass:{enabled:false},ao:{enabled:true},grid:{visible:true},
    effectiveQuality:'balanced',quality:'balanced',adaptive:{reset(){}},loadMetrics:{},mount:{dataset:{},clientWidth:1000,clientHeight:700},callbacks:{},benchmark:{active:false},
    camera:new THREE.PerspectiveCamera(15,10/7,.05,150),controls:{target:new THREE.Vector3(.3,.2,.1)},offsetX:45,offsetY:-30,
    fraction:.42,explosionTarget:.7,separationMotion:new DampedMotion([.42]),lineRuntime:{pass:{enabled:false},stats:{lineBatchCount:2},sync(state){this.last={...state,active:new Set(state.active),context:new Set(state.context),highlighted:new Set(state.highlighted),filled:new Set(state.filled),perPartAlpha:new Map(state.perPartAlpha)};},resize(){}},
    invalidate(){},resizeDrawingBuffer(){this.bufferResizes=(this.bufferResizes||0)+1;},fit(){throw new Error('Appearance must preserve the camera');},refitLayout(){throw new Error('Quality must preserve the camera');}});
  scene.camera.position.set(3,2,12);scene.camera.setViewOffset(1000,700,45,-30,1000,700);
  for(const name of ['A','B']){
    const material=new THREE.MeshStandardMaterial({color:'#b8bec7',metalness:.6,roughness:.4}),mesh=new THREE.Mesh(new THREE.BoxGeometry(),material);mesh.name=name;
    mesh.userData={color:material.color.clone(),metalness:.6,roughness:.4,visibility:new DampedMotion([1])};surface.add(mesh);scene.meshes.set(name,mesh);scene.active.push(mesh);
  }
  scene.syncEdges();return scene;
}
const view=scene=>JSON.stringify([scene.camera.position,scene.controls.target,scene.camera.projectionMatrix.toArray(),scene.offsetX,scene.offsetY,scene.selectedId,scene.scopeId,scene.fraction,scene.explosionTarget]);

test('three render styles preserve the exact view and switch to a bounded batched pipeline',async()=>{
  const scene=fixture();scene.selectedId='drive';const before=view(scene);
  for(const style of ['linework','flat','engineering']){
    assert.equal(await scene.setRenderStyle(style),true);assert.equal(view(scene),before);
    const engineering=style==='engineering';
    for(const pass of [scene.surfacePass,scene.outputPass,scene.outline,scene.fxaa])assert.equal(pass.enabled,engineering);
    assert.equal(scene.copyPass.enabled,!engineering);assert.equal(scene.lineRuntime.pass.enabled,!engineering);assert.equal(scene.technical,!engineering);
    for(const mesh of scene.meshes.values()){assert.equal(mesh.material.isMeshStandardMaterial,true);assert.equal(mesh.material.metalness,.6);assert.equal(mesh.material.color.getHexString(),'b8bec7');}
  }
  assert.equal(await scene.setTechnical(true),true);assert.equal(scene.renderStyle,'linework');
  assert.equal(await scene.setTechnical(false),true);assert.equal(scene.renderStyle,'engineering');
  assert.equal(await scene.setRenderStyle('unsupported'),false);assert.equal(view(scene),before);
});

test('failed or superseded line preparation cannot replace a working engineering view',async()=>{
  const scene=fixture();scene.lineRuntime=null;const before=view(scene);
  scene.prepareEdges=async()=>{throw new Error('Prepared asset unavailable');};
  await assert.rejects(scene.setRenderStyle('flat'),/Prepared asset unavailable/);
  assert.equal(scene.renderStyle,'engineering');assert.equal(scene.surfacePass.enabled,true);assert.equal(view(scene),before);
  let ready;scene.prepareEdges=()=>new Promise(resolve=>{ready=resolve;});
  const pending=scene.setRenderStyle('linework');await scene.setRenderStyle('engineering');ready();
  assert.equal(await pending,false);assert.equal(scene.renderStyle,'engineering');assert.equal(view(scene),before);
});

test('flat emphasis follows manual selection or explicit tour highlights without coloring parent context',async()=>{
  const scene=fixture(),a=scene.meshes.get('A'),b=scene.meshes.get('B');
  scene.active=[a];scene.contextMeshes=[b];b.userData.visibility.to([.06],true);scene.selectedId='drive';scene.outline.selectedObjects=[a,b];
  await scene.setRenderStyle('flat');scene.syncLinePresentation();let state=scene.lineRuntime.last;
  assert.deepEqual([...state.active],['A']);assert.deepEqual([...state.context],['B']);assert.deepEqual([...state.filled],['A']);assert.deepEqual([...state.highlighted],['A']);
  assert.equal(state.perPartAlpha.get('B'),.06);assert.equal(state.worldMatricesUpdated,true);
  scene.tourFrame={highlightIds:[]};scene.syncLinePresentation();assert.equal(scene.lineRuntime.last.filled.size,0,'empty tour highlights do not inherit selected scope');
  scene.tourFrame={highlightIds:['frame','drive']};scene.syncLinePresentation();assert.deepEqual([...scene.lineRuntime.last.filled],['A']);
  scene.contextMeshes=[];scene.syncLinePresentation();assert.equal(scene.lineRuntime.last.context.size,0,'isolation removes parent context');
});

test('line batches receive current source-motion transforms without modifying them',async()=>{
  const scene=fixture(),mesh=scene.meshes.get('A');await scene.setRenderStyle('linework');
  mesh.position.set(1,2,3);mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1),.7);mesh.scale.set(2,1,.5);
  mesh.updateMatrix();const expected=mesh.matrix.toArray();scene.syncLinePresentation();
  assert.deepEqual(mesh.matrixWorld.toArray(),expected);assert.deepEqual(mesh.matrix.toArray(),expected);
  const prior=scene.lineRuntime.last;await scene.setRenderStyle('engineering');scene.syncLinePresentation();assert.equal(scene.lineRuntime.last,prior);
});

test('manual operation fills its current stage while explicit selection and tour authorship take precedence',async()=>{
  const scene=fixture();await scene.setRenderStyle('flat');scene.mode='operate';
  let nodeId='drive';scene.operationPlayer={state:()=>({stage:{nodeId}})};
  scene.syncLinePresentation();assert.deepEqual([...scene.lineRuntime.last.filled],['A']);
  nodeId='frame';scene.syncLinePresentation();assert.deepEqual([...scene.lineRuntime.last.filled],['B']);
  scene.selectedId='drive';scene.syncLinePresentation();assert.deepEqual([...scene.lineRuntime.last.filled],['A']);
  scene.tourFrame={highlightIds:[]};scene.syncLinePresentation();assert.equal(scene.lineRuntime.last.filled.size,0);
  scene.tourFrame={highlightIds:['frame']};scene.syncLinePresentation();assert.deepEqual([...scene.lineRuntime.last.filled],['B']);
});

test('bounded HiDPI and quality changes resize buffers without changing projection or pose',async()=>{
  const scene=fixture();await scene.setRenderStyle('flat');const before=view(scene);let ratio=0;
  scene.renderer={setPixelRatio:value=>{ratio=value;},setSize(){}};scene.composer={setPixelRatio(){},setSize(){}};
  scene.ao.setSize=()=>{};scene.outline.setSize=()=>{};scene.fxaa.material={uniforms:{resolution:{value:new THREE.Vector2()}}};
  const previous=globalThis.devicePixelRatio;globalThis.devicePixelRatio=2;
  try{AssemblyScene.prototype.resizeDrawingBuffer.call(scene);}finally{globalThis.devicePixelRatio=previous;}
  assert.ok(ratio>1.25&&ratio<=2);assert.ok(1000*700*ratio*ratio<=2_000_001);assert.equal(view(scene),before);
  scene.setQuality('performance');assert.equal(view(scene),before);assert.equal(scene.effectiveQuality,'performance');
});
