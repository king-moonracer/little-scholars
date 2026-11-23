/* Little Scholars V5: selected-learner cloud bridge. Public key only; access enforced by Supabase RLS. */
(() => {
'use strict';
const learnerId = new URLSearchParams(location.search).get('learner');
if(!learnerId)return;
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(learnerId);
const css=document.createElement('style');
css.textContent='html.lsv5-lock .shell{visibility:hidden!important}.lsv5-overlay{position:fixed;z-index:10000;inset:0;background:#f8f7ef;color:#244f51;display:flex;align-items:center;justify-content:center;padding:20px;font:18px system-ui,sans-serif}.lsv5-overlay>div{max-width:520px;background:white;border:1px solid #c9dfd0;border-radius:19px;padding:28px;box-shadow:0 15px 55px #0001}.lsv5-banner{background:#e6f2e7;border:1px solid #bbd8c5;border-radius:14px;padding:15px;margin:12px 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.lsv5-banner button,.lsv5-overlay a{background:#244f51;color:white;padding:10px 14px;border:0;border-radius:9px;text-decoration:none;cursor:pointer}.lsv5-banner p{margin:0;flex:1;min-width:200px}';
document.head.append(css);
document.documentElement.classList.add('lsv5-lock');
const overlay=document.createElement('div'); overlay.className='lsv5-overlay';overlay.setAttribute('role','alert');
function overlayText(text){overlay.innerHTML='';const div=document.createElement('div');const h=document.createElement('h2');h.textContent='Little Scholars · Secure learning';const p=document.createElement('p');p.textContent=text;const a=document.createElement('a');a.href='./portal.html';a.textContent='Return to the account portal';div.append(h,p,a);overlay.append(div)}
overlayText('Verifying the adult account and loading this learner’s progress…');
document.addEventListener('DOMContentLoaded',()=>document.body.append(overlay),{once:true});
let api=null,client=null,remoteTime=null,active=false,importAllowed=false,queued=null,working=false,timer=null,revision=0;
const config=window.LS_V5_CONFIG||{};
const safe = data => {
 const o=data&&typeof data==='object'&&!Array.isArray(data)?data:{};
 return {
 week:[1,2,3,4].includes(Number(o.week))?Number(o.week):1,
 day:[1,2,3,4,5].includes(Number(o.day))?Number(o.day):1,
 view:'child',section:'phonics',
 worldview:['secular','christian','choose'].includes(o.worldview)?o.worldview:'secular',
 name:String(o.name||'Little Scholar').slice(0,30),
 answers:typeof o.answers==='object'&&o.answers&&!Array.isArray(o.answers)?o.answers:{},
 completion:typeof o.completion==='object'&&o.completion&&!Array.isArray(o.completion)?o.completion:{},
 observations:typeof o.observations==='object'&&o.observations&&!Array.isArray(o.observations)?o.observations:{},
 storyReads:typeof o.storyReads==='object'&&o.storyReads&&!Array.isArray(o.storyReads)?o.storyReads:{},
 labProgress:typeof o.labProgress==='object'&&o.labProgress&&!Array.isArray(o.labProgress)?o.labProgress:{},
 storyProgress:typeof o.storyProgress==='object'&&o.storyProgress&&!Array.isArray(o.storyProgress)?o.storyProgress:{},
 readerProgress:typeof o.readerProgress==='object'&&o.readerProgress&&!Array.isArray(o.readerProgress)?o.readerProgress:{},
 decodeEvidence:typeof o.decodeEvidence==='object'&&o.decodeEvidence&&!Array.isArray(o.decodeEvidence)?o.decodeEvidence:{},
 readingRate:Number.isFinite(Number(o.readingRate))?Number(o.readingRate):0.75
 };
};
function status(text){
 const note=document.getElementById('lsv5-sync');
 if(note)note.textContent=text;
}
function banner(text,allowImport=false){
 const element=document.createElement('div');
 element.className='lsv5-banner';
 const info=document.createElement('p');info.id='lsv5-sync';info.textContent=text;
 const back=document.createElement('a');back.href='./portal.html';back.textContent='← Profiles';back.style.marginRight='8px';
 element.append(back,info);
 if(allowImport){
 const btn=document.createElement('button');btn.textContent='Import old progress into this profile';btn.type='button';
 btn.addEventListener('click',async()=>{
   if(!confirm('This will assign the previous device-only progress to this selected child. Only continue if it belongs to this learner. Import cannot be automatically undone.'))return;
   let old;try{old=JSON.parse(localStorage.getItem('little_scholars_w1_4_v3')||'null')}catch(e){}
   if(!old){status('No old browser progress found.');return}
   api.set({...safe(old),name:LSV5.name});importAllowed=false;
   btn.remove();LSV5.queue(api.get());status('Import queued; saving securely…');
 });
 element.append(btn);
 }
 const hero=document.getElementById('hero');
 hero?.parentNode?.insertBefore(element,hero);
}
async function flush(){
 if(!active||working||!queued)return;
 working=true;
 let body=queued;queued=null;const savingRevision=revision;
 try{
  const result=await client.rpc('save_learning_progress',{p_learner:learnerId,p_payload:body,p_expected:remoteTime});
  if(result.error)throw result.error;
  remoteTime=result.data;status('✓ Progress saved to your private learner profile.');
 }catch(error){
  active=false;queued=body;
  status('⚠ Changes NOT saved: '+(error.message||'Cloud sync error')+'. Export a backup and reload the account portal before trying again.');
  window.alert('Cloud progress was not saved. Another device may have changed this profile, or the connection was lost. Export a progress backup before leaving.');
 }finally{
  working=false;if(active&&queued){clearTimeout(timer);timer=setTimeout(flush,600)}
 }
}
const LSV5=window.LSV5={
 name:'Little Scholar',
 queue(next){
  if(!active)return;
  queued=safe(next);revision++;status('Saving this learner’s progress…');
  clearTimeout(timer);timer=setTimeout(flush,900);
 },
 async init(legacy){
  api=legacy;
  try{
   if(!isUUID)throw Error('Invalid learner link.');
   if(!config.url||!config.publishableKey||!window.supabase?.createClient)throw Error('Supabase connection is not configured.');
   client=window.supabase.createClient(config.url,config.publishableKey);
   const auth=await client.auth.getUser();
   if(auth.error||!auth.data.user)throw Error('Sign in to the adult account first.');
   const learner=await client.from('learners').select('id,display_name,worldview').eq('id',learnerId).maybeSingle();
   if(learner.error||!learner.data)throw Error('This learner is not available to your account.');
   LSV5.name=learner.data.display_name;
   const record=await client.from('learner_progress').select('payload,updated_at').eq('learner_id',learnerId).maybeSingle();
   if(record.error)throw record.error;
   remoteTime=record.data?.updated_at||null;
   const blank=safe({name:learner.data.display_name,worldview:learner.data.worldview});
   const profile=record.data?.payload?safe(record.data.payload):blank;
   profile.name=learner.data.display_name;
   api.set(profile);
   document.documentElement.classList.remove('lsv5-lock');
   overlay.remove();
   banner(record.data?'Cloud progress loaded for '+learner.data.display_name+'.':'New learner: no cloud progress yet.',!record.data);
   active=true;
  }catch(error){
   overlayText((error.message||'Unable to open learner profile')+' No local learning records have been loaded for this link.');
  }
 }
};
window.addEventListener('beforeunload',e=>{if(active&&(queued||working)){e.preventDefault();e.returnValue='Unsaved learner progress';}});
})();