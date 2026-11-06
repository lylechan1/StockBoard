(function(root) {
  function bounds(month) {
    const [y,m]=month.split('-').map(Number);
    return {start:`${month}-25`,end:`${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-05`};
  }
  function analyze(rows,month,threshold) {
    const {start,end}=bounds(month);
    const sorted=rows.filter(r=>r.close>0).slice().sort((a,b)=>a.date.localeCompare(b.date));
    const base=sorted.filter(r=>r.date<start).at(-1);
    const window=sorted.filter(r=>r.date>=start&&r.date<=end);
    if(!base||!window.length) return {start,end,window,base};
    let peak=base.close, maxDD=0,signal=null;
    const points=window.map(r=>{peak=Math.max(peak,r.close);const dd=(1-r.close/peak)*100;maxDD=Math.max(maxDD,dd);if(!signal&&dd>=threshold)signal=r;return {...r,dd,change:(r.close/base.close-1)*100};});
    const nextMonth=end.slice(0,7);
    const fixed=[`${month}-25`,`${nextMonth}-01`,end].map(d=>window.find(r=>r.date>=d)||null);
    const complete=sorted.at(-1)?.date>=end;
    const buy=signal?window.find(r=>r.date>signal.date)||null:complete?fixed[2]:null;
    return {start,end,window:points,base,maxDD,signal,buy,fixed,complete};
  }
  if(typeof module!=='undefined') module.exports={bounds,analyze};
  if(!root.document)return;
  const $=id=>document.getElementById(id),key='stockboard.spTiming.v1';
  let store={rules:{},logs:[]}, rows=[], source='',loadError='';
  try {const saved=JSON.parse(localStorage.getItem(key));if(saved&&saved.rules&&Array.isArray(saved.logs))store=saved;}catch{}
  const now=new Date(),ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=t=>Number(ny.find(p=>p.type===t).value);
  const current=new Date(Date.UTC(part('year'),part('month')-1-(part('day')<25?1:0),25));
  $('timingMonth').value=current.toISOString().slice(0,7);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=n=>Number.isFinite(n)?n.toFixed(2):'--';
  function persist() {try{localStorage.setItem(key,JSON.stringify(store));return true;}catch{$('timingMessage').textContent='保存失败：浏览器存储不可用，请导出记录。';return false;}}
  function render(){
    const month=$('timingMonth').value;if(!/^\d{4}-\d{2}$/.test(month))return;
    const rule=store.rules[month],threshold=rule?.threshold??Number($('timingThreshold').value);
    const a=analyze(rows,month,threshold);
    $('timingThreshold').disabled=Boolean(rule);
    $('timingSaveRule').disabled=Boolean(rule);
    $('timingSaveRule').textContent=rule?'本期规则已冻结':'保存本期规则';
    const last=a.window.at(-1);
    $('timingSummary').innerHTML=[['观察窗口',`${a.start} → ${a.end}`],['相对基准涨跌',last?`${num(last.change)}%`:'--'],['窗口最大收盘回撤',a.base&&last?`${num(a.maxDD)}%`:'--'],[`阈值 ${num(threshold)}%`,a.signal?`已触发 ${a.signal.date}`:'尚未触发 / 待数据']].map(([k,v])=>`<div><span class="label">${esc(k)}</span><strong style="font-size:${k==='观察窗口'?'14':'22'}px">${esc(v)}</strong></div>`).join('');
    if(last&&a.base){
      const vals=[0,...a.window.map(r=>r.change)],lo=Math.min(...vals)-.3,hi=Math.max(...vals)+.3;
      const x=i=>20+i*960/Math.max(a.window.length,1),y=v=>160-(v-lo)/(hi-lo)*140;
      const points=[`20,${y(0)}`,...a.window.map((r,i)=>`${x(i+1)},${y(r.change)}`)].join(' ');
      $('timingChart').innerHTML=`<svg viewBox="0 0 1000 180" role="img" aria-label="标普500窗口收盘走势，相对窗口前收盘涨跌"><line x1="20" x2="980" y1="${y(0)}" y2="${y(0)}" stroke="#ccd5e3" stroke-dasharray="4 4"/><polyline points="${points}" fill="none" stroke="var(--blue)" stroke-width="2.5"/>${a.window.map((r,i)=>`<circle cx="${x(i+1)}" cy="${y(r.change)}" r="4" fill="${a.signal?.date===r.date?'var(--amber)':'var(--blue)'}"><title>${r.date} 收盘 ${r.close}；基准涨跌 ${num(r.change)}%；回撤 ${num(r.dd)}%</title></circle>`).join('')}<text x="20" y="12" fill="#7b8492">${num(hi)}%</text><text x="20" y="178" fill="#7b8492">${num(lo)}%</text></svg><div>${a.base.date} 基准 ${num(a.base.close)} → ${last.date} ${num(last.close)} · ${esc(source)} · ${a.complete?'窗口已结束':'窗口未结束或数据尚未覆盖结束日'}</div>`;
    }else $('timingChart').textContent=loadError||'所选窗口缺少基准或完整日线，暂不计算。';
    const reference=a.fixed?.[2];
    $('timingComparison').innerHTML=[['阈值策略',a.buy,a.signal?.date],['固定25日',a.fixed?.[0]],['固定1日',a.fixed?.[1]],['固定5日',reference]].map(([label,r,signal])=>`<tr><td>${label}</td><td>${signal?signal+' / ':''}${r?.date||'待数据 / 无窗口内交易日'}</td><td>${num(r?.close)}</td><td>${r&&reference?num((reference.close/r.close-1)*100)+'%':'--'}</td></tr>`).join('');
    $('timingLogs').innerHTML=[...(rule?[{at:rule.at,text:`冻结规则：回撤 ${rule.threshold}%；下一交易日收盘执行；固定25/1/5日对照；${rule.late?'窗口开始后登记，仅作回顾':'窗口开始前登记'}`}]:[]),...store.logs.filter(l=>l.month===month)].map(l=>`<div class="timing-log">${esc(l.at)} · ${esc(l.text)}</div>`).join('')||'<small>尚无日志；规则请在窗口开始前冻结。</small>';
  }
  $('timingMonth').addEventListener('change',()=>{$('timingThreshold').value=store.rules[$('timingMonth').value]?.threshold??2;render();});
  $('timingThreshold').addEventListener('input',render);
  $('timingSaveRule').addEventListener('click',()=>{
    if(!$('timingMonth').reportValidity()||!$('timingThreshold').reportValidity())return;
    const month=$('timingMonth').value;if(store.rules[month])return;
    store.rules[month]={threshold:Number($('timingThreshold').value),at:new Date().toISOString(),late:new Date().toISOString().slice(0,10)>=bounds(month).start};
    if(persist()){$('timingMessage').textContent='本期规则已保存并冻结。';render();}
  });
  $('timingLogForm').addEventListener('submit',e=>{e.preventDefault();const month=$('timingMonth').value,{start,end}=bounds(month),date=$('timingLogDate').value;if(date<start||date>end){$('timingMessage').textContent='执行日期需处于所选25日至次月5日窗口。';return;}store.logs.push({month,at:new Date().toISOString(),text:`实际执行 ${date}；买入价/净值 ${$('timingLogPrice').value}；${$('timingLogNote').value}`});if(persist()){render();$('timingMessage').textContent='执行日志已保存。';}});
  $('timingExport').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(store,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='sp500-timing-log.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  async function load(){try{const res=await fetch('/api/sp-timing',{cache:'no-store'});if(!res.ok)throw Error('标普日线接口暂不可用');const data=await res.json();rows=data.rows;source=data.source;loadError='';}catch(e){loadError=e.message+'；保留规则及日志，等待重试。';}render();}
  $('timingThreshold').value=store.rules[$('timingMonth').value]?.threshold??2;
  render();load();setInterval(load,60000);$('refreshBtn').addEventListener('click',load);
})(typeof window==='undefined'?globalThis:window);
