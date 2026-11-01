import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODEL_CATALOG, validatePackage } from '../fixtures/baseline-catalog.js';
import { buildHierarchy, ancestors, createOffsets, positionAt } from '../../src/explorer/model-state.js';
import { createNavigation, selectNode, enterScope, toggleBranch } from '../../src/explorer/navigation-state.js';

for(const model of Object.values(MODEL_CATALOG)){
  const metadata=JSON.parse(readFileSync(model.metadataUrl));
  const hierarchy=buildHierarchy(metadata, model.presentationPolicy);
  test(`${model.id}: a package has unique pickable identities and complete group membership`,()=>{
    assert.equal(validatePackage(metadata,model),true);assert.equal(hierarchy.root.id,model.rootId);
    const leaves=[...hierarchy.nodes.values()].filter(node=>!node.children.length);
    assert.deepEqual(leaves.flatMap(node=>node.meshNames).sort(),metadata.parts.map(part=>part.meshName).sort());
    for(const node of hierarchy.nodes.values()){
      if(!node.children.length)continue;
      const names=node.children.flatMap(id=>hierarchy.nodes.get(id).meshNames);
      assert.equal(names.length,new Set(names).size);assert.deepEqual([...names].sort(),[...node.meshNames].sort());
    }
  });
  test(`${model.id}: selecting, disclosing and entering have independent effects`,()=>{
    const group=hierarchy.nodes.get(hierarchy.root.children[0]);const initial=createNavigation(model.rootId);
    const selected=selectNode(initial,hierarchy.nodes,group.id);
    assert.equal(selected.scopeId,model.rootId);assert.equal(selected.selectedId,group.id);
    const disclosed=toggleBranch(selected,hierarchy.nodes,group.id);
    assert.equal(disclosed.scopeId,model.rootId);assert.equal(disclosed.selectedId,group.id);assert.ok(disclosed.expanded.has(group.id));assert.ok(!selected.expanded.has(group.id));
    const entered=enterScope(disclosed,hierarchy.nodes,group.id);assert.equal(entered.scopeId,group.id);assert.equal(entered.isolated,false);
    const returned=enterScope({...entered,isolated:true},hierarchy.nodes,model.rootId);assert.equal(returned.isolated,false);assert.equal(returned.scopeId,model.rootId);
    const leaf=[...hierarchy.nodes.values()].find(node=>node.type==='component');const chosen=selectNode(entered,hierarchy.nodes,leaf.id);assert.equal(chosen.scopeId,group.id);
    for(const ancestor of ancestors(hierarchy.nodes,leaf.id).slice(0,-1))assert.ok(chosen.expanded.has(ancestor.id));
  });
  test(`${model.id}: every explosion restores immutable assembled coordinates`,()=>{
    const before=JSON.stringify(metadata),offsets=createOffsets(metadata.parts,hierarchy.nodes,model.rootId,1,model.presentationPolicy);
    for(const part of metadata.parts){const offset=offsets.get(part.meshName);assert.ok(offset.every(Number.isFinite));assert.deepEqual(positionAt(part.center,offset,0),part.center);}
    assert.equal(JSON.stringify(metadata),before);
  });
  test(`${model.id}: invalid identities and incomplete groups fail before rendering`,()=>{
    const invalid=structuredClone(metadata);invalid.parts[1].meshName=invalid.parts[0].meshName;assert.throws(()=>validatePackage(invalid,model),/mesh identity/);
    const missing=structuredClone(metadata);missing.groups[0].meshNames.pop();assert.throws(()=>validatePackage(missing,model),/cover|mismatch/);
  });
}
