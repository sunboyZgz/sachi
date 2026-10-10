/** Analytic fold and receiver shadow adapted from blog-peel-shadow-refined-v3. */
export const vertexShader = `attribute vec2 pos; varying vec2 uv; void main(){uv=vec2(pos.x*.5+.5,.5-pos.y*.5);gl_Position=vec4(pos,0.,1.);}`;

export const fragmentShader = `
precision highp float;
varying vec2 uv;
uniform sampler2D page;
uniform vec3 paperColorToken;
uniform vec3 cutEdgeColor;
uniform float cutEdgeWidth;
uniform float rasterScale;
uniform sampler2D shadowMap;
uniform float renderShadow;
uniform vec2 size;
uniform vec2 axis;
uniform float crease;
uniform float radius;
uniform float progress;
const float softSize=.21;
const float PI=3.141592653589793;
// Projection deliberately retained from v2, not changed to make the A/B look better.
const vec2 viewSkew=vec2(-.11,.12);
// Consistent soft light from upper-left. These are projected slopes, not pixels.
const vec2 castSkew=vec2(.32,.26);
float inside(vec2 p){return step(0.,p.x)*step(0.,p.y)*step(p.x,size.x)*step(p.y,size.y);}
float softInside(vec2 p,float w){
 return smoothstep(-w,w,p.x)*smoothstep(-w,w,p.y)*
 smoothstep(-w,w,size.x-p.x)*smoothstep(-w,w,size.y-p.y);
}
// Intersect a ray x(screen)=x(world)+skew*z with the rolled half-cylinder.
// Return z, theta and the original unfolded source coordinates.
vec4 cylinderRoot(vec2 screen,vec2 skew,float signRoot){
 float r=dot(screen,axis)-crease, k=dot(skew,axis);
 float b=r*k+radius, den=1.+k*k;
 // Factored roots avoid subtracting nearly equal squares at a grazing ray.
 float extent=sqrt(den);
 float disc=(radius*(k+extent)-r)*(r-radius*(k-extent));
 if(disc<0.)return vec4(-1.);
 float z=(b+signRoot*sqrt(max(disc,0.)))/den;
 if(z<0.||z>2.*radius)return vec4(-1.);
 float u=r-k*z;
 if(u<0.)return vec4(-1.);
 float theta=atan(max(u,0.),radius-z);
 vec2 original=screen-skew*z+axis*(radius*theta-u);
 return vec4(z,theta,original);
}
// Invert the projected sheet's analytic Jacobian. Distances to the four
// original free edges are then expressed in CSS pixels, not texture pixels.
float freeEdgeDistance(vec4 hit){
 float theta=hit.y;
 vec2 v=axis*(cos(theta)-1.)+viewSkew*sin(theta);
 float determinant=1.+dot(v,axis);
 float divisor=(determinant>=0.?1.:-1.)*max(abs(determinant),.0001);
 vec2 gradientX=vec2(1.,0.)-v.x*axis/divisor;
 vec2 gradientY=vec2(0.,1.)-v.y*axis/divisor;
 float feather=.5/rasterScale;
 // At a grazing tangent, the cylinder's quadratic sag bounds a pixel's
 // source footprint. An internal fold silhouette must never become a free edge.
 float footprint=sqrt(2.*radius*(cutEdgeWidth+feather))/(cutEdgeWidth+feather);
 vec2 gradient=min(vec2(length(gradientX),length(gradientY)),vec2(max(1.,footprint)));
 vec2 distance=min(hit.zw,size-hit.zw)/max(gradient,vec2(.0001));
 return min(distance.x,distance.y);
}
// Padding is used only to locate a pixel footprint that straddles a free edge.
// Strict queries retain the original geometry for receiver shadows and depth.
bool containsSheet(vec4 hit,float padding){
 if(hit.x<0.)return false;
 if(padding<=0.)return inside(hit.zw)>.5;
 return freeEdgeDistance(hit)>=-padding;
}
// Bounded actual sheet, including the flat flipped portion. Return its highest
// visible point. No overlapping translucent triangle strips = no diagonal seams.
vec4 surfaceWithPadding(vec2 screen,float padding,float ceiling){
 float r=dot(screen,axis)-crease;
 vec4 hit=vec4(-1.,0.,0.,0.);
 if(r<=0. && inside(screen)>.5 && ceiling>0.)hit=vec4(0.,0.,screen);
 float z=2.*radius; vec2 world=screen-viewSkew*z;
 float u=dot(world,axis)-crease;
 vec2 q=world+axis*(PI*radius-2.*u);
 if(u<=0. && z<ceiling && containsSheet(vec4(z,PI,q),padding))hit=vec4(z,PI,q);
 vec4 a=cylinderRoot(screen,viewSkew,1.);
 if(a.x>hit.x && a.x<ceiling && containsSheet(a,padding))hit=a;
 vec4 b=cylinderRoot(screen,viewSkew,-1.);
 if(b.x>hit.x && b.x<ceiling && containsSheet(b,padding))hit=b;
 return hit;
}
vec4 surface(vec2 screen){return surfaceWithPadding(screen,0.,1000000.);}
// Per-ray occlusion evaluated against the SAME fold geometry used to draw paper.
// A tiny analytic edge filter avoids binary light-sample steps on projected edges.
float blocker(vec2 receiver,vec2 skew){
 float top=2.*radius;
 vec2 world=receiver-skew*top;
 float u=dot(world,axis)-crease;
 vec2 q=world+axis*(PI*radius-2.*u);
 float w=.8+top*.025;
 float best=(1.-smoothstep(-w,w,u))*softInside(q,w)*(.075+.17*exp(-top/65.));
 float k=dot(skew,axis);
 float outer=radius*(sqrt(1.+k*k)+k);
 float gap=dot(receiver,axis)-crease-outer;
 float silhouetteWidth=.9+radius*.024;
 float roundCoverage=1.-smoothstep(-silhouetteWidth,silhouetteWidth,gap);
 vec2 adjusted=receiver-axis*max(0.,gap+.005);
 for(int j=0;j<2;j++){
  vec4 h=cylinderRoot(adjusted,skew,j==0?1.:-1.);
  if(h.x>.45){
   float edge=.65+h.x*.023;
   float coverage=softInside(h.zw,edge);
   float contact=.075+.17*exp(-h.x/65.);
   best=max(best,coverage*roundCoverage*contact*smoothstep(.45,1.8,h.x));
  }
 }
 return best;
}
float computeShadow(vec2 receiver){
 float result=0.;
 // Stable quadrature, not noise that changes every frame. Penumbra grows with
 // the blocker/receiver separation, because rays diverge from an area source.
 for(int i=0;i<32;i++){
  float fi=float(i)+.5;
  float rad=sqrt(fi/32.);
  float a=fi*2.3999632297;
  vec2 disk=vec2(cos(a),sin(a))*rad;
  result+=blocker(receiver,castSkew+disk*softSize);
 }
 return clamp(result/32.,0.,.26);
}
vec4 shadowAt(vec2 pixel){
 vec2 coordinate=pixel/size;
 float alpha=texture2D(shadowMap,vec2(coordinate.x,1.-coordinate.y)).r;
 return vec4(vec3(.23,.24,.215)*alpha,alpha);
}
// Point shading stays sharp. Coverage is integrated separately at visible contours.
vec4 paintSurface(vec2 pixel,vec4 hit){
 if(hit.x<.02)return shadowAt(pixel);
 float theta=hit.y;
 vec3 normal=vec3(-axis*sin(theta),cos(theta));
 vec3 eye=normalize(vec3(-viewSkew,1.));
 bool front=dot(normal,eye)>=0.;
 if(!front)normal=-normal;
 vec3 light=normalize(vec3(-castSkew,1.));
 float lambert=max(0.,dot(normal,light));
 float ratio=(.85+.15*lambert)/(.85+.15*light.z);
 vec3 c=front?texture2D(page,hit.zw/size).rgb:paperColorToken;
 float distance=freeEdgeDistance(hit);
 float feather=.5/rasterScale;
 float cut=(1.-smoothstep(cutEdgeWidth-feather,cutEdgeWidth+feather,distance))*smoothstep(.02,2.,hit.x);
 c=mix(c,cutEdgeColor,cut);
 vec3 linear=pow(c,vec3(2.2))*ratio*(front?1.:.96);
 c=pow(max(linear,vec3(0.)),vec3(1./2.2));
 return vec4(c,1.);
}
float silhouetteGap(vec2 pixel){
 float k=dot(viewSkew,axis);
 return dot(pixel,axis)-crease-radius*(sqrt(1.+k*k)+k);
}
// A subpixel cell covers both sides of the true contour. The surface below is
// shaded independently, so fractional occlusion does not erase an underlying fold.
vec4 coveredSurface(vec2 pixel,float halfCell){
 float gap=silhouetteGap(pixel);
 vec2 evaluation=pixel;
 if(abs(gap)<halfCell)evaluation-=axis*max(0.,gap+.002);
 vec4 hit=surfaceWithPadding(evaluation,halfCell,1000000.);
 if(hit.x<.02)return shadowAt(pixel);
 float coverage=clamp(.5+freeEdgeDistance(hit)/(2.*halfCell),0.,1.);
 coverage*=clamp(.5-gap/(2.*halfCell),0.,1.);
 vec4 top=paintSurface(pixel,hit);
 if(coverage>=1.)return top;
 vec4 underneath=paintSurface(pixel,surfaceWithPadding(pixel,0.,hit.x-.001));
 return top*coverage+underneath*(1.-coverage);
}
void main(){
 if(progress>=1.){gl_FragColor=vec4(0.);return;}
 if(progress<=0.){gl_FragColor=texture2D(page,uv);return;}
 vec2 pixel=uv*size;
 vec4 hit=surface(pixel);
 if(renderShadow>.5){
  // Keep the receiver field continuous across the contour: a binary paper
  // mask here turns the half-resolution reconstruction into visible stairs.
  // Only skip receivers well inside opaque paper, outside the filter footprint.
  bool coveredInterior=hit.x>.02 && silhouetteGap(pixel)<-8. && freeEdgeDistance(hit)>8.;
  float a=coveredInterior?0.:computeShadow(pixel);
  gl_FragColor=vec4(a,a,a,1.);return;
 }
 float span=1./rasterScale;
 vec4 nearby=hit.x>.02?hit:surfaceWithPadding(pixel,span,1000000.);
 bool contour=abs(silhouetteGap(pixel))<1.5*span;
 if(nearby.x>.02)contour=contour||abs(freeEdgeDistance(nearby))<cutEdgeWidth+1.5*span;
 if(!contour){gl_FragColor=paintSurface(pixel,hit);return;}
 // Stable 2x2 quadrature with analytic coverage inside each cell. Only the
 // narrow contour band takes this path; live DOM and interior type stay sharp.
 vec4 color=vec4(0.);
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){
  vec2 offset=(vec2(float(x),float(y))-.5)*span*.5;
  color+=coveredSurface(pixel+offset,span*.25);
 }
 gl_FragColor=color*.25;
}`;
