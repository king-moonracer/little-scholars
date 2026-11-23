(() => {
'use strict';
const $ = id => document.getElementById(id);
const cfg = window.LS_V5_CONFIG || {};
const message = (text, error=false) => { $('status').textContent = text; $('status').style.color = error ? '#a33232' : '#335d50'; };
const show = (id, visible) => $(id).classList.toggle('hidden', !visible);
const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let client, user, memberships=[], activeOrg=null, classes=[], learners=[];
const isAdmin = () => activeOrg && ['owner','school_admin'].includes(activeOrg.role);
async function request(op) { try { await op(); } catch(e){ message(e.message || 'Please try again.',true); } }
function checked(result){if(result.error)throw result.error;return result.data;}
async function start() {
 if (!cfg.url || !cfg.publishableKey || !window.supabase?.createClient) {
   show('configuration', true); message('Supabase has not been configured. Existing curriculum remains available.'); return;
 }
 client = window.supabase.createClient(cfg.url,cfg.publishableKey);
 client.auth.onAuthStateChange((_event,session)=>{ queueMicrotask(()=>request(async()=>{user=session?.user||null;await refresh()})); });
 const {data,error}=await client.auth.getUser();
 if(error && error.name!=='AuthSessionMissingError') message(error.message,true);
 user=data?.user||null; await refresh();
}
async function refresh(){
 show('auth',!user);show('workspace',!!user);show('org-detail',false);show('invite-accept',!!user && !!new URLSearchParams(location.search).get('invite'));
 if(!user){message('Sign in as an adult to access private learning profiles.');return}
 $('identity').textContent=user.email||'Signed-in adult';
 message('Authenticated. Learning records are protected by Supabase access policies.');
 memberships=checked(await client.from('memberships').select('organization_id,role,organizations(id,name,kind)').order('created_at',{ascending:true}))||[];
 $('orgs').innerHTML=memberships.length ? memberships.map((m,i)=>'<button type="button" class="tile" data-org="'+i+'"><strong>'+esc(m.organizations?.name||'Organization')+'</strong><br><small>'+esc(m.organizations?.kind)+' · '+esc(m.role)+'</small></button>').join('') : '<p class="muted">No organizations yet. Create a family or school below.</p>';
 document.querySelectorAll('[data-org]').forEach(el=>el.addEventListener('click',()=>request(()=>openOrg(memberships[Number(el.dataset.org)]))));
}
async function openOrg(m){
 if(!m)return; activeOrg=m;
 const o=m.organizations||{};
 $('org-type').textContent=(o.kind||'').toUpperCase();
 $('org-title').textContent=o.name||'Learning organization';
 $('role-title').textContent='Your role: '+m.role;
 show('org-detail',true);show('class-tools',isAdmin());show('learner-tools',isAdmin());show('invitation-tools',isAdmin() && ['school','coop'].includes(o.kind));
 classes=checked(await client.from('classrooms').select('id,name').eq('organization_id',m.organization_id).order('name'))||[];
 learners=checked(await client.from('learners').select('id,display_name,stage,classroom_id,worldview').eq('organization_id',m.organization_id).order('display_name'))||[];
 $('class-count').textContent=String(classes.length);
 $('learner-count').textContent=String(learners.length);
 $('learner-class').innerHTML='<option value="">No classroom</option>'+classes.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('');
 updateInviteTargets();
 $('learners').innerHTML=learners.length?learners.map(l=>{
   const cl=classes.find(c=>c.id===l.classroom_id);
   return '<div class="tile"><h3>📚 '+esc(l.display_name)+'</h3><p class="muted">'+esc(l.stage)+' · '+esc(cl?.name||'Individual learning')+'</p><div class="buttons"><a class="action primary" href="./index.html?learner='+encodeURIComponent(l.id)+'">Open learning dashboard</a><button data-report="'+esc(l.id)+'" type="button">View progress</button></div><div class="status" id="report-'+esc(l.id)+'"></div></div>'
 }).join(''):'<p class="muted">No authorized learners available yet.</p>';
 document.querySelectorAll('[data-report]').forEach(button=>button.addEventListener('click',()=>request(async()=>{
  let id=button.dataset.report;
  const records=checked(await client.from('learner_progress').select('payload,updated_at').eq('learner_id',id).maybeSingle());
  const p=records?.payload||{};
  const done=Object.values(p.completion||{}).filter(Boolean).length;
  const labs=Object.values(p.labProgress||{}).filter(Boolean).length;
  const books=Object.values(p.storyProgress||{}).filter(v=>v&&v.finished).length;
  $('report-'+id).textContent=records?'Completed '+done+'/20 days · '+labs+' labs · '+books+' storybooks · Last synced '+new Date(records.updated_at).toLocaleString():'No cloud progress recorded yet.';
 })));
}
$('auth-form').addEventListener('submit',e=>{e.preventDefault();request(async()=>{
 const email=$('email').value.trim(),password=$('password').value;
 const r=await client.auth.signInWithPassword({email,password});checked(r);$('password').value='';message('Signed in.');
})});
$('signup').addEventListener('click',()=>request(async()=>{
 const email=$('email').value.trim(),password=$('password').value;
 if(!email||password.length<8)throw Error('Enter a valid email and a password of at least eight characters.');
 const r=await client.auth.signUp({email,password});checked(r);$('password').value='';
 message(r.data?.session?'Account created and signed in.':'Check your email to confirm your account before signing in.');
}));
$('reset').addEventListener('click',()=>request(async()=>{
 const email=$('email').value.trim();if(!email)throw Error('Enter an email first.');
 checked(await client.auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/portal.html'}));
 message('If that email is registered, a password reset message has been sent.'); 
}));
$('signout').addEventListener('click',()=>request(async()=>{checked(await client.auth.signOut());user=null;activeOrg=null;await refresh()}));
$('org-form').addEventListener('submit',e=>{e.preventDefault();request(async()=>{
 const name=$('org-name').value.trim(),kind=$('org-kind').value;
 checked(await client.rpc('create_learning_organization',{p_kind:kind,p_name:name}));
 $('org-form').reset();await refresh(); message('Organization created.'); 
})});
$('class-form').addEventListener('submit',e=>{e.preventDefault();request(async()=>{
 if(!isAdmin())throw Error('Only owners or school admins can add classes.');
 checked(await client.rpc('add_learning_classroom',{p_org:activeOrg.organization_id,p_name:$('class-name').value.trim()}));
 $('class-form').reset();await openOrg(activeOrg);message('Classroom created.');
})});
$('learner-form').addEventListener('submit',e=>{e.preventDefault();request(async()=>{
 if(!isAdmin())throw Error('Only owners or school admins can add learners.');
 checked(await client.rpc('add_learning_learner',{p_org:activeOrg.organization_id,p_name:$('learner-name').value.trim(),p_classroom:$('learner-class').value||null}));
 $('learner-form').reset();await openOrg(activeOrg);message('Child profile created. Consider importing existing on-device progress using the learning dashboard.');
})});

function updateInviteTargets(){
 const role=$('invite-role').value,items=role==='teacher'?classes:learners;
 $('invite-target').innerHTML=items.length?items.map(item=>'<option value="'+esc(item.id)+'">'+esc(role==='teacher'?item.name:item.display_name)+'</option>').join(''):'<option value="">Create a '+(role==='teacher'?'classroom':'learner profile')+' first</option>';
}
$('invite-role').addEventListener('change',updateInviteTargets);
$('invite-form').addEventListener('submit',e=>{e.preventDefault();request(async()=>{
 if(!isAdmin()||!['school','coop'].includes(activeOrg.organizations?.kind))throw Error('School admin access required.');
 const target=$('invite-target').value;
 if(!target)throw Error('Choose a classroom or child before inviting.');
 const token=checked(await client.rpc('create_school_invitation',{
 p_org:activeOrg.organization_id,p_email:$('invite-email').value.trim(),
 p_role:$('invite-role').value,p_target:target
 }));
 const link=new URL('./portal.html',location.href);
 link.searchParams.set('invite',token);
 const output=$('invite-result');output.innerHTML='';
 const p=document.createElement('p');p.textContent='Copy this one-time invitation link and send it privately to the intended adult. It cannot be retrieved again from the database.';
 const input=document.createElement('input');input.value=link.toString();input.readOnly=true;input.setAttribute('aria-label','Private invitation URL');
 const copy=document.createElement('button');copy.type='button';copy.textContent='Copy private invitation link';copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(input.value);message('Invitation link copied.')}catch(e){input.select();message('Select and copy the link manually.')}});
 output.append(p,input,copy);show('invite-result',true);message('One-time invitation created. Send the private link to the invited adult.');
})});
$('accept-invite').addEventListener('click',()=>request(async()=>{
 const token=new URLSearchParams(location.search).get('invite');
 if(!token)throw Error('Missing invitation token.');
 if(!user)throw Error('Sign in as the invited adult first.');
 checked(await client.rpc('redeem_school_invitation',{p_token:token}));
 const url=new URL(location.href);url.searchParams.delete('invite');history.replaceState(null,'',url.pathname+url.search+url.hash);
 show('invite-accept',false);await refresh();message('Invitation accepted. Your authorized school is now available.');
}));

start().catch(e=>{show('configuration',true);message('Could not initialize: '+e.message,true)});
})();