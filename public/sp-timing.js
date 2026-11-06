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
  function nyDate(at) {
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));
    return ['year','month','day'].map(t=>parts.find(p=>p.type===t).value).join('-');
  }
  function archivePeriod(rows,month,rule,source,at) {
    if(!rule||!Number.isFinite(rule.threshold)||rule.threshold<=0)return null;
    const a=analyze(rows,month,rule.threshold);
    // Require a post-window bar, and a nearby baseline; never archive a partial in-flight window.
    const after=rows.some(r=>r.date>a.end&&r.close>0);
    const gap=a.base?(Date.parse(a.start)-Date.parse(a.base.date))/86400000:Infinity;
    const firstGap=a.window.length?(Date.parse(a.window[0].date)-Date.parse(a.start))/86400000:Infinity;
    if(!after||!a.base||!a.window.length||gap>7||firstGap>7)return null;
    const eligible=Boolean(rule.at)&&nyDate(rule.at)<a.start&&!rule.late;
    return {version:1,month,archivedAt:at,source,rule:{...rule},eligible,
      rows:[a.base,...a.window.map(({date,close})=>({date,close})),...rows.filter(r=>r.date>a.end).slice(0,1)],
      result:{signal:a.signal?.date||null,buy:a.buy||null,fixed:a.fixed,maxDD:a.maxDD,
        difference:a.buy&&a.fixed[2]?(a.fixed[2].close/a.buy.close-1)*100:null}};
  }
  function summarize(archives) {
    const groups={};
    for(const a of archives){
      const key=`${a.eligible?'事前实验':'事后回顾'} / ${a.rule.threshold}%`;
      const g=groups[key]||(groups[key]={label:key,total:0,triggered:0,values:[]});
      g.total++;if(a.result.signal)g.triggered++;
      if(Number.isFinite(a.result.difference))g.values.push(a.result.difference);
    }
    return Object.values(groups).map(g=>({...g,comparable:g.values.length,
      winRate:g.values.length?g.values.filter(v=>v>0).length/g.values.length*100:null,
      mean:g.values.length?g.values.reduce((a,b)=>a+b,0)/g.values.length:null,
      worst:g.values.length?Math.min(...g.values):null}));
  }
  if(typeof module!=='undefined') module.exports={bounds,analyze,archivePeriod,summarize,nyDate};
  if(!root.document)return;
  const $=id=>document.getElementById(id),key='stockboard.spTiming.v1';
  let store={rules:{},logs:[],archives:{}}, rows=[], source='',loadError='';
  try {const saved=JSON.parse(localStorage.getItem(key));if(saved&&saved.rules&&Array.isArray(saved.logs))store=saved;}catch{}
  store.archives=store.archives||{};
  const now=new Date(),ny=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=t=>Number(ny.find(p=>p.type===t).value);
  const current=new Date(Date.UTC(part('year'),part('month')-1-(part('day')<25?1:0),25));
  $('timingMonth').value=current.toISOString().slice(0,7);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=n=>Number.isFinite(n)?n.toFixed(2):'--';
  let committed=JSON.stringify(store);
  function persist() {try{localStorage.setItem(key,JSON.stringify(store));committed=JSON.stringify(store);return true;}catch{store=JSON.parse(committed);$('timingMessage').textContent='保存失败：浏览器存储不可用，请导出记录。';return false;}}
  function render(){
    const month=$('timingMonth').value;if(!/^\d{4}-\d{2}$/.test(month))return;
    const rule=store.rules[month],threshold=rule?.threshold??Number($('timingThreshold').value);
    const archived=store.archives[month];
    const a=analyze(archived?.rows||rows,month,threshold);
    $('timingThreshold').disabled=Boolean(rule);
    $('timingSaveRule').disabled=Boolean(rule);
    $('timingSaveRule').textContent=rule?'本期规则已冻结':'保存本期规则';
    const last=a.window.at(-1);
    $('timingSummary').innerHTML=[['观察窗口',`${a.start} → ${a.end}`],['相对基准涨跌',last?`${num(last.change)}%`:'--'],['窗口最大收盘回撤',a.base&&last?`${num(a.maxDD)}%`:'--'],[`阈值 ${num(threshold)}%`,a.signal?`已触发 ${a.signal.date}`:archived?'窗口结束 · 未触发':'尚未触发 / 待数据']].map(([k,v])=>`<div><span class="label">${esc(k)}</span><strong style="font-size:${k==='观察窗口'?'14':'22'}px">${esc(v)}</strong></div>`).join('');
    if(last&&a.base){
      const vals=[0,...a.window.map(r=>r.change)],lo=Math.min(...vals)-.3,hi=Math.max(...vals)+.3;
      const x=i=>20+i*960/Math.max(a.window.length,1),y=v=>160-(v-lo)/(hi-lo)*140;
      const points=[`20,${y(0)}`,...a.window.map((r,i)=>`${x(i+1)},${y(r.change)}`)].join(' ');
      $('timingChart').innerHTML=`<svg viewBox="0 0 1000 180" role="img" aria-label="标普500窗口收盘走势，相对窗口前收盘涨跌"><line x1="20" x2="980" y1="${y(0)}" y2="${y(0)}" stroke="#ccd5e3" stroke-dasharray="4 4"/><polyline points="${points}" fill="none" stroke="var(--blue)" stroke-width="2.5"/>${a.window.map((r,i)=>`<circle cx="${x(i+1)}" cy="${y(r.change)}" r="4" fill="${a.signal?.date===r.date?'var(--amber)':'var(--blue)'}"><title>${r.date} 收盘 ${r.close}；基准涨跌 ${num(r.change)}%；回撤 ${num(r.dd)}%</title></circle>`).join('')}<text x="20" y="12" fill="#7b8492">${num(hi)}%</text><text x="20" y="178" fill="#7b8492">${num(lo)}%</text></svg><div>${a.base.date} 基准 ${num(a.base.close)} → ${last.date} ${num(last.close)} · ${esc(archived?.source||source)} · ${a.complete?'窗口已结束':'窗口未结束或数据尚未覆盖结束日'}</div>`;
    }else $('timingChart').textContent=loadError||'所选窗口缺少基准或完整日线，暂不计算。';
    const reference=a.fixed?.[2];
    $('timingComparison').innerHTML=[['阈值策略',a.buy,a.signal?.date],['固定25日',a.fixed?.[0]],['固定1日',a.fixed?.[1]],['固定5日',reference]].map(([label,r,signal])=>`<tr><td>${label}</td><td>${signal?signal+' / ':''}${r?.date||'待数据 / 无窗口内交易日'}</td><td>${num(r?.close)}</td><td>${r&&reference?num((reference.close/r.close-1)*100)+'%':'--'}</td></tr>`).join('');
    renderHistory();
    $('timingLogs').innerHTML=[...(rule?[{at:rule.at,text:`冻结规则：回撤 ${rule.threshold}%；下一交易日收盘执行；固定25/1/5日对照；${rule.late?'窗口开始后登记，仅作回顾':'窗口开始前登记'}`}]:[]),...store.logs.filter(l=>l.month===month)].map(l=>`<div class="timing-log">${esc(l.at)} · ${esc(l.text)}</div>`).join('')||'<small>尚无日志；规则请在窗口开始前冻结。</small>';
  }
  $('timingMonth').addEventListener('change',()=>{$('timingThreshold').value=store.rules[$('timingMonth').value]?.threshold??2;render();});
  $('timingThreshold').addEventListener('input',render);
  $('timingSaveRule').addEventListener('click',()=>{
    if(!$('timingMonth').reportValidity()||!$('timingThreshold').reportValidity())return;
    const month=$('timingMonth').value;if(store.rules[month])return;
    store.rules[month]={threshold:Number($('timingThreshold').value),at:new Date().toISOString(),late:nyDate(new Date())>=bounds(month).start};
    if(persist()){$('timingMessage').textContent='本期规则已保存并冻结。';autoArchive();render();}
  });
  $('timingLogForm').addEventListener('submit',e=>{
    e.preventDefault();const month=$('timingMonth').value,{start,end}=bounds(month),date=$('timingLogDate').value;
    if(!store.rules[month]){$('timingMessage').textContent='请先保存本期规则，再记录执行。';return;}
    if(date<start||date>end||date>nyDate(new Date())){$('timingMessage').textContent='执行日期需在所选窗口内，且不能晚于今天（美东）。';return;}
    const price=Number($('timingLogPrice').value),ref=$('timingLogReference').value?Number($('timingLogReference').value):null;
    if(!(price>0)||(ref!==null&&!(ref>0)))return;
    const at=new Date().toISOString(),note=$('timingLogNote').value;
    store.logs.push({id:at+'-'+Math.random().toString(36).slice(2),month,at,date,price,reference:ref,note,
      text:`实际执行 ${date}；买入价/净值 ${price}；同一标的5日对照 ${ref??'未填'}；${note}`});
    if(persist()){render();$('timingMessage').textContent='执行记录已保存，分析已更新。';}
  });
  function autoArchive(){
    let changed=false;
    for(const [month,rule] of Object.entries(store.rules)){
      if(store.archives[month])continue;
      const archive=archivePeriod(rows,month,rule,source,new Date().toISOString());
      if(archive){store.archives[month]=archive;changed=true;}
    }
    if(changed&&persist())$('timingMessage').textContent='已自动归档数据齐全的已结束窗口。';
  }
  function renderHistory(){
    const archives=Object.values(store.archives).sort((a,b)=>b.month.localeCompare(a.month));
    const groups=summarize(archives);
    $('timingHistorySummary').innerHTML=groups.length?`<table><thead><tr><th>样本组</th><th>归档 / 可比</th><th>触发率</th><th>胜率</th><th>平均份额差</th><th>最差一期</th></tr></thead><tbody>${groups.map(g=>`<tr><td>${esc(g.label)}</td><td>${g.total} / ${g.comparable}</td><td>${num(g.triggered/g.total*100)}%</td><td>${num(g.winRate)}%</td><td>${num(g.mean)}%</td><td>${num(g.worst)}%</td></tr>`).join('')}</tbody></table>`:'<p class="timing-note">暂无已归档样本。保存本期规则后，窗口结束且接口提供结束日之后的日线时自动归档。历史月份现在补存规则，将标为事后回顾。</p>';
    $('timingArchiveRows').innerHTML=Object.keys(store.rules).sort().reverse().map(month=>{
      const a=store.archives[month];return `<tr><td><button type="button" data-timing-month="${esc(month)}">${esc(month)}</button></td><td>${a?(a.eligible?'已归档 · 事前':'已归档 · 回顾'):'待结束 / 待完整日线'}</td><td>${num(store.rules[month].threshold)}%</td><td>${a?.result.signal||'--'}</td><td>${a?.result.buy?.date||'--'}</td><td>${num(a?.result.difference)}${Number.isFinite(a?.result.difference)?'%':''}</td></tr>`;
    }).join('')||'<tr><td colspan="6">尚未保存规则</td></tr>';
    const logs=store.logs.filter(l=>l.month===$('timingMonth').value);
    $('timingActual').innerHTML=logs.length?logs.map(l=>{
      const paired=l.price>0&&l.reference>0;
      return `<div class="timing-log">${esc(l.date||'旧版记录')} · ${paired?`同金额份额差 ${num((l.reference/l.price-1)*100)}%`:'待补同一标的5日净值，暂不计算份额差'}${l.id?` <button type="button" data-timing-edit="${esc(l.id)}">补充对照净值</button>`:''}</div>`;
    }).join(''):'<small>当前窗口暂无执行记录。每条按一次执行单独比较，多笔不合并为月度收益。</small>';
  }
  $('timingArchiveRows').addEventListener('click',e=>{const month=e.target.dataset.timingMonth;if(month){$('timingMonth').value=month;$('timingThreshold').value=store.rules[month].threshold;render();}});
  let editingId=null;
  $('timingActual').addEventListener('click',e=>{const id=e.target.dataset.timingEdit;if(!id)return;editingId=id;$('timingPairForm').hidden=false;$('timingPairPrice').value=store.logs.find(l=>l.id===id)?.reference||'';});
  $('timingPairForm').addEventListener('submit',e=>{e.preventDefault();const log=store.logs.find(l=>l.id===editingId),price=Number($('timingPairPrice').value);if(log&&price>0){log.reference=price;log.updatedAt=new Date().toISOString();log.text=`实际执行 ${log.date}；买入价/净值 ${log.price}；同一标的5日对照 ${price}；${log.note||''}`;if(persist()){$('timingPairForm').hidden=true;render();}}});
  $('timingExport').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(store,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='sp500-timing-log.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('timingImport').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>5000000)throw Error('备份文件过大');
      const imported=JSON.parse(await file.text());
      if(!imported||!imported.rules||typeof imported.rules!=='object'||!Array.isArray(imported.logs))throw Error('备份格式不正确');
      const next=JSON.parse(JSON.stringify(store));let added=0;
      for(const [month,rule] of Object.entries(imported.rules)){
        if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!rule||!Number.isFinite(rule.threshold)||rule.threshold<.1||rule.threshold>50||!Number.isFinite(Date.parse(rule.at)))throw Error('规则格式不正确');
        if(!Object.hasOwn(next.rules,month)){next.rules[month]=rule;added++;}
        const a=imported.archives?.[month];
        if(a&&!Object.hasOwn(next.archives,month)&&next.rules[month].at===rule.at&&next.rules[month].threshold===rule.threshold){
          if(!Array.isArray(a.rows)||a.rows.some(r=>!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(r.close)||r.close<=0))throw Error('归档日线格式不正确');
          const rebuilt=archivePeriod(a.rows,month,next.rules[month],String(a.source||'导入备份'),a.archivedAt);
          if(!rebuilt)throw Error('归档数据不完整');next.archives[month]=rebuilt;
        }
      }
      const seen=new Set(next.logs.map(l=>l.id||JSON.stringify(l)));
      for(const log of imported.logs){
        if(!log||!Object.hasOwn(next.rules,log.month)||typeof log.text!=='string'||typeof log.at!=='string')throw Error('日志格式不正确');
        const id=log.id||JSON.stringify(log);if(!seen.has(id)){next.logs.push(log);seen.add(id);}
      }
      store=next;if(persist()){autoArchive();render();$('timingMessage').textContent=`备份已合并，新增 ${added} 期规则；本地已有规则和归档保持不变。`;}
    }catch(error){$('timingMessage').textContent='导入失败：'+error.message;}finally{e.target.value='';}
  });
  async function load(){try{const res=await fetch('/api/sp-timing',{cache:'no-store'});if(!res.ok)throw Error('标普日线接口暂不可用');const data=await res.json();rows=data.rows;source=data.source;loadError='';autoArchive();}catch(e){loadError=e.message+'；保留规则及日志，等待重试。';}render();}
  $('timingThreshold').value=store.rules[$('timingMonth').value]?.threshold??2;
  render();load();setInterval(load,60000);$('refreshBtn').addEventListener('click',load);
})(typeof window==='undefined'?globalThis:window);
