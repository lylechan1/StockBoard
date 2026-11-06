const {test}=require('node:test');
const assert=require('node:assert/strict');
const {bounds,analyze}=require('../public/sp-timing');
test('December window crosses year boundary',()=>assert.deepEqual(bounds('2026-12'),{start:'2026-12-25',end:'2027-01-05'}));
test('first threshold uses next close, never same-day hindsight',()=>{
 const a=analyze([{date:'2026-10-23',close:100},{date:'2026-10-26',close:101},{date:'2026-10-27',close:97},{date:'2026-10-28',close:98},{date:'2026-11-02',close:99},{date:'2026-11-05',close:100}], '2026-10',2);
 assert.equal(a.signal.date,'2026-10-27');assert.equal(a.buy.date,'2026-10-28');assert.equal(a.fixed[0].date,'2026-10-26');assert.equal(a.fixed[1].date,'2026-11-02');assert.equal(a.fixed[2].close,100);
});
test('no price after window used for holiday fifth; no buy before signal execution',()=>{
 const a=analyze([{date:'2026-11-24',close:100},{date:'2026-11-25',close:99},{date:'2026-12-04',close:95},{date:'2026-12-07',close:90}],'2026-11',2);
 assert.equal(a.buy,null);assert.equal(a.fixed[2],null);assert.equal(a.complete,true);
});
test('missing baseline and unfinished untriggered window do not invent trades',()=>{
 assert.equal(analyze([{date:'2026-10-26',close:100}],'2026-10',2).base,undefined);
 assert.equal(analyze([{date:'2026-10-23',close:100},{date:'2026-10-26',close:100}],'2026-10',2).buy,null);
});
const {archivePeriod,summarize,nyDate}=require('../public/sp-timing');
const bars=[{date:'2026-10-23',close:100},{date:'2026-10-26',close:97},{date:'2026-10-27',close:96},{date:'2026-11-05',close:100},{date:'2026-11-06',close:101}];
const rule={threshold:2,at:'2026-10-24T12:00:00Z',late:false};
test('archive waits for post-window data and preserves complete prices',()=>{
 assert.equal(archivePeriod(bars.slice(0,-1),'2026-10',rule,'test','now'),null);
 const a=archivePeriod(bars,'2026-10',rule,'test','now');
 assert.equal(a.eligible,true);assert.equal(a.result.buy.date,'2026-10-27');assert.equal(a.rows.length,5);
 assert.equal(analyze(a.rows,'2026-10',2).buy.close,96);
 assert.equal(archivePeriod(bars.slice(1),'2026-10',rule,'test','now'),null);
});
test('late rules separated; missing execution excluded; zero is not a win',()=>{
 const a=archivePeriod(bars,'2026-10',rule,'test','now');
 const late=archivePeriod(bars,'2026-10',{...rule,at:'2026-11-06T12:00:00Z'},'test','now');
 assert.equal(late.eligible,false);
 const stats=summarize([a,{...a,result:{...a.result,difference:0}},{...a,result:{...a.result,difference:null}},late]);
 assert.equal(stats.length,2);assert.equal(stats[0].total,3);assert.equal(stats[0].comparable,2);assert.equal(stats[0].winRate,50);assert.equal(stats[0].worst,0);
});
test('American date correctly classifies pre-window registration',()=>assert.equal(nyDate('2026-10-25T01:00:00Z'),'2026-10-24'));
