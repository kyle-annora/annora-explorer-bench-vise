import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { importModel } from '../scripts/import-model.mjs';
import { inspectGLB, prepareModelPackage, sha256, validateDefinition } from '../scripts/lib/model-preparation.mjs';
import { loadProject } from '../scripts/lib/project-config.mjs';
import { buildHierarchy } from '../src/explorer/model-state.js';

function glb({mutate=()=>{},indices=[0,1,2],animation=false}={}){
  const streams=[],views=[];let offset=0;
  const stream=array=>{const bytes=Buffer.from(array.buffer,array.byteOffset,array.byteLength),padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);streams.push(padded);views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});offset+=padded.length;return views.length-1;};
  stream(new Float32Array([0,0,0,1,0,0,0,1,0]));stream(new Uint16Array(indices));
  const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'Assembly',children:[1,2]},{name:'MovingPart',mesh:0},{name:'FixedPart',mesh:0,translation:[2,0,0]}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],bufferViews:views,accessors:[{bufferView:0,componentType:5126,type:'VEC3',count:3,min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,type:'SCALAR',count:indices.length}]};
  if(animation){const input=stream(new Float32Array([0,1])),output=stream(new Float32Array([0,0,0,.5,0,0]));document.accessors.push({bufferView:input,componentType:5126,type:'SCALAR',count:2,min:[0],max:[1]},{bufferView:output,componentType:5126,type:'VEC3',count:2});document.animations=[{name:'Slide',channels:[{sampler:0,target:{node:1,path:'translation'}}],samplers:[{input:2,output:3,interpolation:'LINEAR'}]}];}
  const binary=Buffer.concat(streams);document.buffers=[{byteLength:binary.length}];mutate(document,binary);
  const text=Buffer.from(JSON.stringify(document)),json=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(json);const result=Buffer.alloc(12+8+json.length+8+binary.length);
  result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);result.writeUInt32LE(json.length,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20);result.writeUInt32LE(binary.length,20+json.length);result.writeUInt32LE(0x004e4942,24+json.length);binary.copy(result,28+json.length);return result;
}
function definition(){return {schemaVersion:1,id:'fixture',title:'Two rigid plates',provenance:{author:'Fixture author',license:'MIT',attribution:'Original deterministic test fixture.',description:'Two separately named rigid source meshes.',note:'Illustrative geometry. No mechanical claims.'},licenseText:'MIT fixture notice\n'};}
async function prepare(bytes=glb(),def=definition(),extra={}){return prepareModelPackage({sourceBytes:bytes,definition:def,licenseText:def.licenseText,...extra});}
async function folder(t){const path=await mkdtemp(join(tmpdir(),'explorer-import-test-'));t.after(()=>rm(path,{recursive:true,force:true}));return path;}

test('import preflight rejects model identities and titles that configuration cannot accept',()=>{
  for(const id of ['42-inch-grinder','Uppercase','bad_id','a'.repeat(65),'constructor','prototype'])assert.throws(()=>validateDefinition({...definition(),id,rootId:'assembly'}),/Definition id/);
  for(const title of ['', ' ', 'x'.repeat(161), 'Motor\u0001assembly'])assert.throws(()=>validateDefinition({...definition(),title,shortTitle:'Motor'}),/model title/);
  for(const shortTitle of [null, '', ' ', 'x'.repeat(81), 'Motor\u0000'])assert.throws(()=>validateDefinition({...definition(),shortTitle}),/shortTitle/);
  assert.throws(()=>validateDefinition({...definition(),title:'x'.repeat(81)}),/Provide shortTitle/);
});

test('an imported package at model name limits loads through the real configuration pipeline',async t=>{
  const root=await folder(t),def={...definition(),id:'a'.repeat(64),title:'T'.repeat(160),shortTitle:'S'.repeat(80)};
  await writeFile(join(root,'source.glb'),glb());await writeFile(join(root,'definition.json'),JSON.stringify(def));
  await importModel({source:join(root,'source.glb'),definition:join(root,'definition.json'),out:join(root,'content/model')});
  await writeFile(join(root,'project.config.json'),JSON.stringify({schemaVersion:1,id:'import-review',title:'Import review',description:'An importer-to-runtime compatibility check.',brand:{name:'FIXTURE',product:'EXPLORER',homeUrl:'./',accent:'#ff6840'},defaultModel:def.id,features:{explode:true,operation:false,tour:false,themes:false,quality:false,renderStyles:['engineering','linework','flat']},models:[{manifest:'content/model/manifest.json'}]}));
  const result=await loadProject(root);assert.equal(result.models[0].manifest.id,def.id);assert.equal(result.models[0].runtime.title,def.title);assert.equal(result.models[0].runtime.shortTitle,def.shortTitle);
});

