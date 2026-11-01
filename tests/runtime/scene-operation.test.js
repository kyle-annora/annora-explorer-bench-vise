import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OperationPlayer, SourceAnimationPose } from '../../src/explorer/operation-player.js';
import { DampedMotion } from '../../src/explorer/motion.js';
import { buildHierarchy, createOffsets } from '../../src/explorer/model-state.js';
globalThis.window={matchMedia:()=>({matches:false})};
const { AssemblyScene }=await import('../../src/explorer/scene.js');

function fixture(){
  const source=new THREE.Group(),pivot=new THREE.Group();pivot.name='Pivot';source.add(pivot);
  const geometry=new THREE.BoxGeometry(1,.5,.3),sourceA=new THREE.Mesh(geometry),sourceB=new THREE.Mesh(geometry);sourceA.name='A';sourceB.name='B';sourceA.position.x=1;sourceB.position.x=-1;pivot.add(sourceA);source.add(sourceB);source.updateMatrixWorld(true);geometry.computeBoundingBox();
  const parts=[{id:'a',meshName:'A',group:'drive',center:[1,0,0],explode:[1,0,0]},{id:'b',meshName:'B',group:'frame',center:[-1,0,0],explode:[-1,0,0]}];
  const metadata={root:{id:'root'},parts,groups:[{id:'drive',meshNames:['A']},{id:'frame',meshNames:['B']}]},hierarchy=buildHierarchy(metadata);
  const turn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI);
  const clip=new THREE.AnimationClip('Cycle',2,[new THREE.QuaternionKeyframeTrack('Pivot.quaternion',[0,2],[0,0,0,1,...turn.toArray()])]);
  const scene=Object.create(AssemblyScene.prototype);
  Object.assign(scene,{model:{id:'fixture'},rootId:'root',scopeId:'root',selectedId:'root',metadata,nodes:hierarchy.nodes,mode:'explore',isolated:false,scale:1,meshes:new Map(),edges:new Map(),active:[],contextMeshes:[],movingMeshes:new Set(),scopeViews:new Map(),separationMotion:new DampedMotion([0]),explosionTarget:0,fraction:0,callbacks:{},benchmark:{active:false},outline:{selectedObjects:[]},controls:{target:new THREE.Vector3(),enableDamping:true},camera:{position:new THREE.Vector3(0,0,10)},defaultDirection:new THREE.Vector3(0,0,1),operationConfig:{},followCamera:false,operationPlayer:new OperationPlayer({duration:2}),operationSampler:new SourceAnimationPose(source,clip),invalidate(){},fit(){},syncEdges(){}});
  for(const original of [sourceA,sourceB]){
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.name=original.name;original.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);
    mesh.userData={source:original,base:mesh.position.toArray(),baseQuaternion:mesh.quaternion.clone(),baseScale:mesh.scale.clone(),pose:new DampedMotion(mesh.position.toArray()),visibility:new DampedMotion([1]),fitCorners:[]};
    const line=new THREE.Object3D();line.position.copy(mesh.position);line.quaternion.copy(mesh.quaternion);line.scale.copy(mesh.scale);scene.meshes.set(mesh.name,mesh);scene.edges.set(mesh.name,line);
  }
  scene.active=[...scene.meshes.values()];scene.offsets=createOffsets(parts,scene.nodes,'root',1);return scene;
}
function settle(scene){for(let i=0;i<200&&scene.transformTransition;i++)scene.stepTransformTransition(1/60);assert.equal(scene.transformTransition,null);}
function matrices(scene){return [...scene.meshes].map(([name,mesh])=>{mesh.updateMatrix();return [name,mesh.matrix.toArray()];});}
function nearArray(actual,expected){assert.equal(actual.length,expected.length);actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-7,`${value} != ${expected[index]}`));}

test('operating pose, technical edge transforms and interrupted restore preserve the immutable assembly',()=>{
  const scene=fixture(),rest=matrices(scene);scene.setMode('operate');assert.equal(scene.getOperationState().playing,false);settle(scene);
  scene.setPlaybackProgress(.5);const operated=matrices(scene);assert.notDeepEqual(operated,rest);
  for(const [name,mesh]of scene.meshes){const line=scene.edges.get(name);line.updateMatrix();nearArray(line.matrix.toArray(),mesh.matrix.toArray());}
  scene.setMode('explode');nearArray(matrices(scene)[0][1],operated[0][1]);scene.stepTransformTransition(.12);
  const interrupted=matrices(scene);scene.setMode('explore');nearArray(matrices(scene)[0][1],interrupted[0][1]);settle(scene);
  matrices(scene).forEach(([name,matrix],index)=>nearArray(matrix,rest[index][1]));
  scene.setMode('operate');settle(scene);scene.setPlaybackProgress(.5);matrices(scene).forEach(([name,matrix],index)=>nearArray(matrix,operated[index][1]));
});

