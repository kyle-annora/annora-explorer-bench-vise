import * as THREE from 'three';
import { Pass } from 'three/addons/postprocessing/Pass.js';

export const LINE_WIDTHS = Object.freeze({ crease: 1.4, contour: 2 });
const COVERAGE_WIDTH = .75;

/** Prepare adjacency once; smooth, sharp and boundary contours are classified on the GPU. */
export function buildSilhouetteGeometry(source, creaseAngle = 35) {
  const positions=source.getAttribute('position'),index=source.index;
  source.computeBoundingBox();
  const extent=source.boundingBox.getSize(new THREE.Vector3()).length();
  const tolerance=Math.max(extent*1e-7,1e-8),vertices=new Map(),ids=[],points=[];
  for(let i=0;i<positions.count;i++){
    const point=new THREE.Vector3().fromBufferAttribute(positions,i);
    const key=[point.x,point.y,point.z].map(value=>Math.round(value/tolerance)).join(':');
    if(!vertices.has(key)){vertices.set(key,points.length);points.push(point);}
    ids.push(vertices.get(key));
  }
  const edges=new Map(),count=index?index.count:positions.count;
  for(let i=0;i<count;i+=3){
    const triangle=[0,1,2].map(offset=>ids[index?index.getX(i+offset):i+offset]);
    const [a,b,c]=triangle.map(id=>points[id]);
    const normal=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));
    if(normal.lengthSq()<1e-20)continue;normal.normalize();
    for(let edge=0;edge<3;edge++){
      const start=triangle[edge],end=triangle[(edge+1)%3];if(start===end)continue;
      const key=start<end?`${start}:${end}`:`${end}:${start}`;
      if(!edges.has(key))edges.set(key,{start,end,normals:[]});
      edges.get(key).normals.push(normal);
    }
  }
  const position=[],normalA=[],normalB=[],center=[],feature=[];
  const threshold=Math.cos(THREE.MathUtils.degToRad(creaseAngle));
  for(const edge of edges.values()){
    const midpoint=points[edge.start].clone().add(points[edge.end]).multiplyScalar(.5);
    // Boundary edges are always outline candidates. Sharp creases can also become
    // outer contours; leaving them out would give a box no contour hierarchy.
    const normals=edge.normals.length===1?[edge.normals[0],edge.normals[0].clone().negate()]:edge.normals;
    for(let a=0;a<normals.length;a++)for(let b=a+1;b<normals.length;b++){
      const dot=normals[a].dot(normals[b]);if(dot>1-1e-7)continue;
      const isFeature=dot<threshold-1e-5?1:0;
      for(const point of [points[edge.start],points[edge.end]]){
        position.push(...point.toArray());normalA.push(...normals[a].toArray());normalB.push(...normals[b].toArray());center.push(...midpoint.toArray());feature.push(isFeature);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,values]of Object.entries({position,edgeNormalA:normalA,edgeNormalB:normalB,edgeCenter:center}))geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,3));
  geometry.setAttribute('edgeFeature',new THREE.Float32BufferAttribute(feature,1));
  geometry.computeBoundingSphere();geometry.userData.segmentCount=position.length/6;
  return geometry;
}

export function depthOnlyMaterial() {
  return new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
}

/** Constant CSS-pixel visible strokes; source segments become instanced two-triangle ribbons. */
export function ribbonGeometry(source) {
  const positions=source.getAttribute('position'),count=positions.count/2;
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,-1,1,0,1,1,0],3));
  geometry.setIndex([0,1,2,2,1,3]);geometry.instanceCount=count;
  for(const [name,sourceName,endpoint]of [['segmentStart','position',0],['segmentEnd','position',1],['edgeNormalA','edgeNormalA',0],['edgeNormalB','edgeNormalB',0],['edgeCenter','edgeCenter',0],['edgeFeature','edgeFeature',0]]){
    const attribute=source.getAttribute(sourceName);if(!attribute)continue;
    const size=attribute.itemSize,values=new Float32Array(count*size);
    for(let i=0;i<count;i++)for(let axis=0;axis<size;axis++)values[i*size+axis]=attribute.array[(i*2+endpoint)*size+axis];
    geometry.setAttribute(name,new THREE.InstancedBufferAttribute(values,size));
  }
  source.computeBoundingSphere();geometry.boundingSphere=source.boundingSphere.clone();
  return geometry;
}