test('preparation preserves exact source bytes, deterministic gzip and shared geometry ranges',async()=>{
  const bytes=glb(),first=await prepare(bytes),second=await prepare(bytes);
  assert.deepEqual([...first.files.keys()],[...second.files.keys()]);for(const [name,data]of first.files)assert.deepEqual(data,second.files.get(name),name);
  assert.deepEqual(first.files.get('model.glb'),bytes);assert.deepEqual(gunzipSync(first.files.get('model.glb.gz')),bytes);
  for(const name of ['edges.bin','silhouettes.bin'])assert.deepEqual(gunzipSync(first.files.get(name+'.gz')),first.files.get(name));
  assert.equal(first.report.counts.uniqueGeometries,1);assert.equal(first.metadata.parts.length,2);assert.equal(first.metadata.operation,undefined);assert.equal(first.manifest.tour,undefined);
  const hierarchy=buildHierarchy(first.metadata);assert.equal(hierarchy.nodes.size,5);assert.equal(first.report.sourceSha256,sha256(bytes));
  const edges=JSON.parse(first.files.get('edge-metadata.json'));assert.deepEqual(edges.meshes.MovingPart,edges.meshes.FixedPart);
});
test('curation controls names, membership, finish and explosion without editing the GLB',async()=>{
  const def=definition();def.groups=[{id:'plates',title:'Plate pair',meshNames:['MovingPart','FixedPart'],finishFamily:'machined',explode:[0,.2,0],children:[{id:'moving-assembly',title:'Moving assembly',meshNames:['MovingPart']}]}];def.parts={MovingPart:{id:'moving',title:'Moving plate',finishFamily:'bronze'}};
  const result=await prepare(glb(),def);assert.equal(result.metadata.parts[0].id,'moving');assert.equal(result.metadata.parts[0].finishFamily,'bronze');assert.equal(result.metadata.parts[1].finishFamily,'machined');assert.deepEqual(result.metadata.parts[0].explode,[0,.2,0]);assert.equal(buildHierarchy(result.metadata).nodes.get('moving').parent,'moving-assembly');
});
test('only an explicitly selected real source clip enables motion and sampled framing',async()=>{
  const bytes=glb({animation:true}),def=definition();const untouched=await prepare(bytes,def);assert.equal(untouched.metadata.operation,undefined);
  def.operation={clipName:'Slide',stages:[{at:0,title:'Start',nodeId:'fixture'},{at:.5,title:'Translate',nodeId:'fixture'}]};const result=await prepare(bytes,def);
  assert.equal(result.metadata.operation.duration,1);assert.equal(result.metadata.parts[0].cycleBounds[1][0],1.5);assert.deepEqual(result.files.get('model.glb'),bytes);
  def.operation.clipName='Invented motion';await assert.rejects(prepare(bytes,def),/requested operation clip/);
});
test('authored tour references are checked and chapter timing is compiled deterministically',async()=>{
  const def=definition();def.tour='tour.json';const tour={id:'fixture-tour',title:'Inspect the plates',chapters:[{id:'whole',label:'Whole',title:'Two plates.',duration:5,scopeId:'fixture',selectedId:'fixture',highlightIds:[],annotations:[],renderStyle:'linework',explosion:[0,.4],camera:{focusId:'fixture',direction:[0,0,1],scale:1}}]};
  const result=await prepare(glb(),def,{tour}),compiled=JSON.parse(result.files.get('tour.json'));assert.equal(compiled.duration,5);assert.equal(compiled.chapters[0].start,0);assert.equal(compiled.chapters[0].end,5);
  tour.chapters[0].selectedId='missing';await assert.rejects(prepare(glb(),def,{tour}),/unknown navigation node/);
});

for(const [name,mutate,message]of [
  ['external buffers',doc=>{doc.buffers[0].uri='https://example.org/private.bin';},/External or multiple buffers/],
  ['sparse accessors',doc=>{doc.accessors[0].sparse={count:1};},/Sparse accessor/],
  ['compressed geometry',doc=>{doc.extensionsUsed=['KHR_draco_mesh_compression'];},/Compressed or quantized/],
  ['skinned geometry',doc=>{doc.skins=[{joints:[0]}];},/Skinned meshes/],
  ['morph targets',doc=>{doc.meshes[0].primitives[0].targets=[{POSITION:0}];},/Morph targets/],
  ['multiple primitives',doc=>{doc.meshes[0].primitives.push(structuredClone(doc.meshes[0].primitives[0]));},/one primitive\/material/],
  ['unnamed components',doc=>{delete doc.nodes[1].name;},/unique name/],
  ['ambiguous names',doc=>{doc.nodes[2].name='MovingPart';},/unique after/],
  ['reserved names',doc=>{doc.nodes[1].name='__proto__';},/unique after/],
  ['local shear',doc=>{doc.nodes[1].matrix=[1,0,0,0,.2,1,0,0,0,0,1,0,0,0,0,1];},/has shear/],
  ['singular scale',doc=>{doc.nodes[1].scale=[0,1,1];},/singular scale/],
  ['non-finite positions',(_,bytes)=>bytes.writeFloatLE(NaN,0),/non-finite/],
  ['invalid indices',(_,bytes)=>bytes.writeUInt16LE(99,36),/exceeds its position/],
  ['invalid bounds',doc=>{doc.accessors[0].max=[99,1,0];},/bounds differ/],
  ['textured input',doc=>{doc.images=[{uri:'texture.png'}];},/Textures and images/],
  ['instancing extension',doc=>{doc.nodes[1].extensions={EXT_mesh_gpu_instancing:{}};},/Extended node/],
  ['cyclic hierarchy',doc=>{doc.nodes[1].children=[0];},/root also has a parent/],
  ['unbounded accessor counts',doc=>{doc.accessors[0].count=999999999;},/exceeds its bufferView/],
])test(`unsupported input rejects ${name} before geometry preparation`,()=>assert.throws(()=>inspectGLB(glb({mutate})),message));

