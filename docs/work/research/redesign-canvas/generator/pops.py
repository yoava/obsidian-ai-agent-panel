import pathlib
OUT = pathlib.Path('design/project')
ZAP = '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>'
SPARK = '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>'
GAUGE = '<path d="m12 14 4-4"></path><path d="M3.34 19a10 10 0 1 1 17.32 0"></path>'
SHIELD = '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path>'
SPIN = '<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>'
STOP = '<rect x="6" y="6" width="12" height="12" rx="2" style="fill:currentColor;stroke:none"></rect>'
MAX = '<path d="M15 3h6v6"></path><path d="m21 3-7 7"></path><path d="m3 21 7-7"></path><path d="M9 21H3v-6"></path>'
MARK = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path><path d="m7.5 8 2.5 2.5L7.5 13"></path><path d="M12.5 13h4"></path>'
CHECK = '<path d="M20 6 9 17l-5-5"></path>'
def ico(p, cls='i', style=''):
    return f'<svg class="{cls}"{f" style={chr(34)}{style}{chr(34)}" if style else ""} viewBox="0 0 24 24" aria-hidden="true">{p}</svg>'
def ring(pct, color='var(--accent)'):
    return f'<svg viewBox="0 0 16 16" style="width:13px;height:13px;flex:none" aria-hidden="true"><circle cx="8" cy="8" r="6" style="fill:none;stroke:var(--line-2);stroke-width:2.4"></circle><circle cx="8" cy="8" r="6" transform="rotate(-90 8 8)" style="fill:none;stroke:{color};stroke-width:2.4;stroke-linecap:round;stroke-dasharray:{37.7*pct/100:.1f} 37.7"></circle></svg>'
def status(on='', working=False):
    o = lambda k: ' on" aria-expanded="true' if on == k else ''
    cache = ico(ZAP, 'i i12', 'color:var(--green);animation:pulse 2s ease-in-out infinite') if working else ico(ZAP, 'i i12', 'color:var(--green)') + '<span class="mono" style="color:var(--text)">4:12</span>'
    return f'''<div style="display:flex;align-items:center;padding:0 2px">
      <button class="seg{o('model')}" style="color:var(--text)">{ico(SPARK,'i i12','color:var(--accent)')}Opus 5.5</button>
      <button class="seg{o('effort')}">{ico(GAUGE,'i i12')}High</button>
      <button class="seg{o('perm')}">{ico(SHIELD,'i i12')}Edits</button>
      <span style="flex:1"></span>
      <button class="seg{o('ctx')}" aria-label="Context 34%, cache warm">{ring(34)}<span class="mono">34%</span><span class="cdiv"></span>{cache}</button>
      <button class="seg{o('usage')}" aria-label="Plan usage"><span>5h</span><span class="mono" style="color:var(--text)">42%</span><span style="color:var(--faint)">·</span><span>wk</span><span class="mono" style="color:var(--text)">18%</span></button>
    </div>'''
def composer(working=False):
    btns = (f'<button aria-label="Stop" style="width:30px;height:30px;border-radius:9px;background:var(--red-soft);color:var(--red);display:inline-flex;align-items:center;justify-content:center;margin-right:4px">{ico(STOP)}</button>' if working else '')
    ph = 'Claude is working. Enter queues another message…' if working else 'Reply, or @ to mention a note…'
    return f'''<div style="background:var(--surface);border:1px solid var(--line-2);border-radius:14px;box-shadow:var(--shadow);padding:10px 8px 8px 12px;display:flex;flex-direction:column;gap:8px">
      <textarea class="ta" rows="2" aria-label="Message" placeholder="{ph}"></textarea>
      <div style="display:flex;align-items:center;gap:2px">
        <button class="ib" aria-label="Attach a file as context"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg></button>
        <span style="flex:1"></span>{btns}
        <button aria-label="Send" style="width:30px;height:30px;border-radius:9px;background:var(--accent-fill);color:#fff;display:inline-flex;align-items:center;justify-content:center"><svg class="i i16" style="stroke-width:2.2" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path></svg></button>
      </div>
    </div>'''