export function lineMaterial({silhouette=false,hidden=false,ribbon=false}={}) {
  const defines={};if(silhouette)defines.SILHOUETTE=1;if(ribbon)defines.RIBBON=1;if(hidden)defines.HIDDEN=1;
  const width=silhouette?LINE_WIDTHS.contour:LINE_WIDTHS.crease;
  const material=new THREE.ShaderMaterial({
    defines,
    uniforms:{lineColor:{value:new THREE.Color()},lineOpacity:{value:1},resolution:{value:new THREE.Vector2(1,1)},lineWidth:{value:width}},
    vertexShader:`
      #ifdef RIBBON
      attribute vec3 segmentStart;
      attribute vec3 segmentEnd;
      uniform vec2 resolution;
      uniform float lineWidth;
      varying vec2 strokePointTimesW;
      varying float strokeW;
      varying float strokeLength;
      #endif
      #ifdef SILHOUETTE
      attribute vec3 edgeNormalA;
      attribute vec3 edgeNormalB;
      attribute vec3 edgeCenter;
      attribute float edgeFeature;
      varying float contour;
      #endif
      void main(){
        #ifdef SILHOUETTE
        vec3 viewPoint=(modelViewMatrix*vec4(edgeCenter,1.0)).xyz;
        vec3 towardCamera=normalize(-viewPoint);
        float first=dot(normalize(normalMatrix*edgeNormalA),towardCamera);
        float second=dot(normalize(normalMatrix*edgeNormalB),towardCamera);
        contour=first*second<=0.0?1.0:0.0;
        #ifdef HIDDEN
        // Sharp/boundary hidden edges already exist in the cached crease layer.
        if(edgeFeature>0.5)contour=0.0;
        #endif
        #endif
        #ifdef RIBBON
        vec4 start=projectionMatrix*modelViewMatrix*vec4(segmentStart,1.0);
        vec4 end=projectionMatrix*modelViewMatrix*vec4(segmentEnd,1.0);
        // The review camera stays outside the assembly. Guard clipped endpoints
        // so extreme manual zoom cannot create a viewport-sized ribbon.
        if(start.w<=0.0001||end.w<=0.0001){gl_Position=vec4(2.0,2.0,2.0,1.0);strokePointTimesW=vec2(1000.0);strokeW=1.0;strokeLength=0.0;return;}
        vec2 pixelDelta=(end.xy/end.w-start.xy/start.w)*resolution*0.5;
        float lengthPixels=length(pixelDelta);
        vec2 along=lengthPixels>0.0001?pixelDelta/lengthPixels:vec2(1.0,0.0);
        vec2 across=vec2(-along.y,along.x);
        float halfWidth=(lineWidth+${COVERAGE_WIDTH.toFixed(2)})*0.5;
        vec2 offset=across*position.x*halfWidth+along*(position.y*2.0-1.0)*halfWidth;
        vec4 projected=mix(start,end,position.y);
        projected.xy+=offset*2.0/resolution*projected.w;
        gl_Position=projected;
        // GLSL1 varyings interpolate perspective-correctly. Carry pixel distances
        // multiplied by clip W, then divide by the interpolated W in the fragment
        // shader to recover screen-linear coverage at both depths of the ribbon.
        strokePointTimesW=vec2(position.x*halfWidth,position.y*lengthPixels+(position.y*2.0-1.0)*halfWidth)*projected.w;
        strokeW=projected.w;
        strokeLength=lengthPixels;
        #else
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        #endif
      }`,
    fragmentShader:`
      uniform vec3 lineColor;
      uniform float lineOpacity;
      #ifdef RIBBON
      uniform float lineWidth;
      varying vec2 strokePointTimesW;
      varying float strokeW;
      varying float strokeLength;
      #endif
      #ifdef SILHOUETTE
      varying float contour;
      #endif
      void main(){
        #ifdef SILHOUETTE
        if(contour<0.5)discard;
        #endif
        float coverage=1.0;
        #ifdef RIBBON
        vec2 strokePoint=strokePointTimesW/strokeW;
        float beyond=max(0.0,max(-strokePoint.y,strokePoint.y-strokeLength));
        float distanceToStroke=length(vec2(strokePoint.x,beyond));
        coverage=1.0-smoothstep(max(0.0,lineWidth*0.5-${(COVERAGE_WIDTH*.5).toFixed(3)}),lineWidth*0.5+${(COVERAGE_WIDTH*.5).toFixed(3)},distanceToStroke);
        if(coverage<=0.0)discard;
        #endif
        gl_FragColor=vec4(lineColor,lineOpacity*coverage);
      }`,
    transparent:true,depthTest:true,depthWrite:false,depthFunc:hidden?THREE.GreaterDepth:THREE.LessEqualDepth,
    side:THREE.DoubleSide,forceSinglePass:true,toneMapped:false,
  });
  material.userData.cssLineWidth=width;return material;
}

export function createLineLayer(geometry,{silhouette=false,hidden=false}={}) {
  const material=lineMaterial({silhouette,hidden,ribbon:!hidden});
  return hidden?new THREE.LineSegments(geometry,material):new THREE.Mesh(ribbonGeometry(geometry),material);
}

export function setLineResolution(material,width,height,pixelRatio) {
  material.uniforms.resolution.value.set(Math.max(1,width),Math.max(1,height));
  material.uniforms.lineWidth.value=material.userData.cssLineWidth*pixelRatio;
}

/** Display-space colors: this overlay follows OutputPass and precedes antialiasing. */
export function setLineStyle(material,color,opacity) {
  material.uniforms.lineColor.value.setHex(parseInt(color.slice(1),16),THREE.LinearSRGBColorSpace);
  material.uniforms.lineOpacity.value=opacity;
}

/** Fresh depth is required because OutputPass swaps color buffers without copying depth. */
export class LineworkPass extends Pass {
  constructor(depthScene,lineScene,camera,flatScene=null) {
    super();this.depthScene=depthScene;this.lineScene=lineScene;this.flatScene=flatScene;this.camera=camera;this.needsSwap=false;
  }
  render(renderer,writeBuffer,readBuffer) {
    const target=renderer.getRenderTarget(),autoClear=renderer.autoClear;
    renderer.autoClear=false;
    try{
      renderer.setRenderTarget(this.renderToScreen?null:readBuffer);
      renderer.clearDepth();renderer.render(this.depthScene,this.camera);
      if(this.flatScene)renderer.render(this.flatScene,this.camera);
      renderer.render(this.lineScene,this.camera);
    }finally{renderer.autoClear=autoClear;renderer.setRenderTarget(target);}
  }
}
