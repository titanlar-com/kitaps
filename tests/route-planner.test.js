import test from 'node:test';
import assert from 'node:assert/strict';
import {haversineKm,orderStops,routeLengthKm,suggestNextRoute} from '../src/routes/planner.js';

// Approximate shop positions, only as a fixed example: data/bookstores.json holds no coordinates.
const coords={
 'minoa-pera':{lat:41.0326,lng:28.9750},
 'mephisto-beyoglu':{lat:41.0337,lng:28.9777},
 'homer-galatasaray':{lat:41.0318,lng:28.9790},
 'pandora-nisantasi':{lat:41.0510,lng:28.9930},
 'dr-kanyon':{lat:41.0780,lng:29.0110},
 'imge-kadikoy':{lat:40.9905,lng:29.0260},
};
const ids=Object.keys(coords);
const permutations=list=>list.length<2?[list]:list.flatMap((item,index)=>permutations([...list.slice(0,index),...list.slice(index+1)]).map(rest=>[item,...rest]));
const sorted=list=>[...list].sort();

test('haversine gives great-circle kilometres',()=>{
 assert.ok(Math.abs(haversineKm({lat:0,lng:0},{lat:0,lng:1})-111.195)<0.01);
 assert.equal(haversineKm(coords['minoa-pera'],coords['minoa-pera']),0);
 const there=haversineKm(coords['minoa-pera'],coords['imge-kadikoy']);
 assert.equal(there,haversineKm(coords['imge-kadikoy'],coords['minoa-pera']));
 assert.ok(there>6.2&&there<6.5,`Tepebaşı to Kadıköy is about 6.3 km in a straight line, got ${there}`);
});

test('routeLengthKm sums the legs and skips stops without coordinates',()=>{
 const legs=haversineKm(coords['minoa-pera'],coords['mephisto-beyoglu'])+haversineKm(coords['mephisto-beyoglu'],coords['homer-galatasaray']);
 assert.ok(Math.abs(routeLengthKm(['minoa-pera','mephisto-beyoglu','homer-galatasaray'],coords)-legs)<1e-9);
 assert.ok(Math.abs(routeLengthKm(['minoa-pera','yeni-dukkan','mephisto-beyoglu','homer-galatasaray'],coords)-legs)<1e-9);
 assert.equal(routeLengthKm([],coords),0);
 assert.equal(routeLengthKm(['minoa-pera'],coords),0);
});

test('on a fixed six-shop Istanbul example the order is never longer than the input and keeps the first stop',()=>{
 const scattered=['minoa-pera','imge-kadikoy','mephisto-beyoglu','dr-kanyon','homer-galatasaray','pandora-nisantasi'];
 const ordered=orderStops(Object.freeze([...scattered]),coords);
 assert.equal(ordered[0],'minoa-pera');
 assert.deepEqual(sorted(ordered),sorted(scattered),'no stop is added or dropped');
 assert.ok(routeLengthKm(ordered,coords)<routeLengthKm(scattered,coords)-5,'a zigzag across the Bosphorus gets much shorter');
 for(const order of permutations(ids)){
  const result=orderStops(order,coords);
  const shortest=Math.min(...permutations(order.slice(1)).map(rest=>routeLengthKm([order[0],...rest],coords)));
  assert.equal(result[0],order[0]);
  assert.ok(routeLengthKm(result,coords)<=routeLengthKm(order,coords)+1e-9,order.join(' → '));
  assert.ok(Math.abs(routeLengthKm(result,coords)-shortest)<1e-9,`shortest order from ${order[0]}`);
 }
 // Without keepFirst any shop may start, so the path is at most as long.
 const free=orderStops(scattered,coords,{keepFirst:false});
 assert.deepEqual(sorted(free),sorted(scattered));
 assert.ok(routeLengthKm(free,coords)<=routeLengthKm(ordered,coords)+1e-9);
 // A Map works as well as a plain object.
 assert.deepEqual(orderStops(scattered,new Map(Object.entries(coords))),ordered);
});

test('stops without coordinates keep their order at the end; a pinned first stop stays first',()=>{
 const ordered=orderStops(['minoa-pera','yeni-dukkan','imge-kadikoy','bilinmeyen','homer-galatasaray'],coords);
 assert.deepEqual(ordered,['minoa-pera','homer-galatasaray','imge-kadikoy','yeni-dukkan','bilinmeyen']);
 const pinned=orderStops(['bilinmeyen','imge-kadikoy','yeni-dukkan','minoa-pera','homer-galatasaray'],coords);
 assert.equal(pinned[0],'bilinmeyen','keepFirst keeps the chosen start even without coordinates');
 assert.deepEqual(pinned.slice(-1),['yeni-dukkan']);
 assert.deepEqual(sorted(pinned),sorted(['bilinmeyen','imge-kadikoy','yeni-dukkan','minoa-pera','homer-galatasaray']));
 assert.deepEqual(orderStops(['bilinmeyen','yeni-dukkan'],coords,{keepFirst:false}),['bilinmeyen','yeni-dukkan']);
 assert.deepEqual(orderStops([],coords),[]);
 assert.deepEqual(orderStops(['minoa-pera'],coords),['minoa-pera']);
 assert.deepEqual(orderStops(['constructor','minoa-pera'],coords,{keepFirst:false}),['minoa-pera','constructor'],'an id named like an Object method has no coordinates');
});

test('suggestNextRoute picks the nearest unplanned open shops in visiting order',()=>{
 const nearby={
  ...coords,
  'ykks-galatasaray':{lat:41.0336,lng:28.9774},
  'is-kultur-taksim':{lat:41.0360,lng:28.9810},
  'robinson-crusoe':{lat:41.0300,lng:28.9750},
  'pandora-beyoglu':{lat:41.0338,lng:28.9776},
  'nezih-bostanci':{lat:40.9530,lng:29.0950},
 };
 const stores=[
  {id:'minoa-pera',status:'open'},{id:'mephisto-beyoglu',status:'open'},{id:'homer-galatasaray',status:'open'},
  {id:'imge-kadikoy',status:'open'},{id:'nezih-bostanci',status:'open'},{id:'dr-kanyon',status:'open'},
  {id:'ykks-galatasaray',status:'open'},{id:'is-kultur-taksim',status:'open'},{id:'robinson-crusoe',status:'open'},
  {id:'pandora-beyoglu',status:'closed'},{id:'kirmizi-kedi-tunel',status:'unverified'},{id:'yeni-dukkan',status:'open'},
 ];
 const planned=['minoa-pera','mephisto-beyoglu','homer-galatasaray'];
 const suggestion=suggestNextRoute(stores,planned,nearby);
 assert.deepEqual(sorted(suggestion),['is-kultur-taksim','robinson-crusoe','ykks-galatasaray']);
 assert.ok(routeLengthKm(suggestion,nearby)<=Math.min(...permutations(suggestion).map(order=>routeLengthKm(order,nearby)))+1e-9,'in visiting order');
 assert.ok(!suggestion.includes('pandora-beyoglu'),'a closed shop is never suggested');
 assert.equal(suggestNextRoute(stores,planned,nearby,2).length,2);
 assert.deepEqual(suggestNextRoute(stores,new Set(planned),nearby),suggestion,'any iterable of planned ids works');
 const everythingPlanned=stores.map(store=>store.id).filter(id=>id!=='nezih-bostanci');
 assert.deepEqual(suggestNextRoute(stores,everythingPlanned,nearby),[],'one shop is not a route');
 assert.deepEqual(suggestNextRoute([],[],nearby),[]);
});
