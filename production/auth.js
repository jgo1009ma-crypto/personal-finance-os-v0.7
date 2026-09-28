const crypto=require('crypto');

const COOKIE='pfos_session';
const SESSION_TTL_SECONDS=60*60*24*30;

function b64url(input){return Buffer.from(input).toString('base64url')}
function sign(payload,secret){return crypto.createHmac('sha256',secret).update(payload).digest('base64url')}
function timingEqual(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)}
function parseCookies(header=''){const out=Object.create(null);for(const p of String(header).split(';')){const i=p.indexOf('=');if(i<0)continue;try{out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())}catch{/* Ignore malformed cookies; they must never crash auth. */}}return out}
function makeToken(secret){const body=b64url(JSON.stringify({v:1,iat:Date.now(),exp:Date.now()+SESSION_TTL_SECONDS*1000,nonce:crypto.randomBytes(16).toString('hex')}));return `${body}.${sign(body,secret)}`}
function verifyToken(token,secret){if(!token||!secret)return false;const parts=String(token).split('.');if(parts.length!==2)return false;const [body,sig]=parts;if(!body||!sig||!timingEqual(sig,sign(body,secret)))return false;try{const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));return p.v===1&&Number.isFinite(p.exp)&&Date.now()<p.exp}catch{return false}}
function sessionCookie(secret){const token=makeToken(secret);return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`}
function clearCookie(){return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`}
function isAuthenticated(req,secret){const cookies=parseCookies(req.headers?.cookie||'');return verifyToken(cookies[COOKIE],secret)}
function secureComparePassword(given,expected){if(!expected)return false;const a=crypto.createHash('sha256').update(String(given)).digest();const b=crypto.createHash('sha256').update(String(expected)).digest();return crypto.timingSafeEqual(a,b)}
function assertOrigin(req){const method=String(req.method||'GET').toUpperCase();if(['GET','HEAD','OPTIONS'].includes(method))return;const expected=process.env.APP_ORIGIN||`https://${req.headers?.host||''}`;const origin=req.headers?.origin;if(req.headers?.['sec-fetch-site']==='cross-site'||(origin&&origin!==expected))throw new Error('Origin rejected')}

module.exports={COOKIE,sessionCookie,clearCookie,isAuthenticated,secureComparePassword,assertOrigin};
