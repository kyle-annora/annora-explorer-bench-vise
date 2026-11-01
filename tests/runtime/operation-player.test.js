import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Object3D, AnimationClip, VectorKeyframeTrack, QuaternionKeyframeTrack, Quaternion, Vector3, Matrix4 } from 'three';
import { OperationPlayer, SourceAnimationPose } from '../../src/explorer/operation-player.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);

test('operation transport starts paused, advances at speed and loops only during explicit playback', () => {
  const player = new OperationPlayer({duration:4});
  assert.equal(player.state().playing,false); player.tick(1000); near(player.state().time,0);
  player.play(); player.tick(1000); player.tick(1500); near(player.state().time,.5);
  player.setSpeed(2); player.tick(1600); player.tick(2100); near(player.state().time,1.5);
  player.seek(.9); player.play(); player.tick(3000); player.tick(3500); near(player.state().time,.6);
  player.pause(); player.tick(4000); near(player.state().time,.6);
});

test('scrubbing, one cycle and reset have exact endpoint semantics', () => {
  const player = new OperationPlayer({duration:1}); player.play(); player.seek(.7);
  assert.equal(player.state().playing,false); near(player.state().progress,.7);
  player.play({once:true}); near(player.state().progress,0); player.tick(0); player.tick(600); player.tick(1200);
  near(player.state().progress,1); assert.equal(player.state().playing,false);
  player.reset(); near(player.state().progress,0); assert.equal(player.state().playing,false);
});

test('one-cycle toggle resumes the paused position, stops at the endpoint, and replays explicitly',()=>{
  const player=new OperationPlayer({duration:2});player.toggle({once:true});player.tick(0);player.tick(500);near(player.state().time,.5);
  player.toggle({once:true});player.tick(1000);near(player.state().time,.5);assert.equal(player.state().playing,false);
  player.toggle({once:true});player.tick(1500);player.tick(2200);near(player.state().time,1.2);player.tick(3000);near(player.state().time,2);assert.equal(player.state().playing,false);
  player.toggle({once:true});near(player.state().time,0);assert.equal(player.state().playing,true);
});

test('hidden time, transition blocking and resume gaps never jump an operation forward', () => {
  const player=new OperationPlayer({duration:4}); player.play(); player.tick(0);player.tick(200);
  player.setVisibility(true);player.tick(2000);player.setVisibility(false);player.tick(5000);near(player.state().time,.2);
  player.tick(5200);near(player.state().time,.4);player.tick(6000,{blocked:true});player.tick(7000);near(player.state().time,.4);
  player.tick(9000);near(player.state().time,.4);player.tick(9200);near(player.state().time,.6);
});

test('stage mapping is stable at boundaries and invalid transport values remain bounded', () => {
  const player=new OperationPlayer({duration:4,stages:[{at:.5,title:'Return'},{at:0,title:'Drive'}]});
  player.seek(.499);assert.equal(player.state().stage.title,'Drive');player.seek(.5);assert.equal(player.state().stage.title,'Return');
  player.seek(20);near(player.state().progress,1);player.setSpeed(20);near(player.state().speed,2);
  player.setSpeed(-2);near(player.state().speed,.25);player.seek(NaN);near(player.state().progress,0);
  assert.equal(new OperationPlayer().play(),false);
});

test('source animation preserves animated ancestors and restores original local transforms after arbitrary scrubbing', () => {
  const root=new Group();root.position.set(2,0,0);const parent=new Group();parent.name='Crank';parent.position.set(1,0,0);root.add(parent);
  const mesh=new Object3D();mesh.name='Child';mesh.position.set(1,0,0);parent.add(mesh);root.updateMatrixWorld(true);
  const rotation=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),Math.PI);
  const clip=new AnimationClip('Cycle',2,[new VectorKeyframeTrack('Crank.position',[0,2],[1,0,0,3,0,0]),new QuaternionKeyframeTrack('Crank.quaternion',[0,2],[0,0,0,1,...rotation.toArray()])]);
  const normalization=new Matrix4().makeScale(2,2,2), sampler=new SourceAnimationPose(root,clip,normalization);
  sampler.sample(.5);const position=new Vector3().setFromMatrixPosition(sampler.matrixFor(mesh));near(position.x,8);near(position.y,2);
  sampler.sample(1);sampler.sample(.25);sampler.restore();
  assert.deepEqual(parent.position.toArray(),[1,0,0]);assert.deepEqual(parent.quaternion.toArray(),[0,0,0,1]);assert.deepEqual(mesh.position.toArray(),[1,0,0]);
  const rest=new Vector3().setFromMatrixPosition(sampler.matrixFor(mesh));near(rest.x,8);near(rest.y,0);
  sampler.sample(.5);const replay=new Vector3().setFromMatrixPosition(sampler.matrixFor(mesh));near(replay.x,8);near(replay.y,2);sampler.dispose();
});
