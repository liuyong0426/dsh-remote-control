import { accentCSS, type Accent } from './accent.js'
const css = `:root{color-scheme:light dark;font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;background:#FAF9F5;color:#292724}*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px}.card{background:#FFFEFA;border:1px solid #E4E0D8;border-radius:12px;padding:32px;max-width:440px;width:100%;box-shadow:0 16px 60px #2927240b}.eyebrow{color:#77736C;font-size:12px;letter-spacing:.12em}h1{font-size:26px;letter-spacing:-.04em;margin:20px 0 12px}p{font-size:16px;line-height:1.8;color:#77736C}button{background:var(--rc-accent);border:0;color:var(--rc-accent-ink);border-radius:8px;padding:14px 18px;font:inherit;width:100%;cursor:pointer}.status{display:flex;align-items:center;gap:10px;margin:24px 0;color:var(--rc-accent);font-size:14px}.dot{width:9px;height:9px;border-radius:50%;background:var(--rc-accent)}small{color:#77736C;line-height:1.7;display:block} @media(prefers-color-scheme:dark){:root{background:#242321;color:#F0EEE8}.card{background:#2D2B28;border-color:#454039}p,small,.eyebrow{color:#B5AFA6}}`
/**
 * The pages the gateway serves itself are the first thing a phone sees and are what gets added to the
 * home screen, so they carry this plugin's own name and icons (see MOBILE_HEAD in index.ts, served
 * from `/rc-app/`).
 */
const head = '<link rel="manifest" href="/rc-app/manifest.webmanifest"><link rel="apple-touch-icon" sizes="180x180" href="/rc-app/apple-touch-icon.png"><meta name="theme-color" content="#111827"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="DSH 远程"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
/** Text that came from the computer is quoted into the page, so it must not be able to open markup. */
function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
/**
 * Adopts the computers a link carried, exactly as the app page does (see boot.ts adoptHosts). Inline
 * scripts cannot import, so the key and the merge rule are repeated here; tests/identity.test.ts keeps
 * the copies in step.
 */
