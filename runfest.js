(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const remote = 'https://raw.githubusercontent.com/kennethfinn/algard-weather/runfest-data/runfest-data.json';
  const dateFormat = new Intl.DateTimeFormat('nb-NO', {timeZone:'Europe/Oslo', day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  let lastData, busy = false;
  function node(tag, text, className) { const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e; }
  function renderRows(race, content, query='') {
    const body=content.querySelector('tbody');body.replaceChildren();
    const term=query.trim().toLocaleLowerCase('nb-NO');
    const rows=race.participants.filter(p=>`${p.name} ${p.bib||''} ${p.club} ${p.class}`.toLocaleLowerCase('nb-NO').includes(term));
    for(const p of rows){
      const tr=node('tr');
      for(const v of [p.bib||'—',p.name,p.club||'—',p.class||'—',p.class_rank||'—',p.time||'—',p.status])tr.append(node('td',v));
      if(p.time)tr.children[5].className='completed';body.append(tr);
    }
    content.querySelector('.filter-count').textContent=term?`${rows.length} treff av ${race.participants.length} deltakere`:'';
    if(!rows.length){const tr=node('tr'),td=node('td',term?'Ingen treff.':'Ingen navn er publisert for dette løpet ennå.');td.colSpan=7;tr.append(td);body.append(tr);}
  }
  function render(data){
    for(const race of data.races){
      let details=$(race.id);
      if(!details){
        details=node('details',undefined,'panel race');details.id=race.id;
        const summary=node('summary');summary.append(node('span',race.start,'time'));
        const label=node('span',race.name,'summary-label');label.append(node('span','','count'));summary.append(label);details.append(summary);
        const content=node('div',undefined,'race-content'),input=node('input');input.type='search';input.placeholder='Søk navn, startnummer eller klubb';input.setAttribute('aria-label',`Søk i ${race.name}`);
        content.append(input,node('p','','note filter-count'));
        const wrap=node('div',undefined,'table-wrap'),table=node('table'),head=node('thead'),tr=node('tr');
        for(const text of ['Nr.','Navn','Klubb / lag','Klasse','Plass i klasse','Tid','Status']){const th=node('th',text);th.scope='col';tr.append(th);}
        head.append(tr);table.append(head,node('tbody'));wrap.append(table);content.append(wrap);details.append(content);$('races').append(details);
        input.addEventListener('input',()=>renderRows(lastData.races.find(r=>r.id===race.id),content,input.value));
      }
      const n=race.participants.length,finished=race.participants.filter(p=>p.status==='Fullført').length;
      details.querySelector('.count').textContent=n?`${n} deltakere${finished?` · ${finished} med resultat`:''}`:'Navn er ikke publisert ennå';
      renderRows(race,details.querySelector('.race-content'),details.querySelector('input').value);
    }
  }
  function status(data, fallback=false){
    const when=Date.parse(data.updated_at),during=Date.now()<Date.parse('2026-10-04T23:59:59+02:00');
    const stale=fallback || (during && Date.now()-when>20*60000);
    $('status').className='status'+(stale?' stale':'');
    $('status').textContent=`Lister oppdatert ${dateFormat.format(when)}.${stale?' Nyeste data er ikke tilgjengelige. Viser sist hentede lister.':''}`;
  }
  async function fetchData(url){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{const r=await fetch(url,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error(`HTTP ${r.status}`);const d=await r.json();
      if(d.event_date!=='2026-10-03'||!Number.isFinite(Date.parse(d.updated_at))||d.races?.length!==5||!d.races.every(r=>Array.isArray(r.participants)))throw Error('Ugyldige løpsdata');return d;
    }finally{clearTimeout(timeout);}
  }
  function openHash(){const id=decodeURIComponent(location.hash.slice(1));const race=$(id);if(race?.tagName==='DETAILS'){race.open=true;race.scrollIntoView({block:'start'});}}
  async function load(){
    if(busy)return;busy=true;$('refresh').disabled=true;
    try{
      let fallback=false,data;
      try{data=await fetchData(remote+'?t='+Math.floor(Date.now()/60000));}
      catch(e){if(lastData)throw e;data=await fetchData('runfest-data.json');fallback=true;}
      if(!lastData||Date.parse(data.updated_at)>=Date.parse(lastData.updated_at)){lastData=data;render(data);}
      status(lastData,fallback);
      if(location.hash&&!load.opened){openHash();load.opened=true;}
    }catch(e){$('status').className='status error';$('status').textContent=lastData?`Kunne ikke hente oppdateringer. Viser lister fra ${dateFormat.format(Date.parse(lastData.updated_at))}.`:'Startlistene er utilgjengelige akkurat nå. Timeplanen over gjelder. Prøv igjen, eller åpne EQ Timing nedenfor.';}
    finally{busy=false;$('refresh').disabled=false;}
  }
  document.querySelectorAll('.schedule a').forEach(a=>a.addEventListener('click',()=>{const race=$(a.hash.slice(1));if(race)race.open=true;}));
  window.addEventListener('hashchange',openHash);$('refresh').addEventListener('click',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  load();setInterval(()=>{if(!document.hidden)load();},60000);
})();
