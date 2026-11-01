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
  Object.assign(scene,{model:{id:'fixture'},rootId:'root',scopeId:'root',selectedId:'root',metadata,nodes:hierarchy.nodes,mode:'explore',isolated:false,scale:1,meshes:new Map(),edges:new Map(),active:[],contextMeshes:[],movingMeshes:new Set(),scopeViews:new Map(),separationMotion:new DampedMotion([0]),explosionTarget:0,fraction:0,callbacks:{},benchmark:{active:false},outline:{selectedObjects:[]},controls:{target:new THREE.Vector3(),enableDamping:true},camera:new THREE.PerspectiveCamera(15,1,.05,150),mount:{clientWidth:900,clientHeight:700},offsetX:0,offsetY:0,defaultDirection:new THREE.Vector3(0,0,1),operationConfig:{},followCamera:false,operationPlayer:new OperationPlayer({duration:2}),operationSampler:new SourceAnimationPose(source,clip),invalidate(){},fit(){},syncEdges(){}});
  for(const original of [sourceA,sourceB]){
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.name=original.name;original.matrixWorld.decompose(mesh.position,mesh.quaternion,mesh.scale);
    mesh.userData={source:original,base:mesh.position.toArray(),baseQuaternion:mesh.quaternion.clone(),baseScale:mesh.scale.clone(),pose:new DampedMotion(mesh.position.toArray()),visibility:new DampedMotion([1]),fitCorners:[new THREE.Vector3(-.5,-.25,-.15),new THREE.Vector3(.5,.25,.15)]};
    const line=new THREE.Object3D();line.position.copy(mesh.position);line.quaternion.copy(mesh.quaternion);line.scale.copy(mesh.scale);scene.meshes.set(mesh.name,mesh);scene.edges.set(mesh.name,line);
  }
  scene.lineRuntime={};scene.resizeDrawingBuffer=()=>{};scene.camera.position.set(0,0,10);scene.camera.lookAt(0,0,0);scene.controls.update=()=>false;scene.applyProjectionOffset=function(x,y){this.offsetX=x;this.offsetY=y;};scene.edgeBuffer=new ArrayBuffer(0);scene.active=[...scene.meshes.values()];scene.offsets=createOffsets(parts,scene.nodes,'root',1);return scene;
}
function settle(scene){for(let i=0;i<200&&scene.transformTransition;i++)scene.stepTransformTransition(1/60);assert.equal(scene.transformTransition,null);}
function matrices(scene){return [...scene.meshes].map(([name,mesh])=>{mesh.updateMatrix();return [name,mesh.matrix.toArray()];});}
function nearArray(actual,expected){assert.equal(actual.length,expected.length);actual.forEach((value,index)=>assert.ok(Math.abs(value-expected[index])<1e-7,`${value} != ${expected[index]}`));}

const shot=(overrides={})=>({key:'assembly',scopeId:'root',selectedId:'root',highlightIds:[],technical:false,explosion:0,operationProgress:null,camera:{focusId:'root',direction:[.3,.2,1],scale:1.1},...overrides});

test('source sampling, exploded poses and linework remain deterministic across seeking',()=>{
  const scene=fixture(),rest=matrices(scene);
  const operation=shot({key:'cycle',technical:true,operationProgress:.5,highlightIds:['drive']});
  scene.applyTourFrame(operation,{immediate:true});const cycle=matrices(scene);
  assert.notDeepEqual(cycle,rest);assert.equal(scene.operationPlayer.playing,false);
  for(const [name,mesh]of scene.meshes){const line=scene.edges.get(name);line.updateMatrix();nearArray(line.matrix.toArray(),mesh.matrix.toArray());assert.equal(mesh.userData.pose.active,false);}
  scene.applyTourFrame(shot({key:'exploded',explosion:.6}),{immediate:true});const exploded=matrices(scene);
  assert.notDeepEqual(exploded,rest);assert.notDeepEqual(exploded,cycle);
  scene.applyTourFrame(operation,{immediate:true});assert.deepEqual(matrices(scene),cycle);
  scene.applyTourFrame(shot(),{immediate:true});assert.deepEqual(matrices(scene),rest);
  assert.equal(scene.transformTransition,null);assert.equal(scene.separationMotion.active,false);
});