const adopt = `(()=>{const KEY='dsrc-hosts',MAX=24,LIMIT=4096;const origin=value=>{try{const url=new URL(String(value??''));return url.protocol==='https:'||url.protocol==='http:'?url.origin:''}catch{return ''}};const temporary=base=>/(^|\\.)(trycloudflare\\.com|lhr\\.life)$/.test(new URL(base).hostname);const read=()=>{try{const parsed=JSON.parse(localStorage.getItem(KEY)??'[]');return Array.isArray(parsed)?parsed.filter(row=>row&&typeof row.b==='string'):[]}catch{return []}};let raw='';try{raw=new URLSearchParams(location.search).get('rcfrom')??''}catch{raw=''}
if(raw&&raw.length<=LIMIT){try{const base64=raw.replace(/-/g,'+').replace(/_/g,'/');const binary=atob(base64+'='.repeat((4-base64.length%4)%4));const incoming=JSON.parse(new TextDecoder().decode(Uint8Array.from(binary,character=>character.charCodeAt(0))));if(Array.isArray(incoming)){const list=read();for(const item of incoming){if(!item||typeof item!=='object')continue;const base=origin(item.b);if(!base)continue;const id=typeof item.i==='string'?item.i.slice(0,64):'';const label=typeof item.l==='string'?item.l.replace(/\\s+/g,' ').trim().slice(0,40):'';const alias=typeof item.a==='string'?item.a.replace(/\\s+/g,' ').trim().slice(0,40):'';const known=list.find(entry=>entry.b===base)??(id?list.find(entry=>entry.i===id&&temporary(entry.b)):undefined);if(known){known.b=base;if(id)known.i=id;if(label)known.l=label;if(alias&&!known.a)known.a=alias}else list.push({i:id,l:label,b:base,...(alias?{a:alias}:{})})}try{localStorage.setItem(KEY,JSON.stringify(list.slice(-MAX)))}catch{}}}catch{}}
if(raw){try{const url=new URL(location.href);url.searchParams.delete('rcfrom');history.replaceState(null,'',url.pathname+url.search+url.hash)}catch{}}})();`
export function pairingPage(accent: Accent = 'orange', label = ''): string {
  const name = escape(label.trim())
  const heading = name ? `连接 ${name}` : '连接你的电脑'
  const hint = name
    ? `这台设备将要连接 <strong>${name}</strong>。在电脑上确认这次配对后，你就可以在这里继续使用 DeepSeek Harness。`
    : '在电脑上确认这次配对后，你就可以在这里继续使用 DeepSeek Harness。'
  return `<!doctype html><html lang="zh-CN" data-rc-accent="${accent}"><head><meta charset="utf-8"><link rel="icon" href="data:,">${head}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="referrer" content="no-referrer"><title>连接 DeepSeek Harness</title><style>${css}${accentCSS(':root', 'media')}</style></head><body><main class="card"><span class="eyebrow">DSH · 远程</span><h1>${heading}</h1><p>${hint}</p><div class="status"><span class="dot"></span><span id="state">正在发送配对请求…</span></div><small>授权后，这台设备与本机拥有相同的操作权限。你可以随时在远程控制面板撤销设备。</small><button id="enter" hidden>进入 DeepSeek Harness</button></main><script>
  ${adopt}
  (async()=>{const state=document.getElementById('state');const enter=document.getElementById('enter');
  try{const token=new URLSearchParams(location.hash.slice(1)).get('pair');history.replaceState(null,'','/pair');
    const health=await fetch('/api/dsh-remote-control/manage',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'requests'})}).catch(()=>null);
    if(health&&health.ok){state.textContent='这台设备已经配对过，正在打开…';location.replace('/');return}
    if(!token)throw Error('请在电脑上开启远程控制并扫描新的二维码。');
    let model='';try{const hints=await navigator.userAgentData?.getHighEntropyValues(['model']);model=hints?.model||''}catch{}
    const request=await fetch('/rc/pair/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,model})});const claim=await request.json();if(!request.ok)throw Error(claim.error||'配对请求失败');
    state.textContent='等待电脑确认，请查看本机远程控制面板';
    while(Date.now()<claim.expiresAt){await new Promise(r=>setTimeout(r,1500));const response=await fetch('/rc/pair/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:claim.id,key:claim.key})});const result=await response.json();if(!response.ok)throw Error(result.error||'请求已失效');if(result.state==='rejected')throw Error('电脑已拒绝本次配对。');if(result.state==='approved'){state.textContent='已连接，正在打开远程界面…';location.replace('/');return}}
    throw Error('配对请求已过期，请重新扫码。')
  }catch(error){state.textContent=error.message;enter.hidden=false;enter.textContent='重新检查连接';enter.onclick=()=>location.reload()}})();
  </script></body></html>`
}
export function deniedPage(accent: Accent = 'orange', label = ''): string {
  const name = escape(label.trim())
  const hint = name
    ? `这台设备与 <strong>${name}</strong> 的授权已失效。请在电脑上打开远程控制面板，扫描新的二维码并确认配对。`
    : '这台设备尚未配对，授权已过期，或已被撤销。请在电脑上打开远程控制面板，扫描新的二维码并确认配对。'
  return `<!doctype html><html lang="zh-CN" data-rc-accent="${accent}"><head><meta charset="utf-8"><link rel="icon" href="data:,">${head}<meta name="viewport" content="width=device-width,initial-scale=1"><title>设备尚未授权</title><style>${css}${accentCSS(':root', 'media')}</style></head><body><main class="card"><span class="eyebrow">DSH · 远程</span><h1>需要重新连接</h1><p>${hint}</p><small>“任意网络”方式每次开启都会换一个新地址，旧地址上的授权随之失效，需要重新扫码。</small></main><script>${adopt}</script></body></html>`
}