test('parent-child transforms that introduce world shear are rejected',async()=>{
  const bytes=glb({mutate:doc=>{doc.nodes[0].scale=[2,1,1];doc.nodes[1].rotation=[0,0,Math.sin(Math.PI/8),Math.cos(Math.PI/8)];}});await assert.rejects(prepare(bytes),/has shear/);
});
test('overlapping non-manifold triangles are rejected before expensive contour pairing',async()=>{await assert.rejects(prepare(glb({indices:[0,1,2,0,1,2,0,1,2]})),/non-manifold/);});
test('definition membership and unknown finish families fail explicitly',async()=>{
  const def=definition();def.groups=[{id:'plates',title:'Plates',meshNames:['MovingPart']}];await assert.rejects(prepare(glb(),def),/Every source mesh/);def.groups[0].meshNames.push('FixedPart');def.groups[0].finishFamily='imaginary';await assert.rejects(prepare(glb(),def),/Unknown group finish/);
});
test('CLI import commits a complete package, never edits source and refuses overwrite',async t=>{
  const base=await folder(t),source=join(base,'source.glb'),definitionPath=join(base,'definition.json'),out=join(base,'result');const bytes=glb();await writeFile(source,bytes);await writeFile(definitionPath,JSON.stringify(definition()));
  const report=await importModel({source,definition:definitionPath,out});assert.equal(report.modelId,'fixture');assert.deepEqual(await readFile(source),bytes);assert.deepEqual(await readFile(join(out,'model.glb')),bytes);assert.ok((await readdir(out)).includes('preparation-report.json'));
  const before=await readFile(join(out,'manifest.json'));await assert.rejects(importModel({source,definition:definitionPath,out}),/Output already exists/);assert.deepEqual(await readFile(join(out,'manifest.json')),before);assert.ok(!(await readdir(base)).some(name=>name.includes('.import-')));
});
test('failed preparation writes no output or temporary directory',async t=>{
  const base=await folder(t),source=join(base,'source.glb'),definitionPath=join(base,'definition.json');await writeFile(source,glb({mutate:doc=>{doc.skins=[{}];}}));await writeFile(definitionPath,JSON.stringify(definition()));
  await assert.rejects(importModel({source,definition:definitionPath,out:join(base,'new-parent','bad')}),/Skinned meshes/);assert.deepEqual((await readdir(base)).sort(),['definition.json','source.glb']);
});
test('definition-relative notices cannot escape through paths or symlinks',async t=>{
  const base=await folder(t),modelDir=join(base,'model');await mkdir(modelDir);const def=definition();delete def.licenseText;def.licenseFile='../secret.txt';await writeFile(join(base,'secret.txt'),'private');await writeFile(join(modelDir,'source.glb'),glb());const path=join(modelDir,'definition.json');await writeFile(path,JSON.stringify(def));
  const options={source:join(modelDir,'source.glb'),definition:path,out:join(base,'result')};await assert.rejects(importModel(options),/stay inside/);await symlink(join(base,'secret.txt'),join(modelDir,'notice.txt'));def.licenseFile='notice.txt';await writeFile(path,JSON.stringify(def));await assert.rejects(importModel(options),/stay inside/);
});

test('small valid uniform scales are preserved while small shears are still rejected',async()=>{
  const valid=glb({mutate:doc=>{doc.nodes[0].scale=[.000001,.000001,.000001];}});assert.equal((await prepare(valid)).metadata.parts.length,2);
  const invalid=glb({mutate:doc=>{doc.nodes[0].scale=[.000002,.000001,.000001];doc.nodes[1].rotation=[0,0,Math.sin(Math.PI/8),Math.cos(Math.PI/8)];}});await assert.rejects(prepare(invalid),/has shear/);
});