test('repeated frames do not refit the camera and authored highlight is independent of selection',()=>{
  const scene=fixture();let cameraCalls=0;const move=scene.moveCamera.bind(scene);scene.moveCamera=(...args)=>{cameraCalls++;move(...args);};
  scene.applyTourFrame(shot({highlightIds:['drive']}),{immediate:true});const firstCalls=cameraCalls,pose=matrices(scene);
  scene.applyTourFrame(shot({highlightIds:['frame']}));
  assert.equal(cameraCalls,firstCalls);assert.deepEqual(matrices(scene),pose);assert.equal(scene.selectedId,'root');assert.equal(scene.outline.selectedObjects[0].name,'B');
  scene.highlight('drive');assert.equal(scene.outline.selectedObjects[0].name,'B');
  scene.applyTourFrame(shot({key:'cycle',operationProgress:.2}));const cycleCalls=cameraCalls;
  scene.applyTourFrame(shot({key:'cycle',operationProgress:.7}));assert.equal(cameraCalls,cycleCalls);
  assert.equal(scene.operationPlayer.playing,false);assert.equal(scene.operationPlayer.state().progress,.7);
});

test('pause freezes in-flight transforms and leave/reacquire allows free exploration',()=>{
  const scene=fixture();scene.applyTourFrame(shot({explosion:1,highlightIds:['drive']}));scene.stepTransformTransition(.12);scene.cameraMotion.step(.12);scene.applyCamera();
  const stopped=matrices(scene),camera=scene.camera.position.toArray();scene.pausePresentation();
  scene.stepTransformTransition(.5);scene.cameraMotion.step(.5);assert.deepEqual(matrices(scene),stopped);assert.deepEqual(scene.camera.position.toArray(),camera);
  assert.equal(scene.transformTransition,null);assert.equal(scene.cameraMotion.active,false);
  scene.leaveTour();scene.setSelected('frame');assert.equal(scene.outline.selectedObjects[0].name,'B');
  scene.applyTourFrame(shot({explosion:1,highlightIds:['drive']}));assert.ok(scene.transformTransition);assert.equal(scene.cameraMotion.active,true);assert.equal(scene.outline.selectedObjects[0].name,'A');
  settle(scene);assert.notDeepEqual(matrices(scene),stopped);
});

test('restoring an operated snapshot preserves exact displayed pose and never resumes autoplay',async()=>{
  const scene=fixture();scene.setMode('operate');settle(scene);scene.setPlaybackProgress(.35);scene.operationPlayer.play({restart:false});scene.setSelected('drive');
  const original=matrices(scene),snapshot=scene.capturePresentation();assert.equal(snapshot.operation.playing,true);
  scene.applyTourFrame(shot({scopeId:'frame',selectedId:'frame',explosion:.7,technical:true}),{immediate:true});
  assert.equal(await scene.restorePresentation(snapshot,{animate:false}),true);
  assert.deepEqual(matrices(scene),original);assert.equal(scene.scopeId,'root');assert.equal(scene.selectedId,'drive');assert.equal(scene.mode,'operate');assert.equal(scene.technical,false);
  assert.equal(scene.operationPlayer.state().progress,.35);assert.equal(scene.operationPlayer.playing,false);assert.equal(scene.tourFrame,null);
  nearArray(scene.camera.position.toArray(),snapshot.camera.position);
});

test('async restoration cannot overwrite a newly started tour while linework loads',async()=>{
  const scene=fixture(),snapshot=scene.capturePresentation();snapshot.technical=true;delete snapshot.renderStyle;scene.edgeBuffer=null;scene.lineRuntime=null;
  let complete;scene.prepareEdges=()=>new Promise(resolve=>{complete=resolve;});
  const pending=scene.restorePresentation(snapshot);scene.applyTourFrame(shot({scopeId:'drive',selectedId:'drive'}),{immediate:true});complete();
  assert.equal(await pending,false);assert.equal(scene.scopeId,'drive');assert.equal(scene.technical,false);assert.ok(scene.tourFrame);
});

test('annotation anchors follow displayed poses and do not expose hidden parent context',()=>{
  const scene=fixture();const first=scene.projectTourAnchor('drive');assert.equal(first.visible,true);
  scene.applyTourFrame(shot({operationProgress:.5}),{immediate:true});const next=scene.projectTourAnchor('drive');assert.notDeepEqual(next,first);
  scene.meshes.get('A').userData.visibility.to([.06],true);assert.equal(scene.projectTourAnchor('drive').visible,false);assert.equal(scene.projectTourAnchor('missing').visible,false);
});