TAIL = f'''<div class="ub">Draft a short update I can paste into Slack.</div>
    <div style="display:flex;gap:8px;align-items:flex-start;flex:none">
      <span class="mark">{ico(MARK,'i i12')}</span>
      <span class="md" style="font-size:13.5px"><strong>Q4 planning, quick update:</strong> five open questions are now tasks with owners and dates. Maya has copy review and launch sign-off; Daniel has the interview loop and the 2027 budget draft.</span>
    </div>'''
def page(title, h, extra_css, body):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap" rel="stylesheet">
<style>
/*COMMON*/
{extra_css}
</style>
</helmet>
<div class="app {{{{mods}}}}" style="width:440px;height:{h}px;display:flex;flex-direction:column;overflow:hidden;border-left:1px solid var(--line)">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"theme":{{"editor":"enum","options":["dark","light"],"default":"dark"}},"accent":{{"editor":"enum","options":["violet","blue","teal"],"default":"violet"}},"$preview":{{"width":440,"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{
    const theme = this.props.theme ?? 'dark';
    const accent = this.props.accent ?? 'violet';
    return {{ mods: 't-' + theme + ' acc-' + accent }};
  }}
}}
</script>
</body>
</html>
'''
def crop(pop, on, working=False, above=''):
    return f'''  <main style="flex:1;min-height:0;overflow:hidden;padding:16px 16px 10px 16px;display:flex;flex-direction:column;justify-content:flex-end;gap:12px">
    {TAIL}
  </main>
  <div style="padding:6px 12px 10px 12px;display:flex;flex-direction:column;gap:6px;position:relative">
    {pop}
    {above}
    {composer(working)}
    {status(on, working)}
  </div>'''

# ---------- Usage ----------
usage_pop = f'''<div class="pop" role="dialog" aria-label="Plan usage" style="position:absolute;right:12px;bottom:44px;width:318px;z-index:2">
      <div class="pop-h"><span class="pop-t">Plan usage</span><span style="flex:1"></span><span style="font-size:11.5px;color:var(--faint)">as of 14:32</span><button class="ib" style="width:26px;height:26px" aria-label="Refresh"><svg class="i i12" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path><path d="M16 16h5v5"></path></svg></button></div>
      <div class="pop-b" style="gap:12px">
        <div style="display:flex;flex-direction:column;gap:5px">
          <div class="kv"><span style="color:var(--text)">Session</span><span style="color:var(--faint)">5 hours</span><span class="v mono" style="font-size:13px">42%</span></div>
          <div class="bar"><span style="width:42%;background:var(--accent)"></span></div>
          <span style="font-size:11.5px;color:var(--faint)">Resets 16:59 · in 2h 27m</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <div class="kv"><span style="color:var(--text)">Week</span><span style="color:var(--faint)">all models</span><span class="v mono" style="font-size:13px">18%</span></div>
          <div class="bar"><span style="width:18%;background:var(--accent)"></span></div>
          <span style="font-size:11.5px;color:var(--faint)">Resets Thu 08:00 · in 3d 17h</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px">
          <div class="kv"><span style="color:var(--text)">Week</span><span style="color:var(--faint)">Sonnet</span><span class="v mono" style="font-size:13px;color:var(--orange);font-weight:500">81%</span></div>
          <div class="bar"><span style="width:81%;background:var(--orange)"></span></div>
          <span style="font-size:11.5px;color:var(--faint)">Resets Thu 08:00 · in 3d 17h</span>
        </div>
        <div class="kv" style="padding-top:10px;border-top:1px solid var(--line)"><span class="k">Extra usage</span><span class="v"><span class="mono">$0 of $50</span> <span style="color:var(--faint)">· off</span></span></div>
      </div>
      <div class="pop-f">
        <button class="btn btn-g" style="padding:0 6px"><span class="mono">/usage</span> in chat</button>
        <span style="flex:1"></span>
        <button class="btn btn-g" style="padding:0 6px">Usage settings{ico('<path d="M7 7h10v10"></path><path d="M7 17 17 7"></path>','i i12')}</button>
      </div>
    </div>'''
(OUT/'PopUsage.dc.html').write_text(page('Plan usage popover', 600, '', crop(usage_pop, 'usage')))

# ---------- Model & effort ----------
def opt(name, sub, on=False, tag=''):
    radio = f'<span style="width:16px;height:16px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;{"background:var(--accent-fill);color:#fff" if on else "box-shadow:inset 0 0 0 1.5px var(--line-2)"}">{ico(CHECK,"i","width:10px;height:10px;stroke-width:3") if on else ""}</span>'
    return f'''<button class="mi{' on' if on else ''}" role="menuitemradio" aria-checked="{'true' if on else 'false'}">{radio}<span class="grow" style="display:flex;flex-direction:column;line-height:1.3"><span style="display:flex;align-items:center;gap:6px"><span style="font-weight:500">{name}</span>{tag}</span><span class="ell" style="font-size:11.5px;color:var(--faint)">{sub}</span></span></button>'''
TAG1M = '<span style="font-size:10.5px;padding:0 5px;height:16px;border-radius:4px;background:var(--surface-2);color:var(--muted);display:inline-flex;align-items:center">1M</span>'
model_pop = f'''<div class="pop" role="dialog" aria-label="Model and effort" style="position:absolute;left:12px;bottom:44px;width:300px;z-index:2">
      <div class="pop-h" style="padding-bottom:4px"><span class="lbl">Model</span></div>
      <div role="menu" style="padding:0 6px 6px 6px;display:flex;flex-direction:column">
        {opt('Default', 'Whatever Claude Code picks · Opus 5.5 now')}
        {opt('Opus 5.5', 'Most capable for complex work', True)}
        {opt('Opus 5.5', 'For long conversations', False, TAG1M)}
        {opt('Sonnet 5.5', 'Fast and capable for everyday tasks')}
        {opt('Haiku 4.5', 'Fastest for quick answers')}
        {opt('Opus plan → Sonnet', 'Opus plans, Sonnet does the work')}
      </div>
      <div class="pop-b pop-s" style="gap:8px">
        <div style="display:flex;align-items:center;gap:6px"><span class="lbl">Effort</span><span style="flex:1"></span><span style="font-size:11.5px;color:var(--faint)">deeper thinking, slower replies</span></div>
        <div class="sgm" role="radiogroup" aria-label="Effort"><button>Low</button><button>Medium</button><button class="on" aria-checked="true">High</button><button>Extra</button><button>Max</button></div>
      </div>
      <div class="pop-f" style="padding:8px 12px;font-size:11.5px;color:var(--faint)">Applies from your next message · this conversation only</div>
    </div>'''
model_css = '''.mi{display:flex;align-items:center;gap:10px;width:100%;padding:7px 8px;border-radius:8px;text-align:left}
.mi:hover{background:var(--surface-2)}
.mi.on{background:var(--accent-soft)}
.sgm{display:grid;grid-template-columns:repeat(5,1fr);padding:2px;border-radius:8px;background:var(--surface-2);gap:2px}
.sgm button{height:26px;border-radius:6px;font-size:11.5px;color:var(--muted)}
.sgm button.on{background:var(--surface);color:var(--text);font-weight:500;box-shadow:0 1px 2px rgba(0,0,0,.2),inset 0 0 0 1px var(--line-2)}'''
(OUT/'PopModel.dc.html').write_text(page('Model and effort popover', 600, model_css, crop(model_pop, 'model')))

# ---------- Agents ----------
def arow(state, name, sub, t, stop=True):
    icon = {'run': ico(SPIN,'i spin','color:var(--accent)'), 'q': ico('<circle cx="12" cy="12" r="9" stroke-dasharray="3.5 3.5"></circle>','i','color:var(--faint)'), 'ok': ico(CHECK,'i','color:var(--green)')}[state]
    st = f'<button class="stp" aria-label="Stop {name}" title="Stop">{ico(STOP,"i i12")}</button>' if stop else '<span style="width:24px"></span>'
    return f'''<div class="ar">{icon}<span style="display:flex;flex-direction:column;min-width:0;line-height:1.35"><span class="ell" style="font-weight:500;{'color:var(--muted);font-weight:400' if state=='q' else ''}">{name}</span><span class="ell{' mono' if state=='run' else ''}" style="font-size:11.5px;color:var(--faint)">{sub}</span></span><span class="mono" style="font-size:11px;color:var(--faint)">{t}</span>{st}</div>'''
agents_pop = f'''<div class="pop" role="dialog" aria-label="Running agents" style="position:absolute;left:12px;right:12px;bottom:206px;z-index:2">
      <div class="pop-h"><span class="pop-t">Running in this conversation</span><span style="flex:1"></span><span class="mono" style="font-size:11px;color:var(--faint);margin-right:4px">3 running · 2 waiting</span></div>
      <div style="padding:8px 6px 6px 6px;display:flex;flex-direction:column;gap:2px">
        <div style="display:flex;align-items:center;gap:6px;padding:4px 6px"><span class="lbl">Workflow</span><span class="ell grow" style="font-size:12px;color:var(--muted)">Link &amp; due-date audit · Verify 1/4</span><button class="btn btn-g" style="height:22px;padding:0 6px;font-size:11.5px">{ico(MAX,'i i12')}Open</button></div>
        {arow('run','Verify Website relaunch','Read Meetings/2026-10-02 Planning sync.md','1m 33s')}
        {arow('run','Verify Hiring plan','Grep "due::" in Projects/Hiring/','1m 29s')}
        {arow('q','Verify Newsletter plan','queued · next free slot','—', False)}
        {arow('q','Fix links &amp; dates','after Verify','—', False)}
        <div style="display:flex;align-items:center;gap:6px;padding:8px 6px 4px 6px;border-top:1px solid var(--line);margin-top:4px"><span class="lbl">Background shell</span></div>
        {arow('run','rg -l "TODO" --glob "*.md"','started by Claude · output 214 lines','3m 02s')}
      </div>
      <div class="pop-f">
        <span class="grow" style="font-size:11.5px;color:var(--faint)">2 finished · 1 failed</span>
        <button class="btn btn-d" style="background:var(--red-soft)">{ico(STOP,'i i12')}Stop all</button>
      </div>
    </div>'''
runbar = f'''<div role="status" aria-expanded="true" style="position:relative;overflow:hidden;display:flex;align-items:center;gap:8px;height:38px;padding:0 4px 0 12px;border-radius:12px;background:var(--surface-2);border:1px solid var(--accent-line);font-size:12.5px">
      {ico(SPIN,'i spin','color:var(--accent)')}
      <span style="font-weight:500;white-space:nowrap">3 running</span>
      <span class="ell grow" style="color:var(--faint)">· 2 waiting · Link &amp; due-date audit</span>
      <span class="mono" style="font-size:11px;color:var(--faint)">2m 14s</span>
      <button class="ib" aria-label="Open the workflow view">{ico(MAX)}</button>
      <button class="ib" aria-label="Collapse">{ico('<path d="m6 9 6 6 6-6"></path>')}</button>
    </div>'''
agents_css = '''.ar{display:grid;grid-template-columns:18px minmax(0,1fr) auto 24px;align-items:center;column-gap:9px;min-height:40px;padding:4px 4px 4px 8px;border-radius:8px;font-size:12.5px}
.ar:hover{background:var(--surface-2)}
.stp{width:24px;height:24px;border-radius:7px;color:var(--faint);display:inline-flex;align-items:center;justify-content:center}
.stp:hover{background:var(--red-soft);color:var(--red)}'''
(OUT/'PopAgents.dc.html').write_text(page('Running agents popover', 640, agents_css, crop(agents_pop, '', True, runbar)))
print('ok')
