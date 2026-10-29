# Testes de tela das funções novas (rodam no app de verdade, com aparelhos de demonstração).
# Uso: test/ui/run.sh   (abre o app num monitor virtual e roda tudo)
import asyncio, sys
from playwright.async_api import async_playwright

falhas = []
def ok(nome, cond, extra=''):
    print(('  ok  ' if cond else 'FALHA ') + nome + (f'  ({extra})' if extra and not cond else ''))
    if not cond: falhas.append(nome)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp('http://localhost:9222')
        pg = [x for c in b.contexts for x in c.pages if 'index.html' in x.url][0]
        pg.set_default_timeout(60000)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.evaluate("localStorage.setItem('quality','low')"); await pg.reload(); await pg.wait_for_timeout(5000)
        await pg.evaluate("document.body.classList.remove('intro-mode','idle-mode'); __house.intro=null; document.querySelector('#modal-root').innerHTML=''")

        # menu Vista
        await pg.evaluate("document.querySelector('#btn-view').click()"); await pg.wait_for_timeout(400)
        ok('menu Vista abre', await pg.evaluate("!!document.querySelector('.vw-pop')"))
        await pg.evaluate("document.querySelector('[data-vw=walls] [data-v=low]').click()")
        ok('Vista: paredes baixas', await pg.evaluate("localStorage.getItem('wallMode')") == 'low')
        await pg.evaluate("document.querySelector('[data-vw=walls] [data-v=cut]').click(); document.querySelector('#btn-view').click()")

        # painel do interruptor: seções recolhidas e grupo de luzes
        await pg.evaluate("__house.stop(); __dbg.go('devices')"); await pg.wait_for_timeout(500)
        did = await pg.evaluate("__dbg.S.devices.find(d=>d.state?.channels?.length>1).id")
        await pg.evaluate(f"Object.keys(localStorage).filter(k=>k.startsWith('fold:')).forEach(k=>localStorage.removeItem(k)); __dbg.openPanel({{type:'device',id:'{did}'}})"); await pg.wait_for_timeout(900)
        ok('seções do interruptor começam recolhidas', await pg.evaluate("[...document.querySelectorAll('.panel .card.sec.fold')].every(s=>!s.classList.contains('open'))"))
        await pg.evaluate("(()=>{const s=document.querySelectorAll('.panel [data-lk]');const x=s[s.length-1];x.value='__group';x.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(600)
        await pg.evaluate("document.querySelector('.lk-pick').click()"); await pg.wait_for_timeout(600)
        ok('grupo de luzes salvo', await pg.evaluate("__dbg.S.links.some(l=>l.group?.length===1)"))
        await pg.evaluate("(()=>{const s=document.querySelectorAll('.panel [data-lk]');const x=s[s.length-1];x.value='';x.dispatchEvent(new Event('change'))})()"); await pg.wait_for_timeout(600)
        ok('grupo de luzes removido', await pg.evaluate("!__dbg.S.links.some(l=>l.group)"))

        # ar: consumo estimado
        aid = await pg.evaluate("__dbg.S.devices.find(d=>d.type==='ac' && d.state.on)?.id")
        if aid:
            await pg.evaluate(f"__dbg.openPanel({{type:'device',id:'{aid}'}})"); await pg.wait_for_timeout(900)
            await pg.evaluate("document.querySelector('[data-estbtu] [data-w=\"1100\"]').click()"); await pg.wait_for_timeout(2500)
            w = await pg.evaluate(f"__dbg.S.devices.find(d=>d.id==='{aid}').state.power")
            ok('ar com potência estimada', isinstance(w, (int, float)) and w > 0, w)
            await pg.evaluate(f"(async()=>{{const l={{...__dbg.S.acPower}}; delete l['{aid}']; await api.save('acPower', l)}})()")

        # energia: meta, medido x estimado, por cômodo, computador
        await pg.evaluate("__dbg.closePanel(); __dbg.go('energy')"); await pg.wait_for_timeout(1500)
        ok('energia: medido x estimado', await pg.evaluate("!!document.querySelector('[data-split] .en-split-bar')"))
        ok('energia: por cômodo', await pg.evaluate("document.querySelectorAll('.en-room').length>0"))
        await pg.evaluate("document.querySelector('[data-goal-edit]').click()"); await pg.wait_for_timeout(200)
        await pg.evaluate("(()=>{document.querySelector('[data-goal-in]').value='300'; document.querySelector('[data-goal-ok]').click()})()"); await pg.wait_for_timeout(700)
        ok('energia: meta salva', await pg.evaluate("__dbg.S.energyGoal") == 300)
        await pg.evaluate("api.save('energyGoal', 0); __dbg.S.energyGoal=0")
        ok('energia: histórico aparece', await pg.evaluate("!!document.querySelector('[data-hchart]') && !!document.querySelector('[data-hsum]')"))
        await pg.evaluate("document.querySelector('[data-hseg] [data-v=months]').click()")
        ok('energia: histórico por mês', await pg.evaluate("document.querySelector('[data-hseg] .on')?.dataset.v") == 'months')
        await pg.evaluate("document.querySelector('[data-hseg] [data-v=days]').click()")
        ok('energia: computador aparece', await pg.evaluate("!!document.querySelector('[data-pc]')"))

        # aviso de aparelho sem resposta
        await pg.evaluate("(()=>{__dbg.S.devices.push({id:'falso',provider:'tuya',type:'switch',name:'Teste',online:false,state:{}}); __dbg.renderStatus()})()")
        ok('aviso de aparelho sem resposta', await pg.evaluate("!!document.querySelector('[data-health]')"))

        await pg.evaluate("localStorage.removeItem('quality')")
        ok('sem erros de JavaScript', not errs, errs[:2])
    print('\n' + ('TUDO OK' if not falhas else f'{len(falhas)} FALHA(S): ' + ', '.join(falhas)))
    sys.exit(1 if falhas else 0)

asyncio.run(main())