test('manual explosion after a paused full-pose restoration removes the interrupted rotation',()=>{
  const scene=fixture();scene.applyTourFrame(shot({operationProgress:.5}),{immediate:true});
  scene.applyTourFrame(shot({key:'restore'}));scene.stepTransformTransition(.08);scene.leaveTour();
  assert.equal(scene.presentationPoseDetached,true);const midway=matrices(scene);scene.explode(0);
  assert.deepEqual(matrices(scene),midway);settle(scene);
  for(const mesh of scene.meshes.values()){nearArray(mesh.position.toArray(),mesh.userData.base);nearArray(mesh.quaternion.toArray(),mesh.userData.baseQuaternion.toArray());}
  assert.equal(scene.presentationPoseDetached,false);
});


test('a scope change refits the authored camera once using that scope offsets',()=>{
  const scene=fixture();let cameraCalls=0;const move=scene.moveCamera.bind(scene);scene.moveCamera=(...args)=>{cameraCalls++;move(...args);};
  const camera={focusId:'drive',direction:[.3,.2,1],explosion:.6};
  scene.applyTourFrame(shot({camera}),{immediate:true});const before=cameraCalls;
  scene.applyTourFrame(shot({scopeId:'drive',camera}));assert.equal(cameraCalls,before+1);
  scene.applyTourFrame(shot({scopeId:'drive',camera}));assert.equal(cameraCalls,before+1);
});


test('unchanged layout restores the exact panned and zoomed view including projection offsets',async()=>{
  const scene=fixture();scene.callbacks.insets=()=>({left:240,top:70,bottom:90});
  scene.controls.target.set(.4,.3,.2);scene.camera.position.set(2,3,12);scene.offsetX=-120;scene.offsetY=10;
  const snapshot=scene.capturePresentation();scene.applyTourFrame(shot({scopeId:'drive'}),{immediate:true});
  await scene.restorePresentation(snapshot,{animate:false});
  nearArray(scene.camera.position.toArray(),snapshot.camera.position);nearArray(scene.controls.target.toArray(),snapshot.camera.target);
  assert.equal(scene.offsetX,-120);assert.equal(scene.offsetY,10);assert.equal(scene.lastLayoutKey,snapshot.camera.layoutKey);
});

test('rotating during a tour refits restored scope and pose to current mobile panels',async()=>{
  const scene=fixture();let insets={left:240,top:70,bottom:90};scene.callbacks.insets=()=>insets;
  scene.scopeId='drive';scene.selectedId='drive';scene.updateContextVisibility();scene.offsetX=-120;scene.offsetY=10;
  scene.camera.position.set(2,3,12);const snapshot=scene.capturePresentation();
  scene.applyTourFrame(shot({operationProgress:.45}),{immediate:true});
  scene.mount.clientWidth=390;scene.mount.clientHeight=844;insets={top:80,bottom:240};
  await scene.restorePresentation(snapshot,{animate:false});
  assert.equal(scene.scopeId,'drive');assert.equal(scene.offsetX,0);assert.equal(scene.offsetY,80);
  assert.notEqual(scene.lastLayoutKey,snapshot.camera.layoutKey);assert.equal(scene.lastLayoutKey,scene.layoutRegion().key);
  const originalDirection=new THREE.Vector3().fromArray(snapshot.camera.position).sub(new THREE.Vector3().fromArray(snapshot.camera.target)).normalize();
  nearArray(scene.currentDirection().toArray(),originalDirection.toArray());
  scene.camera.setViewOffset(390,844,scene.offsetX,scene.offsetY,390,844);scene.camera.lookAt(scene.controls.target);scene.camera.updateMatrixWorld(true);
  const mesh=scene.meshes.get('A'),box=mesh.geometry.boundingBox;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const point=new THREE.Vector3(x,y,z).multiply(mesh.scale).applyQuaternion(mesh.quaternion).add(mesh.position).project(scene.camera);
    const screenX=(point.x+1)*390/2,screenY=(1-point.y)*844/2;
    assert.ok(screenX>=0&&screenX<=390,`component x ${screenX} outside mobile viewport`);
    assert.ok(screenY>=80&&screenY<=604,`component y ${screenY} underneath mobile panels`);
  }
});


test('held motion and caption-only cues do not read layout, resample geometry or restart rendering',()=>{
  const scene=fixture();let layoutReads=0,poseSamples=0,invalidations=0;
  const layout=scene.layoutRegion.bind(scene),targets=scene.operationTargets.bind(scene);
  scene.layoutRegion=()=>{layoutReads++;return layout();};scene.operationTargets=progress=>{poseSamples++;return targets(progress);};scene.invalidate=()=>{invalidations++;};
  scene.applyTourFrame(shot({operationProgress:.5,highlightIds:['drive']}),{immediate:true});
  scene.dirty=false;const settled={layoutReads,poseSamples,invalidations},camera=scene.cameraMotion;
  for(let tick=0;tick<120;tick++)scene.applyTourFrame(shot({operationProgress:.5,highlightIds:['drive'],cueId:`caption-${tick}`,caption:'Hold at the reversal.'}));
  assert.deepEqual({layoutReads,poseSamples,invalidations},settled);assert.equal(scene.cameraMotion,camera);assert.equal(scene.dirty,false);
});

