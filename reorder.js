// Pointer-driven reorder: native page scrolling outside the handle, direct tracking on it.
export function bindReorder(list,{canStart,onBusy,onSave,onMessage}) {
  let drag=null,frame=0,saving=false;
  const rows=()=>[...list.querySelectorAll('[data-preset-row]')];
  const ids=()=>rows().map(row=>row.dataset.presetRow);
  const restore=order=>order.forEach(id=>{const row=rows().find(row=>row.dataset.presetRow===id);if(row)list.append(row);});
  async function save(order,id){
    saving=true;onBusy(true);list.setAttribute('aria-busy','true');onMessage('並び順を保存中…');
    try{await onSave(order);onMessage('並び順を保存しました。');}
    catch(error){onMessage(error.message);throw error;}
    finally{saving=false;onBusy(false);list.setAttribute('aria-busy','false');list.querySelector(`[data-handle="${id}"]`)?.focus({preventScroll:true});}
  }
  function position(){
    if(!drag)return;
    drag.ghost.style.transform=`translateY(${drag.y-drag.startY}px)`;
    const others=rows().filter(row=>row!==drag.row);
    const after=others.find(row=>{const r=row.getBoundingClientRect();return drag.y<r.top+r.height/2;});
    list.insertBefore(drag.row,after||null);
  }
  function tick(){
    if(!drag)return;
    const edge=90;
    const speed=drag.y<edge?-Math.min(14,(edge-drag.y)/4):drag.y>innerHeight-edge?Math.min(14,(drag.y-innerHeight+edge)/4):0;
    if(speed){window.scrollBy(0,speed);position();}
    frame=requestAnimationFrame(tick);
  }
  async function finish(cancel=false){
    if(!drag)return;
    const current=drag;drag=null;cancelAnimationFrame(frame);
    current.ghost.remove();current.row.classList.remove('drag-placeholder');
    if(list.hasPointerCapture(current.pointerId))list.releasePointerCapture(current.pointerId);
    onBusy(false);
    if(cancel){restore(current.order);current.handle.focus({preventScroll:true});return;}
    const order=ids();
    if(order.join()===current.order.join())return;
    try{await save(order,current.row.dataset.presetRow);}catch{restore(current.order);}
  }
  function down(event){
    const handle=event.target.closest('[data-handle]');
    if(!handle||saving||drag||!canStart()||event.button!==0)return;
    event.preventDefault();handle.focus({preventScroll:true});
    const row=handle.closest('[data-preset-row]'),r=row.getBoundingClientRect(),ghost=row.cloneNode(true);
    ghost.classList.add('drag-ghost');ghost.setAttribute('aria-hidden','true');ghost.inert=true;
    Object.assign(ghost.style,{top:`${r.top}px`,left:`${r.left}px`,width:`${r.width}px`});document.body.append(ghost);
    drag={row,ghost,handle,order:ids(),startY:event.clientY,y:event.clientY,pointerId:event.pointerId};
    row.classList.add('drag-placeholder');list.setPointerCapture(event.pointerId);onBusy(true);frame=requestAnimationFrame(tick);
  }
  function move(event){if(drag&&event.pointerId===drag.pointerId){event.preventDefault();drag.y=event.clientY;position();}}
  function up(event){if(drag&&event.pointerId===drag.pointerId)finish(event.type==='pointercancel');}
  async function key(event){
    if(event.key==='Escape'&&drag){event.preventDefault();finish(true);return;}
    const handle=event.target.closest('[data-handle]');
    if(!handle||!['ArrowUp','ArrowDown'].includes(event.key)||saving||drag||!canStart())return;
    event.preventDefault();const order=ids(),old=[...order],i=order.indexOf(handle.dataset.handle),j=i+(event.key==='ArrowUp'?-1:1);
    if(j<0||j>=order.length)return;
    [order[i],order[j]]=[order[j],order[i]];restore(order);
    try{await save(order,handle.dataset.handle);}catch{restore(old);}
  }
  list.addEventListener('pointerdown',down);window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('keydown',key);
  return ()=>{finish(true);list.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('keydown',key);};
}
