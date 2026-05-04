import{c as u}from"./createLucideIcon-fOBrEu4_.js";import{s as r}from"./index-DB4GtnFw.js";import{r as f}from"./vendor-react-BZdL80ZD.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const L=u("Ellipsis",[["circle",{cx:"12",cy:"12",r:"1",key:"41hilf"}],["circle",{cx:"19",cy:"12",r:"1",key:"1wjl8i"}],["circle",{cx:"5",cy:"12",r:"1",key:"1pcz8c"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=u("HeartPulse",[["path",{d:"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",key:"c3ymky"}],["path",{d:"M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27",key:"1uw2ng"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const P=u("LogOut",[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}],["polyline",{points:"16 17 21 12 16 7",key:"1gabdz"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12",key:"1uyos4"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const T=u("MessageSquare",[["path",{d:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",key:"1lielz"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=u("Pencil",[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const R=u("TriangleAlert",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]);async function C(e){e&&await r.from("user_presence").upsert({user_id:e,is_online:!1,last_seen:new Date().toISOString()},{onConflict:"user_id"}),await r.auth.signOut()}function I(){const[e,i]=f.useState(()=>window.innerWidth<820);return f.useEffect(()=>{const s=()=>i(window.innerWidth<820);return window.addEventListener("resize",s),()=>window.removeEventListener("resize",s)},[]),e}const h=2*60*1e3,m=3*60*1e3,g=20*1e3,y=10*1e3;function E(e,i=Date.now(),s=h){if(!(e!=null&&e.user_id)||!e.is_online)return!1;const n=e.last_seen?new Date(e.last_seen).getTime():0;return Number.isFinite(n)?i-n<s:!1}function b(e,i=Date.now(),s=h){const n={};for(const a of e||[])E(a,i,s)&&(n[a.user_id]=!0);return n}function v(e,i,{inactivityMs:s=m,intervalMs:n=g}={}){const a={t:Date.now()},o=()=>{a.t=Date.now()},p=[["pointerdown",o],["keydown",o],["touchstart",o]];p.forEach(([w,d])=>window.addEventListener(w,d,!0));const c=()=>{typeof document<"u"&&document.visibilityState==="visible"&&o()};window.addEventListener("visibilitychange",c,!0);async function t(){const d=Date.now()-a.t>s;await e.from("user_presence").upsert({user_id:i,is_online:!d,last_seen:new Date().toISOString()},{onConflict:"user_id"})}t().catch(()=>{});const _=window.setInterval(()=>{t()},n),l=()=>{e.from("user_presence").upsert({user_id:i,is_online:!1,last_seen:new Date().toISOString()},{onConflict:"user_id"}).then(()=>{}).catch(()=>{})};return window.addEventListener("pagehide",l),window.addEventListener("beforeunload",l),()=>{p.forEach(([w,d])=>window.removeEventListener(w,d,!0)),window.removeEventListener("visibilitychange",c,!0),window.clearInterval(_),window.removeEventListener("pagehide",l),window.removeEventListener("beforeunload",l),l()}}function D(e){const[i,s]=f.useState({}),n=f.useRef({});return f.useEffect(()=>{if(n.current={},s({}),!e)return;function a(t){t!=null&&t.user_id&&(n.current={...n.current,[t.user_id]:t},s(b(Object.values(n.current),Date.now(),h)))}(async()=>{await r.from("user_presence").upsert({user_id:e,is_online:!0,last_seen:new Date().toISOString()},{onConflict:"user_id"}),a({user_id:e,is_online:!0,last_seen:new Date().toISOString()});const{data:t}=await r.from("user_presence").select("user_id,is_online,last_seen");n.current={},(t||[]).forEach(_=>{n.current[_.user_id]=_}),s(b(Object.values(n.current)))})().catch(()=>{});const o=r.channel("presence-all").on("postgres_changes",{event:"INSERT",schema:"public",table:"user_presence"},t=>{t.new&&a(t.new)}).on("postgres_changes",{event:"UPDATE",schema:"public",table:"user_presence"},t=>{t.new&&a(t.new)}).subscribe(),p=window.setInterval(()=>{s(b(Object.values(n.current),Date.now(),h))},y),c=v(r,e);return()=>{window.clearInterval(p),c==null||c(),r.removeChannel(o).catch(()=>{}),n.current={},s({})}},[e]),i}const H={blue:{a:"#2563eb",d:"rgba(37,99,235,.12)",b:"rgba(37,99,235,.26)"},cyan:{a:"#06b6d4",d:"rgba(6,182,212,.10)",b:"rgba(6,182,212,.22)"},rose:{a:"#f43f5e",d:"rgba(244,63,94,.10)",b:"rgba(244,63,94,.22)"},amber:{a:"#f59e0b",d:"rgba(245,158,11,.10)",b:"rgba(245,158,11,.22)"},emerald:{a:"#10b981",d:"rgba(16,185,129,.10)",b:"rgba(16,185,129,.22)"}},z=["Taking medications with a full glass of water significantly improves absorption.","Consistency matters — taking medication at the same time each day keeps blood levels stable.","Avoid storing medications in bathrooms. Heat and humidity reduce potency over time.","Check expiry dates monthly and return out-of-date medications to a pharmacy.","Some medications are best taken with food — ask your pharmacist for guidance."],N={pending_pharmacist:"With pharmacist",pending_fill:"Being filled",ready:"Ready for pickup",filled:"Filled",picked_up:"Picked up"};export{H as C,L as E,O as H,P as L,T as M,A as P,z as T,R as a,D as b,N as c,C as s,I as u};