test('selecting while paused preserves operation, while explicit inspection restores a scoped assembly',()=>{
  const scene=fixture();scene.setMode('operate');settle(scene);scene.setPlaybackProgress(.25);const before=matrices(scene);
  scene.setSelected('drive');assert.equal(scene.scopeId,'root');assert.equal(scene.mode,'operate');assert.deepEqual(matrices(scene),before);assert.equal(scene.outline.selectedObjects[0].name,'A');
  scene.highlight('frame');assert.equal(scene.outline.selectedObjects[0].name,'B');scene.hideHover();assert.equal(scene.outline.selectedObjects[0].name,'A');
  scene.setScope('drive');assert.equal(scene.mode,'explore');assert.equal(scene.operationPlayer.playing,false);settle(scene);
  assert.deepEqual(scene.active.map(mesh=>mesh.name),['A']);assert.deepEqual(scene.contextMeshes.map(mesh=>mesh.name),['B']);
  assert.equal(scene.meshes.get('B').userData.visibility.target[0],.06);
  scene.setIsolated(true);assert.deepEqual(scene.contextMeshes,[]);assert.equal(scene.meshes.get('B').userData.visibility.target[0],0);
  scene.setIsolated(false);assert.equal(scene.meshes.get('B').userData.visibility.target[0],.06);
});

test('one-cycle intent waits for restoration, scrub stops playback and reset returns through a transition',()=>{
  const scene=fixture();scene.setMode('operate');settle(scene);scene.setPlaybackProgress(.75);scene.playOneCycle();
  assert.equal(scene.operationPlayer.playing,true);assert.equal(scene.operationPlayer.time,0);assert.ok(scene.transformTransition);
  scene.operationPlayer.tick(0,{blocked:true});scene.operationPlayer.tick(800,{blocked:true});assert.equal(scene.operationPlayer.time,0);settle(scene);
  scene.operationPlayer.tick(900);scene.operationPlayer.tick(1400);assert.equal(scene.operationPlayer.time,.5);scene.applyOperationPose();
  scene.setPlaybackProgress(.4);assert.equal(scene.operationPlayer.playing,false);const before=matrices(scene);scene.resetOperation();assert.deepEqual(matrices(scene),before);settle(scene);assert.equal(scene.operationPlayer.time,0);
});

test('replay restores the first authored pose smoothly before resuming a completed cycle',()=>{
  const scene=fixture();scene.setMode('operate');settle(scene);scene.setPlaybackProgress(1);const endpoint=matrices(scene);
  scene.togglePlayback();assert.equal(scene.operationPlayer.time,0);assert.equal(scene.operationPlayer.playing,true);assert.equal(scene.operationPlayer.once,true);
  assert.deepEqual(matrices(scene),endpoint);assert.ok(scene.transformTransition);settle(scene);assert.notDeepEqual(matrices(scene),endpoint);
});


test('operating stages emphasize their component without changing selection and hover is temporary',()=>{
  const scene=fixture();scene.operationPlayer=new OperationPlayer({duration:2,stages:[{at:0,nodeId:'drive'},{at:.5,nodeId:'frame'}]});
  scene.setMode('operate');settle(scene);assert.equal(scene.selectedId,'root');assert.equal(scene.outline.selectedObjects[0].name,'A');
  const initialOutline=scene.outline.selectedObjects;scene.emitOperation();assert.equal(scene.outline.selectedObjects,initialOutline);
  scene.highlight('frame');assert.equal(scene.outline.selectedObjects[0].name,'B');scene.hideHover();assert.equal(scene.outline.selectedObjects[0].name,'A');
  scene.setPlaybackProgress(.6);assert.equal(scene.selectedId,'root');assert.equal(scene.outline.selectedObjects[0].name,'B');
  scene.setSelected('drive');assert.equal(scene.outline.selectedObjects[0].name,'A');scene.setPlaybackProgress(.8);assert.equal(scene.outline.selectedObjects[0].name,'A');
  scene.highlight('frame');assert.equal(scene.outline.selectedObjects[0].name,'B');scene.hideHover();assert.equal(scene.outline.selectedObjects[0].name,'A');
  scene.setSelected('root');assert.equal(scene.outline.selectedObjects[0].name,'B');scene.highlight('drive');scene.setMode('explore');
  assert.equal(scene.selectedId,'root');assert.deepEqual(scene.outline.selectedObjects,[]);assert.equal(scene.hoveredId,null);
});

test('scrubbing or reassembling to zero keeps the explosion workspace until Explore is explicitly chosen',()=>{
  const scene=fixture();scene.setMode('explode');scene.explode(.4,false);scene.explode(0,false);
  assert.equal(scene.mode,'explode');assert.equal(scene.fraction,0);assert.equal(scene.getOperationState().mode,'explode');
  scene.explode(1,false);scene.explode(0,true);assert.equal(scene.mode,'explode');assert.equal(scene.explosionTarget,0);
  scene.setMode('explore');assert.equal(scene.mode,'explore');assert.equal(scene.explosionTarget,0);
  scene.setMode('operate');settle(scene);scene.setPlaybackProgress(.5);scene.setMode('explode');scene.explode(0,false);
  assert.equal(scene.mode,'explode');assert.equal(scene.fraction,0);scene.setMode('explore');assert.equal(scene.mode,'explore');
});