test('collapsing the assembly tree increases usable model scale through one explicit layout refit',()=>{
  const scene=fixture();scene.ready=true;let insets={left:320,bottom:120};scene.callbacks.insets=()=>insets;
  scene.applyTourFrame(shot({camera:{focusId:'root',direction:[0,0,1]}}),{immediate:true});
  const openDistance=scene.camera.position.distanceTo(scene.controls.target);assert.equal(scene.offsetX,-160);
  insets={bottom:120};scene.refitLayout(false);const closedDistance=scene.camera.position.distanceTo(scene.controls.target);
  assert.ok(closedDistance<openDistance*.8,`collapsed distance ${closedDistance} should be closer than ${openDistance}`);assert.equal(scene.offsetX,0);
  const camera=scene.cameraMotion;scene.refitLayout(false);assert.equal(scene.cameraMotion,camera);
});

test('tour transitions settle promptly without changing the timing of manual camera moves',()=>{
  const scene=fixture();scene.applyTourFrame(shot({explosion:1}));
  assert.equal(scene.cameraMotion.smoothTime,.11);assert.equal(scene.transformTransition.motion.smoothTime,.12);
  const initialDistance=scene.cameraMotion.values.reduce((sum,value,index)=>sum+Math.abs(value-scene.cameraMotion.target[index]),0);
  for(let tick=0;tick<30;tick++){scene.cameraMotion.step(1/60);scene.stepTransformTransition(1/60);}
  const remainingDistance=scene.cameraMotion.values.reduce((sum,value,index)=>sum+Math.abs(value-scene.cameraMotion.target[index]),0);
  assert.ok(remainingDistance<initialDistance*.01);assert.ok(scene.transformTransition.motion.values[0]>.99);
  scene.leaveTour();scene.moveCamera(new THREE.Vector3(),new THREE.Vector3(0,0,1),10,{offsetX:0,offsetY:0},true);assert.equal(scene.cameraMotion.smoothTime,.13);
});

test('two source passes and a reverse seek keep one operating camera and exact repeated poses',()=>{
  const scene=fixture();let fits=0;const move=scene.moveCamera.bind(scene);scene.moveCamera=(...args)=>{fits++;move(...args);};
  const samples=new Map();
  for(const progress of [0,.25,.5,.75,1]){scene.applyTourFrame(shot({key:'cycle',operationProgress:progress}),{immediate:true});samples.set(progress,matrices(scene));}
  const initialFits=fits;
  for(const progress of [0,.25,.5,.75,1,.5,.25]){
    scene.applyTourFrame(shot({key:'cycle',operationProgress:progress,operationPass:2}),{immediate:true});assert.deepEqual(matrices(scene),samples.get(progress));
    assert.equal(scene.operationPlayer.playing,false);
  }
  assert.equal(fits,initialFits);scene.applyTourFrame(shot(),{immediate:true});
  for(const mesh of scene.meshes.values()){nearArray(mesh.position.toArray(),mesh.userData.base);nearArray(mesh.quaternion.toArray(),mesh.userData.baseQuaternion.toArray());}
});

test('explicit render style survives tour exit and overrides the legacy technical flag',async()=>{
  const scene=fixture();scene.renderStyle='flat';scene.technical=true;scene.setSelected('drive');
  const snapshot=scene.capturePresentation(),before=matrices(scene);
  scene.applyTourFrame(shot({renderStyle:'engineering',technical:true}),{immediate:true});
  assert.equal(scene.renderStyle,'engineering');assert.equal(scene.technical,false);
  scene.applyTourFrame(shot({renderStyle:'flat',highlightIds:['frame'],operationProgress:.5}),{immediate:true});
  assert.equal(scene.renderStyle,'flat');assert.equal(scene.technical,true);
  await scene.restorePresentation(snapshot,{animate:false});
  assert.equal(scene.renderStyle,'flat');assert.equal(scene.selectedId,'drive');assert.deepEqual(matrices(scene),before);assert.equal(scene.operationPlayer.playing,false);
});
