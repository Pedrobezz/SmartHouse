# Testes de tela: abre cada aba e faz os fluxos principais (ajustes, cenas, filtros). Rode com: npm run test:ui
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp('http://localhost:9222')
        pg=[x for c in b.contexts for x in c.pages if 'index.html' in x.url][0]
        pg.set_default_timeout(60000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type=='error' and errs.append(m.text[:200]))
        await pg.reload(); await pg.wait_for_timeout(2500)
        await pg.evaluate("window.__house.stop(); document.querySelector('#modal-root').innerHTML=''")
        res={}
        for v in ['home','devices','auto','energy','plan','settings']:
            await pg.evaluate(f"document.querySelector('[data-view={v}]').click()"); await pg.wait_for_timeout(700)
            res[v]=await pg.evaluate(f"document.querySelector('#view-{v}').classList.contains('active')")
        # ajustes: barra só com alteração
        await pg.evaluate("document.querySelector('[data-sec-btn=geral]').click()")
        res['save_hidden_start']=await pg.evaluate("document.querySelector('[data-stsave]').hidden")
        await pg.evaluate("document.querySelector('.toggle[data-k=startWithWindows]').click()")
        res['save_shown_after_change']=not await pg.evaluate("document.querySelector('[data-stsave]').hidden")
        await pg.evaluate("document.querySelector('.toggle[data-k=startWithWindows]').click()")
        # cena nova: criar, salvar, conferir, excluir
        await pg.evaluate("document.querySelector('[data-view=auto]').click()"); await pg.wait_for_timeout(600)
        n0=await pg.evaluate("__dbg.S.scenes.length")
        await pg.evaluate("document.querySelector('.au-add[data-new-scene]').click()"); await pg.wait_for_timeout(500)
        res['editor_has_close']=await pg.evaluate("!!document.querySelector('.ed-head [data-cancel]')")
        await pg.fill('[data-name]','Teste fumaça'); await pg.click('[data-ok]'); await pg.wait_for_timeout(1200)
        n1=await pg.evaluate("api.getAll().then(a=>a.scenes.length)")
        res['scene_saved']= n1==n0+1
        await pg.evaluate("[...document.querySelectorAll('[data-edit-scene]')].pop().click()"); await pg.wait_for_timeout(500)
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.click('[data-remove]'); await pg.wait_for_timeout(1200)
        n2=await pg.evaluate("api.getAll().then(a=>a.scenes.length)")
        res['scene_removed']= n2==n0
        # fechar pelo X
        await pg.evaluate("document.querySelector('[data-edit-rule]').click()"); await pg.wait_for_timeout(400)
        await pg.click('.ed-head [data-cancel]'); await pg.wait_for_timeout(300)
        res['x_closes']= await pg.evaluate("!document.querySelector('#modal-root .modal')")
        # filtros com contagem
        await pg.evaluate("document.querySelector('[data-view=devices]').click()"); await pg.wait_for_timeout(600)
        res['filter_counts']= await pg.evaluate("[...document.querySelectorAll('[data-filter] small')].length>0")
        print(res); print('erros:', errs)
        if errs or not all(res.values()): raise SystemExit(1)
asyncio.run(main())
