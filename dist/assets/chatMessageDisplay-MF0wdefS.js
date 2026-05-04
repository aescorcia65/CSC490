import{c as a}from"./createLucideIcon-fOBrEu4_.js";import{s as f}from"./index-yQwLLz2M.js";import{d as l,p as c,a as m,e as u}from"./videoCall-BEUPpgGI.js";/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=a("BellOff",[["path",{d:"M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5",key:"o7mx20"}],["path",{d:"M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7",key:"16f1lm"}],["path",{d:"M10.3 21a1.94 1.94 0 0 0 3.4 0",key:"qgo35s"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=a("Paperclip",[["path",{d:"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",key:"1u3ebp"}]]);/**
 * @license lucide-react v0.460.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=a("Volume1",[["path",{d:"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z",key:"uqj9uw"}],["path",{d:"M16 9a5 5 0 0 1 0 6",key:"1q6k2b"}]]);function h(e,t=140){const i=String(e||"").replace(/\s+/g," ").trim();return i?i.length>t?`${i.slice(0,t-1)}…`:i:null}function V({recipientId:e,senderName:t,messageText:i,relatedMessageId:o,title:n}){if(!e)return;const r=h(i)||"Open Messages to read.",d=String(t||"Someone").trim()||"Someone",p=String(n||"").trim()||`New message from ${d}`;f.from("notifications").insert({user_id:e,type:"general",title:p,body:r,related_id:o||null}).then(({error:s})=>{s&&console.error("notifyRecipientNewChatMessage:",s.message)})}function A(e,{role:t,isMine:i}){const o=String(e||"").trimStart();if(!o)return{kind:"plain",line:""};if(/^VIDEO_[A-Z_]+\|/.test(o)){if(t==="patient"&&!i&&o.startsWith(`${l}|`)){const n=c(o);if((n==null?void 0:n.eventType)==="started"&&n.roomId){const r=m(n.roomId);if(r)return{kind:"video_started_invite",line:"",joinUrl:r}}}return{kind:"hidden",line:""}}return{kind:"plain",line:o}}function I(e){const t=String(e||"").trimStart();return/^VIDEO_[A-Z_]+\|/.test(t)?t.startsWith(`${l}|`)?"Your doctor started the video visit — tap Join in Messages.":t.startsWith(`${u}|`)?"Your doctor ended the video visit.":"Video visit update — open Appointments.":t}export{v as B,k as P,S as V,I as f,A as g,V as n};
