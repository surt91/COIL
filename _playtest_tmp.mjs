import { chromium } from 'playwright';
import http from 'http';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
let ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
let page;
const logs = [];
async function newPage(w=1400,h=900){ if(page) await ctx.close(); ctx = await browser.newContext({ viewport:{width:w,height:h}}); page = await ctx.newPage();
 page.on('console', m => { if (m.type()!=='log' && m.type()!=='debug') logs.push(`[${m.type()}] ${m.text()}`)});
 page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`)); }
await newPage();
http.createServer(async (req, res) => {
  let body=''; for await (const c of req) body+=c;
  const out=[];
  try {
    for (const a of body.split('\n').filter(Boolean)) {
      const i=a.indexOf(':'); const k=a.slice(0,i), arg=a.slice(i+1);
      if(k==='new'){const [w,h]=(arg||'1400,900').split(',').map(Number); await newPage(w,h);}
      else if(k==='goto'){await page.goto(arg); await page.waitForTimeout(500);}
      else if(k==='key'){await page.keyboard.press(arg); await page.waitForTimeout(250);}
      else if(k==='wait') await page.waitForTimeout(Number(arg));
      else if(k==='click'){const [x,y]=arg.split(',').map(Number); await page.mouse.click(x,y); await page.waitForTimeout(250);}
      else if(k==='move'){const [x,y]=arg.split(',').map(Number); await page.mouse.move(x,y); await page.waitForTimeout(200);}
      else if(k==='text'){await page.getByText(arg,{exact:false}).first().click(); await page.waitForTimeout(250);}
      else if(k==='eval') out.push(JSON.stringify(await page.evaluate(arg)));
      else if(k==='shot'){await page.screenshot({path:'/tmp/pt/'+arg}); out.push('shot '+arg);}
      else if(k==='logs'){out.push(logs.join('\n')); logs.length=0;}
    }
  } catch(e){ out.push('ERR '+e.message); }
  res.end(out.join('\n')+'\n');
}).listen(7777);
console.log('ready');
