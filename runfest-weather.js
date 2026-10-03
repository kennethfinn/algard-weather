(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const zone='Europe/Oslo';
  const api='https://api.open-meteo.com/v1/forecast?latitude=58.8517&longitude=5.7360&hourly=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m&temperature_unit=celsius&precipitation_unit=mm&wind_speed_unit=ms&timezone=Europe%2FOslo&forecast_days=1';
  const dateFormat=new Intl.DateTimeFormat('nb-NO',{timeZone:zone,weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const clockFormat=new Intl.DateTimeFormat('nb-NO',{timeZone:zone,hour:'2-digit',minute:'2-digit'});
  const hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'});
  const numberFormat=new Intl.NumberFormat('nb-NO',{minimumFractionDigits:1,maximumFractionDigits:1});
  let lastData=null,lastFetched=null,busy=false;
  const localDate=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const number=v=>typeof v==='number'&&Number.isFinite(v)?numberFormat.format(v):'—';
  function cell(tr,text){const td=document.createElement('td');td.textContent=text;tr.append(td);return td;}
  function render(data){
    const today=localDate(),h=data.hourly;
    const indices=h.time.map((time,i)=>time.startsWith(today+'T')?i:-1).filter(i=>i>=0);
    if(!indices.length)throw Error('Ingen timer for dagens dato');
    $('date').textContent=dateFormat.format(new Date());
    const fragment=document.createDocumentFragment(),currentHour=hourFormat.format(new Date());
    for(const i of indices){
      const tr=document.createElement('tr'),time=h.time[i].slice(11,16);
      if(time.slice(0,2)===currentHour){tr.className='current';tr.setAttribute('aria-label','Inneværende time');}
      cell(tr,time);cell(tr,number(h.temperature_2m[i]));cell(tr,number(h.precipitation[i]));cell(tr,number(h.wind_speed_10m[i]));cell(tr,number(h.wind_gusts_10m[i]));
      const td=cell(tr,''),raw=h.wind_direction_10m[i];
      if(typeof raw==='number'&&Number.isFinite(raw)){
        const deg=((raw%360)+360)%360,arrow=document.createElement('span'),degrees=document.createElement('span');
        arrow.className='arrow';arrow.textContent='↑';arrow.style.transform=`rotate(${deg+180}deg)`;arrow.setAttribute('aria-hidden','true');
        degrees.className='degree';degrees.textContent=`${Math.round(deg)%360}°`;td.setAttribute('aria-label',`Vind fra ${Math.round(deg)%360} grader`);td.append(arrow,degrees);
      }else td.textContent='—';
      fragment.append(tr);
    }
    $('hours').replaceChildren(fragment);
  }
  async function load(){
    if(busy)return;busy=true;$('refresh').disabled=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try{
      const response=await fetch(api,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error(`HTTP ${response.status}`);
      const data=await response.json();const h=data.hourly,keys=['temperature_2m','precipitation','wind_speed_10m','wind_gusts_10m','wind_direction_10m'];
      if(!Array.isArray(h?.time)||!keys.every(k=>Array.isArray(h[k])&&h[k].length===h.time.length))throw Error('Ufullstendig timevarsel');
      if(data.hourly_units?.wind_speed_10m!=='m/s'||data.hourly_units?.temperature_2m!=='°C'||data.hourly_units?.precipitation!=='mm')throw Error('Uventede enheter');
      render(data);lastData=data;lastFetched=new Date();
      $('status').className='status';$('status').textContent=`Dagens timevarsel · hentet kl. ${clockFormat.format(lastFetched)} · inneværende time er markert.`;
    }catch(e){
      $('status').className='status error';
      const hasToday=lastData?.hourly.time.some(t=>t.startsWith(localDate()+'T'));
      if(hasToday){render(lastData);$('status').textContent=`Oppdatering mislyktes. Viser varselet hentet kl. ${clockFormat.format(lastFetched)}.`;}
      else{$('status').textContent='Kunne ikke hente dagens timevarsel. Trykk «Oppdater varsel» for å prøve igjen.';$('hours').replaceChildren();const tr=document.createElement('tr');cell(tr,'Timevarselet er ikke tilgjengelig akkurat nå.').colSpan=6;$('hours').append(tr);}
    }finally{clearTimeout(timer);busy=false;$('refresh').disabled=false;}
  }
  $('refresh').addEventListener('click',load);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  load();setInterval(()=>{if(!document.hidden)load();},15*60000);
})();
