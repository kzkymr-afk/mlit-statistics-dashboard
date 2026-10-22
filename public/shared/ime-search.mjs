/** Keep IME-owned inputs attached until composition and its trailing input finish. */
export function installImeSearch(document,routes,{defer=callback=>requestAnimationFrame(callback)}={}){
 const composing=new WeakSet(),finishing=new WeakSet(),pending=new WeakSet();
 const isInput=target=>!!target?.matches?.('input,textarea');
 const blocked=event=>event.isComposing===true||event.keyCode===229||composing.has(event.target)||finishing.has(event.target);
 function apply(target){
  const update=routes[target.id];if(!update||!target.isConnected)return;
  const focused=document.activeElement===target,selection=[target.selectionStart,target.selectionEnd,target.selectionDirection];
  update(target.value);
  const next=document.getElementById(target.id);
  if(focused&&next&&next!==target){next.focus({preventScroll:true});if(selection[0]!==null&&selection[1]!==null)try{next.setSelectionRange(...selection);}catch{/* Some input types do not expose a selection. */}}
 }
 document.addEventListener('compositionstart',event=>{if(isInput(event.target))composing.add(event.target);});
 document.addEventListener('compositionend',event=>{
  const target=event.target;if(!isInput(target))return;composing.delete(target);finishing.add(target);
  if(pending.has(target))return;pending.add(target);
  defer(()=>{pending.delete(target);finishing.delete(target);if(!composing.has(target))apply(target);});
 });
 document.addEventListener('input',event=>{if(!blocked(event))apply(event.target);});
 return {isComposing:blocked,blocksSubmit:form=>[...form.querySelectorAll('input,textarea')].some(target=>composing.has(target)||finishing.has(target))};
}
