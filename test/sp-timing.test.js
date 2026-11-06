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
