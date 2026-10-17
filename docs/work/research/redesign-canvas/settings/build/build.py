"""Generate the Settings redesign boards in the canvas's .dc.html format.

One page with section links (they jump, and follow the scroll), search, narrow, reset, prompt color, full page.
"""
import html, pathlib, re, sys

HERE = pathlib.Path(__file__).parent
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent)
OUT.mkdir(parents=True, exist_ok=True)
COMMON = (HERE / 'common.css').read_text().strip()

P = {
    'search': '<circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path>',
    'reset': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path>',
    'cloud': '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>',
    'cloudoff': '<path d="m2 2 20 20"></path><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193"></path><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07"></path>',
    'down': '<path d="m6 9 6 6 6-6"></path>',
    'alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path>',
    'x': '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    'plus': '<path d="M5 12h14"></path><path d="M12 5v14"></path>',
    'trash': '<path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>',
    'arrow': '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>',
}


def ico(name, cls='i', style=''):
    st = f' style="{style}"' if style else ''
    return f'<svg class="{cls}"{st} viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>'


SECTIONS = [
    ('general', 'General', 'What a new conversation starts with.'),
    ('perm', 'Permissions', 'Stored on this device by default, so a synced vault cannot loosen them elsewhere.'),
    ('look', 'Appearance', 'How the panel and its transcript look.'),
    ('usage', 'Usage', 'Plan usage on the status line. Read from the running session; no tokens spent.'),
    ('export', 'Export', 'A Markdown note per conversation, kept in the vault.'),
    ('cli', 'Claude Code', 'How the panel launches the Claude Code CLI on this device.'),
]

# Scroll-spy without script: each section is a view timeline seen through a 1px band just under the
# sticky bar (--hh); its link animates "on" while the section crosses the band. General starts early,
# so it is on at the top of the page too.
SPY = '\n'.join(
    f'#s-{k}{{view-timeline-name:--s-{k}}}\n'
    f'.nl[href="#s-{k}"]{{animation:nlon 1s linear;animation-timeline:--s-{k};'
    f'animation-range:cover {"-4000px" if i == 0 else "0%"} cover 100%}}'
    for i, (k, _, _) in enumerate(SECTIONS))

CSS = r"""
.app{display:flex;flex-direction:column;overflow:hidden;position:relative;--hh:89px;--tt:60px;--hdsh:rgba(0,0,0,.55);timeline-scope:--s-general,--s-perm,--s-look,--s-usage,--s-export,--s-cli}
.app.t-light{--hdsh:rgba(0,0,0,.14)}
.bd{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin;scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){.bd{scroll-behavior:auto}}
.ttl{display:flex;align-items:baseline;gap:10px;padding:22px 28px 0 28px;height:var(--tt);box-sizing:border-box}
.ttl h2{margin:0;font-size:18px;font-weight:600;letter-spacing:-.01em}
.crumb{font-size:12.5px;color:var(--faint)}
.hd{position:sticky;top:0;z-index:3;padding:12px 28px 0 28px;background:var(--bg);border-bottom:1px solid var(--line);animation:hdsh linear both;animation-timeline:scroll(nearest block);animation-range:var(--tt) calc(var(--tt) + 24px)}
@keyframes hdsh{from{box-shadow:0 10px 18px -12px transparent}to{box-shadow:0 10px 18px -12px var(--hdsh)}}
.tools{display:flex;align-items:center;gap:8px}
.srch{flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:32px;padding:0 6px 0 10px;border-radius:8px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2);color:var(--faint)}
.srch:focus-within{box-shadow:inset 0 0 0 1px var(--accent-line),0 0 0 3px var(--accent-soft)}
.srch input{flex:1;min-width:0;outline:none;color:var(--text);font-size:13px}
.srch input::placeholder{color:var(--faint)}
.srch .clr{width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;color:var(--faint)}
.srch .clr:hover{background:var(--surface-2);color:var(--text)}
.fchip{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 10px;border-radius:8px;box-shadow:inset 0 0 0 1px var(--line-2);font-size:12.5px;color:var(--muted);cursor:pointer;white-space:nowrap;position:relative;flex:none}
.fchip:hover{background:var(--surface-2);color:var(--text)}
.fchip input{position:absolute;opacity:0;top:0;left:0;width:100%;height:100%;margin:0;cursor:pointer}
.fchip:has(input:checked){background:var(--accent-soft);box-shadow:inset 0 0 0 1px var(--accent-line);color:var(--text)}
.fchip:has(input:focus-visible){outline:2px solid var(--accent-line);outline-offset:2px}
.mbar{width:3px;height:13px;border-radius:2px;background:var(--accent);flex:none}
.n{display:inline-flex;align-items:center;justify-content:center;height:18px;min-width:18px;padding:0 5px;border-radius:999px;background:var(--surface-3);color:var(--text);font-size:11px;font-weight:500;font-variant-numeric:tabular-nums}
.nav{display:flex;flex-wrap:wrap;gap:2px;margin-top:8px}
.nl{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 10px;font-size:13px;font-weight:500;color:var(--muted);white-space:nowrap;border-radius:8px 8px 0 0;text-decoration:none;background:no-repeat 50% 100%/calc(100% - 16px) 2px}
.nl:hover{color:var(--text);background-color:var(--surface-2)}
.nl:focus-visible{outline:2px solid var(--accent-line);outline-offset:-4px}
.nl .n{display:none}
.nl.on{color:var(--text);background-image:linear-gradient(var(--accent),var(--accent))}
@keyframes nlon{from,to{color:var(--text);background-image:linear-gradient(var(--accent),var(--accent))}}
@SPY@
.app.static .nl{animation:none}
.pg{padding:0 28px 28px 28px}
.sec{scroll-margin-top:var(--hh);view-timeline-axis:block;view-timeline-inset:calc(var(--hh) + 1px) calc(100% - var(--hh) - 2px)}
.sec:last-of-type{min-height:calc(var(--vh) - var(--hh))}
.app.static .sec:last-of-type{min-height:0}
.sh{display:flex;align-items:center;gap:10px;padding:30px 0 0 0}
.sec:first-of-type .sh{padding-top:20px}
.sh h3{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}
.sh .n{display:none}
.sh .sp{flex:1}
.lead{margin:3px 0 8px 0;font-size:12.5px;color:var(--faint)}
.mlead,.qlead{margin:16px 0 0 0;font-size:12.5px;color:var(--faint)}
.mlead{display:none}
.app:has(#mod:checked) .mlead{display:block}
.app:has(#mod:checked) .item:not(.chg),.app:has(#mod:checked) .lead,.app:has(#mod:checked) .rmp,.app:has(#mod:checked) .addp{display:none}
.app:has(#mod:checked) .sec:not(:has(.item.chg)),.app:has(#mod:checked) .pfg:not(:has(.item.chg)){display:none}
.app:has(#mod:checked) .nl .n{display:inline-flex}
.app:has(#mod:checked) .nl.z{opacity:.45;pointer-events:none}
.app.q .nl .n,.app.q .sh .n{display:inline-flex}
.app.q .nl.z{opacity:.45;pointer-events:none}
.app.q .sh .btn,.app.q .lead{display:none}
.show{display:inline-flex;align-items:center;gap:4px;margin-top:5px;font-size:12px;color:var(--accent);cursor:pointer}
.banner{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border-radius:9px;background:var(--orange-soft);font-size:12.5px;line-height:1.45;margin:14px 0 0 0}
.banner a{color:var(--text);font-weight:600;text-decoration:underline;text-underline-offset:2px;white-space:nowrap}
.psh{display:flex;align-items:center;gap:8px;padding:20px 0 10px 0;scroll-margin-top:calc(var(--hh) + 8px)}
.psh .pl{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}
.psh .pfn{font-size:13.5px;font-weight:600}
.psh .tag{font-size:11.5px;color:var(--faint)}
.rmp{padding:12px 0 6px 0;border-top:1px solid var(--line)}
.addp{margin-top:14px}
.item{position:relative;display:flex;align-items:center;gap:16px;padding:14px 0;border-top:1px solid var(--line)}
.item.sub{margin-left:18px}
.item.stack{flex-direction:column;align-items:stretch;gap:10px}
.item.stack .ctl.wide{justify-content:flex-end;margin-right:30px}
.item.stack .ctl.wide .tx{margin:0}
.txt{flex:1;min-width:0}
.name{font-size:14px;font-weight:500;display:flex;align-items:center;gap:6px}
.desc{font-size:12.5px;color:var(--muted);margin-top:2px;max-width:440px;line-height:1.45}
.def{display:none}
.item.chg .def{display:flex;align-items:center;gap:6px;margin-top:5px;font-size:12px;color:var(--faint)}
.item.chg .def b{font-weight:500;color:var(--muted)}
.item.chg::before{content:"";position:absolute;left:-14px;top:15px;bottom:15px;width:3px;border-radius:2px;background:var(--accent)}
.ctl{display:flex;align-items:center;gap:4px;flex:none}
.rs,.cloud{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:7px;color:var(--faint);flex:none;position:relative}
.rs:hover,.cloud:hover{background:var(--surface-2);color:var(--text)}
.rs{display:none}
.item.chg .rs{display:inline-flex}
.rs[data-tip]:hover::after,.rs.tipon::after{content:attr(data-tip);position:absolute;bottom:calc(100% + 6px);right:-4px;padding:5px 9px;border-radius:7px;background:var(--tip-bg);color:var(--tip-text);font-size:12px;line-height:1.35;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.28);z-index:5;pointer-events:none}
.dd{display:inline-flex;align-items:center;justify-content:space-between;gap:10px;height:30px;min-width:170px;padding:0 8px 0 10px;border-radius:7px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2);font-size:13px;color:var(--text);cursor:pointer;margin:0 4px 0 2px;white-space:nowrap}
.dd .i{color:var(--faint)}
.dd.off{color:var(--faint);cursor:default}
.in{height:30px;width:210px;padding:0 10px;border-radius:7px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2);font-size:13px;outline:none;margin:0 4px 0 2px}
.in.mono{font-family:'Geist Mono',ui-monospace,monospace;font-size:12.5px}
.in::placeholder{color:var(--faint)}
.in:focus,.tx:focus{box-shadow:inset 0 0 0 1px var(--accent-line),0 0 0 3px var(--accent-soft)}
.tx{width:100%;min-height:64px;padding:8px 10px;border-radius:7px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2);font-size:13px;line-height:1.5;outline:none;resize:vertical;display:block}
.tx::placeholder{color:var(--faint)}
.tg{position:relative;width:38px;height:22px;flex:none;cursor:pointer;margin:0 4px 0 2px}
.tg input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}
.tg .tr{position:absolute;top:0;right:0;bottom:0;left:0;border-radius:999px;background:var(--surface-3);transition:background .15s}
.tg .kn{position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .15s}
.tg input:checked ~ .tr{background:var(--accent-fill)}
.tg input:checked ~ .kn{transform:translateX(16px)}
.tg input:focus-visible ~ .tr{box-shadow:0 0 0 3px var(--accent-soft)}
.rg{display:inline-flex;align-items:center;gap:10px;margin:0 4px 0 2px}
.rg input{width:150px;accent-color:var(--accent-fill);margin:0}
.rg .mono{width:34px;text-align:right}
details.more{margin-top:4px;font-size:12.5px;color:var(--muted);max-width:440px}
details.more summary{cursor:pointer;color:var(--accent);list-style:none;display:inline-flex;align-items:center;gap:3px;font-size:12px}
details.more summary::-webkit-details-marker{display:none}
details.more summary .i{transition:transform .15s}
details.more[open] summary .i{transform:rotate(180deg)}
details.more dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 10px;margin:8px 0 0 0}
details.more dt{color:var(--text);font-weight:500}
details.more dd{margin:0}
mark{background:var(--accent-soft);color:var(--text);font-weight:600;border-radius:3px;padding:0 1px;box-shadow:inset 0 -1.5px 0 var(--accent-line)}
.warnbox{display:flex;gap:9px;align-items:flex-start;padding:9px 11px;border-radius:9px;background:var(--orange-soft);font-size:12.5px;line-height:1.45;margin:0 0 10px 0}
.btn-r{background:#c43c3b;color:#fff}
.pill{display:inline-flex;align-items:center;gap:4px;height:19px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:500;white-space:nowrap}
.p-warn{color:var(--orange);background:var(--orange-soft)}
.dlg{background:var(--surface);border:1px solid var(--line-2);border-radius:12px;box-shadow:var(--shadow);padding:20px 22px 18px;display:flex;flex-direction:column;gap:12px}
.dlg h3{margin:0;font-size:16px;font-weight:600;letter-spacing:-.01em}
.dlg p{margin:0;font-size:12.5px;color:var(--muted);line-height:1.5}
.cl{display:flex;flex-direction:column}
.grp{font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);padding:10px 0 2px}
.cr{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);font-size:12.5px}
.cr .nm{flex:1;min-width:0;display:flex;align-items:center;gap:6px}
.cr .nm .i{color:var(--faint)}
.cr .vv{display:flex;align-items:center;gap:6px;white-space:nowrap}
.cr .old{color:var(--faint);text-decoration:line-through;text-decoration-color:var(--faint)}
.cr .new{font-weight:500}
.cr .vv .i{color:var(--faint)}
.ck{display:flex;gap:10px;align-items:flex-start;font-size:13px;cursor:pointer}
.ck input{margin:2px 0 0 0;accent-color:var(--accent-fill);flex:none;width:15px;height:15px}
.ck .d{font-size:12px;color:var(--muted);margin-top:1px}
.acts{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.acts .btn{height:32px;padding:0 14px;font-size:12.5px}
.notice{display:flex;align-items:center;gap:14px;padding:10px 12px 10px 14px;border-radius:8px;background:var(--tip-bg);color:var(--tip-text);font-size:12.5px;box-shadow:0 8px 24px rgba(0,0,0,.3);width:fit-content}
.notice button{font-weight:600;text-decoration:underline;text-underline-offset:2px;display:inline-flex;align-items:center;gap:5px}
.cap{font-size:12px;color:var(--faint);line-height:1.5;margin:0}
.caph{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin:0 0 10px 0}
.app{--strip:#1a1a1f}
.app.t-light{--strip:#efefec}
.cin{display:inline-flex;align-items:center;gap:6px;margin:0 4px 0 2px}
.cin .in{margin:0;width:200px}
.cin.bad .in{box-shadow:inset 0 0 0 1px var(--red-line),0 0 0 3px var(--red-soft)}
.cpk{width:30px;height:30px;padding:0;border:0;border-radius:7px;background:var(--surface);cursor:pointer;box-shadow:inset 0 0 0 1px var(--line-2);flex:none}
.cpk::-webkit-color-swatch-wrapper{padding:4px}
.cpk::-webkit-color-swatch{border:0;border-radius:4px}
.cpk::-moz-color-swatch{border:0;border-radius:4px}
.err{display:flex;align-items:center;gap:6px;margin-top:5px;font-size:12px;color:var(--red)}
.app .pcx{display:none}
.app:has(#pc-custom:checked) .pcx{display:flex}
.pkw{display:flex}
.pick{display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:12px;border:1px solid var(--line-2);cursor:pointer;width:190px}
.pick:hover{border-color:var(--accent-line)}
.pick:has(input:checked){border-color:var(--accent-line);background:var(--accent-soft)}
.pick input{accent-color:var(--accent-fill);margin:0}
.pv{height:92px;border-radius:8px;background:var(--bg-2);border:1px solid var(--line);padding:10px;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.ln{height:5px;border-radius:3px;background:var(--surface-3)}
.pkc{display:flex;align-items:center;gap:8px;min-width:0}
.pkc .nm{display:flex;flex-direction:column;line-height:1.3;min-width:0}
.pkn{font-weight:500;white-space:nowrap}
.pkd{font-size:12px;color:var(--faint)}
.picks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;width:100%}
.picks .pick{width:auto;min-width:0}
.tpv{height:104px;border-radius:8px;background:var(--bg-2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;gap:6px;overflow:hidden;position:relative}
.tpv > *{zoom:.62}
.tpv .lab{font-size:12px;color:var(--faint);text-align:center;line-height:1.2;margin-top:4px;white-space:nowrap}
.fig{display:flex;flex-direction:column;align-items:center}
.mp{background:var(--bg);border:1px solid var(--line-2);border-radius:6px;display:flex;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12);flex:none;position:relative}
.mp.v{flex-direction:column}
.ms{display:flex;align-items:flex-end;height:17px;padding:3px 5px 0 5px;background:var(--strip);border-bottom:1px solid var(--line-2);flex:none;gap:0}
.mt{display:flex;align-items:center;gap:3px;height:13px;padding:0 5px;border-radius:4px 4px 0 0;font-size:6.5px;color:var(--muted);white-space:nowrap;overflow:hidden;min-width:0;flex:0 1 auto}
.mt.on{background:var(--bg);color:var(--text);font-weight:600;height:14px;margin-bottom:-1px;flex-shrink:0}
.mb{flex:1;min-width:0;padding:6px;display:flex;flex-direction:column;gap:4px}
.mpr{height:13px;border-radius:3px;background:var(--user-bg);border:1px solid var(--user-line);display:flex;align-items:center;padding:0 4px;flex:none}
.mpr span{height:3px;border-radius:2px;background:var(--user-ink);opacity:.5}
.ml{height:3px;border-radius:2px;background:var(--surface-3);flex:none}
.mc{margin-top:auto;height:15px;border-radius:4px;border:1px solid var(--line-2);background:var(--surface);flex:none}
.mcol{background:var(--bg-2);border-left:1px solid var(--line);padding:5px 4px;display:flex;flex-direction:column;gap:2px;flex:none}
.mnew{height:11px;border-radius:3px;border:1px solid var(--line-2);font-size:6px;display:flex;align-items:center;padding:0 4px;color:var(--muted);margin-bottom:3px;flex:none}
.mrow{height:11px;border-radius:3px;display:flex;align-items:center;gap:3px;padding:0 3px;font-size:6px;color:var(--muted);white-space:nowrap;overflow:hidden;flex:none}
.mrow.on{background:var(--surface);color:var(--text);box-shadow:inset 0 0 0 1px var(--line-2)}
.dot{width:4px;height:4px;border-radius:50%;flex:none;background:transparent}
.dot.busy{background:var(--accent)}
.dot.wait{background:var(--amber)}
.mtb{height:3px;border-radius:2px;background:currentColor;opacity:.55;flex:none}
.hl .ms{background:var(--accent-soft);border-bottom-color:var(--accent-line);box-shadow:inset 0 0 0 1px var(--accent-line)}
.hl .mt{color:var(--accent)}
.hl .mt.on{background:var(--bg);color:var(--accent)}
.hl .mcol{background:var(--accent-soft);border-left-color:var(--accent-line);box-shadow:inset 0 0 0 1px var(--accent-line);color:var(--accent)}
.hl .mrow,.hl .mnew{color:var(--accent)}
.hl .mnew{border-color:var(--accent-line)}
.hl .mrow.on{background:var(--bg);box-shadow:inset 0 0 0 1px var(--accent-line)}
.hl .mpr{background:var(--surface-2);border-color:var(--line-2)}
.hl .mpr span{background:var(--surface-3);opacity:1}
.arr{color:var(--faint);display:flex;flex-direction:column;align-items:center;gap:2px;font-size:12px}
.cgrid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;width:100%}
.cgrid .pick{width:auto;min-width:0;padding:8px;gap:7px;border-radius:10px}
.cpv{height:48px;border-radius:6px;background:var(--bg);border:1px solid var(--line);padding:6px;display:flex;flex-direction:column;gap:5px;overflow:hidden}
.cpp{height:18px;border-radius:5px;background:var(--f);border:1px solid var(--l);display:flex;align-items:center;gap:4px;padding:0 5px;flex:none}
.cpp .sq{width:8px;height:8px;border-radius:2px;border:1px solid var(--k);flex:none}
.cpp .br{height:4px;width:60%;border-radius:2px;background:var(--text);opacity:.4}
.cpp.none{background:none;border:1px dashed var(--line-2);justify-content:center;color:var(--faint)}
.cpv .ln{height:4px}
@PALETTE_CSS@
"""

# ---------------------------------------------------------------- controls


def toggle(on, label):
    return f'<label class="tg"><input type="checkbox"{" checked" if on else ""} aria-label="{html.escape(label)}"><span class="tr"></span><span class="kn"></span></label>'


def dd(value, label, off=False):
    return f'<button class="dd{" off" if off else ""}" aria-label="{html.escape(label)}: {html.escape(value)}"{" disabled" if off else ""}><span>{html.escape(value)}</span>{ico("down")}</button>'


def txt(value, label, ph='', mono=False, w=None):
    st = f' style="width:{w}px"' if w else ''
    return f'<input class="in{" mono" if mono else ""}"{st} value="{html.escape(value)}" placeholder="{html.escape(ph)}" aria-label="{html.escape(label)}">'


def rng(v, label):
    return f'<span class="rg"><input type="range" min="0" max="100" step="5" value="{v}" aria-label="{html.escape(label)}"><span class="mono">{v}%</span></span>'


def btn(text, cls='btn-s', icon=None, label=None):
    al = f' aria-label="{html.escape(label)}"' if label else ''
    return f'<button class="btn {cls}"{al}>{ico(icon) if icon else ""}{text}</button>'


# Prompt color presets: (key, name, dark fill, dark border, dark ink, light fill, light border, light ink).
# Clear outlines only. Mist is the default. Text stays the theme's text color.
PALETTE = [
    ('clear', 'Clear', 'transparent', 'rgba(255,255,255,.18)', '#a6a6b0', 'transparent', 'rgba(24,24,32,.18)', '#696973'),
    ('sand', 'Sand', '#2a241c', 'rgba(245,180,90,.36)', '#f5b45a', '#fdf3e4', '#ecca95', '#d98a1c'),
    ('stone', 'Stone', '#232328', 'rgba(255,255,255,.16)', '#a6a6b0', '#f0f0ed', '#d6d6d0', '#696973'),
    ('sage', 'Sage', '#1e2620', 'rgba(134,194,150,.34)', '#86c296', '#edf5ef', '#bfdac6', '#3f8f57'),
    ('sea', 'Sea', '#1a2527', 'rgba(102,196,190,.32)', '#66c4be', '#e9f5f3', '#b8dcd6', '#2a8c85'),
    ('mist', 'Mist', '#1d2330', 'rgba(128,164,228,.36)', '#80a4e4', '#ecf2fb', '#c3d3ee', '#3c6cc0'),
    ('lavender', 'Lavender', '#232030', 'rgba(168,150,240,.38)', '#a896f0', '#f2effc', '#d3caf2', '#6a52d6'),
    ('rose', 'Rose', '#2a1f24', 'rgba(232,140,166,.34)', '#e88ca6', '#fbeef1', '#ecc6d0', '#c0476b'),
]
SWATCHES = [(k, n) for k, n, *_ in PALETTE] + [('accent', 'Accent')]
DEFAULT_PC = 'mist'


def palette_css():
    # --pf/--pl/--pk: fill, line, ink for the current mode. --tdf/--tdl, --tlf/--tll: dark and light
    # fill and line in any mode, for the Theme thumbnails that show both.
    d = ';'.join(f'--pf-{k}:{df};--pl-{k}:{dl};--pk-{k}:{dk}' for k, _, df, dl, dk, *_ in PALETTE)
    l = ';'.join(f'--pf-{k}:{lf};--pl-{k}:{ll};--pk-{k}:{lk}' for k, _, _, _, _, lf, ll, lk in PALETTE)
    both = ';'.join(f'--tdf-{k}:{df};--tdl-{k}:{dl};--tlf-{k}:{lf};--tll-{k}:{ll}' for k, _, df, dl, _, lf, ll, _ in PALETTE)
    acc = ('--pl-accent:var(--accent-line);--pk-accent:var(--accent);'
           '--tdf-accent:color-mix(in srgb,var(--accent-fill) 16%,#141417);--tdl-accent:var(--accent-line);'
           '--tlf-accent:color-mix(in srgb,var(--accent-fill) 8%,#fbfbfa);--tll-accent:var(--accent-line)')

    def use(k):
        return (f'--user-bg:var(--pf-{k});--user-line:var(--pl-{k});--user-ink:var(--pk-{k});'
                f'--ud-f:var(--tdf-{k});--ud-l:var(--tdl-{k});--ul-f:var(--tlf-{k});--ul-l:var(--tll-{k})')
    live = '\n'.join(f'.app:has(#pc-{k}:checked){{{use(k)}}}' for k, _ in SWATCHES)
    return (f'.app{{{d};{both};--pf-accent:color-mix(in srgb,var(--accent-fill) 16%,var(--bg));{acc}}}\n'
            f'.app.t-light{{{l};--pf-accent:color-mix(in srgb,var(--accent-fill) 8%,var(--bg))}}\n'
            f'.app,.app.t-light{{{use(DEFAULT_PC)}}}\n' + live)


CSS = CSS.replace('@PALETTE_CSS@', palette_css()).replace('@SPY@', SPY)


def prompt_colors(sel=DEFAULT_PC, ids=True, group='pc', custom=None):
    def cell(k, n, prev):
        idattr = f' id="pc-{k}"' if ids else ''
        return (f'<label class="pick"><div class="cpv" aria-hidden="true">{prev}<div class="ln" style="width:82%"></div><div class="ln" style="width:56%"></div></div>'
                f'<span class="pkc"><input type="radio" name="{group}"{idattr}{" checked" if k == sel else ""}><span class="pkn">{n}</span></span></label>')
    out = ''.join(cell(k, n, f'<div class="cpp" style="--f:var(--pf-{k});--l:var(--pl-{k});--k:var(--pk-{k})"><span class="sq"></span><span class="br"></span></div>')
                  for k, n in SWATCHES)
    if custom:
        cp = (f'<div class="cpp" style="--f:{custom};--l:color-mix(in srgb,{custom},var(--text) 25%);--k:var(--muted)">'
              '<span class="sq"></span><span class="br"></span></div>')
    else:
        cp = f'<div class="cpp none">{ico("plus", "i i12")}</div>'
    out += cell('custom', 'Custom', cp)
    return f'<div class="cgrid" role="radiogroup" aria-label="Prompt color">{out}</div>'


def color_in(value, hexv, bad=False):
    inv = ' aria-invalid="true"' if bad else ''
    return (f'<span class="cin{" bad" if bad else ""}"><input type="color" class="cpk" value="{hexv}" aria-label="Pick a color">'
            f'<input class="in mono" value="{html.escape(value)}" placeholder="#hex, rgb(), hsl(), name" aria-label="Custom color"{inv}></span>')


PC_DESC = 'Fills and outlines your own messages; Clear only outlines them. Each color has a light and a dark version; Mist is the default.'
CC_DESC = 'Any CSS color, used in both modes. A translucent one, e.g. hsl(200 40% 50% / .15), suits both. The picker writes a hex value.'

# Thumbnail pickers, markup from the canvas: Settings.dc.html (Theme, Prompt style), TabThumbB.dc.html (Conversation tabs).
# The prompt in the Theme thumbnails takes the picked prompt color.
THEME_PICKS = (
    '<div role="radiogroup" aria-label="Theme" style="display:flex;gap:10px">'
    '<label class="pick"><div class="pv" aria-hidden="true" style="padding:0;display:grid;grid-template-columns:1fr 1fr;gap:0">'
    '<div style="background:#141417;padding:10px 0 10px 10px;display:flex;flex-direction:column;gap:6px"><div style="align-self:flex-end;width:70%;height:14px;border-radius:6px 0 0 6px;background:var(--ud-f);border:1px solid var(--ud-l);border-right:0"></div><div class="ln" style="width:100%;background:#2f2f36;border-radius:3px 0 0 3px"></div><div class="ln" style="width:100%;background:#2f2f36;border-radius:3px 0 0 3px"></div><div class="ln" style="width:100%;background:#2f2f36;border-radius:3px 0 0 3px"></div></div>'
    '<div style="background:#fbfbfa;padding:10px 10px 10px 0;display:flex;flex-direction:column;gap:6px"><div style="width:40%;height:14px;border-radius:0 6px 2px 0;background:var(--ul-f);border:1px solid var(--ul-l);border-left:0"></div><div class="ln" style="width:72%;background:#e3e3de;border-radius:0 3px 3px 0"></div><div class="ln" style="width:36%;background:#e3e3de;border-radius:0 3px 3px 0"></div><div class="ln" style="width:52%;background:#e3e3de;border-radius:0 3px 3px 0"></div></div>'
    '</div><span style="display:flex;align-items:center;gap:8px"><input type="radio" name="th" checked><span style="display:flex;flex-direction:column;line-height:1.3;min-width:0"><span style="font-weight:500">Match Obsidian</span><span style="font-size:12px;color:var(--faint)">now {{now}}</span></span></span></label>'
    '<label class="pick"><div class="pv" aria-hidden="true" style="background:#fbfbfa;border-color:#e3e3de">'
    '<div style="align-self:flex-end;width:58%;height:14px;border-radius:6px 6px 2px 6px;background:var(--ul-f);border:1px solid var(--ul-l)"></div>'
    '<div class="ln" style="width:86%;background:#e3e3de"></div><div class="ln" style="width:68%;background:#e3e3de"></div><div class="ln" style="width:76%;background:#e3e3de"></div>'
    '<div style="margin-top:auto;height:16px;border-radius:5px;border:1px solid #e3e3de"></div>'
    '</div><span style="display:flex;align-items:center;gap:8px"><input type="radio" name="th"><span style="font-weight:500">Light</span></span></label>'
    '<label class="pick"><div class="pv" aria-hidden="true" style="background:#141417;border-color:#2f2f36">'
    '<div style="align-self:flex-end;width:58%;height:14px;border-radius:6px 6px 2px 6px;background:var(--ud-f);border:1px solid var(--ud-l)"></div>'
    '<div class="ln" style="width:86%;background:#2f2f36"></div><div class="ln" style="width:68%;background:#2f2f36"></div><div class="ln" style="width:76%;background:#2f2f36"></div>'
    '<div style="margin-top:auto;height:16px;border-radius:5px;border:1px solid #2f2f36"></div>'
    '</div><span style="display:flex;align-items:center;gap:8px"><input type="radio" name="th"><span style="font-weight:500">Dark</span></span></label>'
    '</div>')

_PS_POP = ('<div style="height:20px;border-radius:5px;background:var(--user-bg);border:1px solid var(--user-line);display:flex;align-items:center;gap:4px;padding:0 5px">'
           '<span style="width:8px;height:8px;border-radius:2px;background:var(--user-ink);opacity:.45"></span><span style="height:4px;width:{w};border-radius:2px;background:var(--surface-3)"></span></div>')
_PS_BUB = '<div style="align-self:flex-end;width:{w};height:16px;border-radius:7px 7px 2px 7px;background:var(--user-bg);border:1px solid var(--user-line)"></div>'
_PS_LINES = '<div class="ln" style="width:86%"></div><div class="ln" style="width:70%"></div><div class="ln" style="width:78%"></div>'


def _ps(top, bottom, name, sub, checked=False):
    return (f'<label class="pick"><div class="pv" aria-hidden="true">{top}{_PS_LINES}{bottom}</div>'
            f'<span style="display:flex;align-items:center;gap:8px"><input type="radio" name="ps"{" checked" if checked else ""}><span style="display:flex;flex-direction:column;line-height:1.3;min-width:0"><span style="font-weight:500">{name}</span><span style="font-size:12px;color:var(--faint)">{sub}</span></span></span></label>')


STYLE_PICKS = ('<div role="radiogroup" aria-label="Prompt style" style="display:flex;gap:10px">'
               + _ps(_PS_POP.format(w='60%'), _PS_POP.format(w='44%'), 'Card', 'numbered, full width', True)
               + _ps(_PS_BUB.format(w='62%'), _PS_BUB.format(w='48%'), 'Bubble', 'right-aligned')
               + '</div>')

_MB = ('<div class="mb"><div class="mpr"><span style="width:55%"></span></div><div class="ml" style="width:92%"></div><div class="ml" style="width:78%"></div>'
       '<div class="ml" style="width:85%"></div><div class="ml" style="width:60%"></div><div class="mc"></div></div>')
_MS = ('<div class="ms"><span class="mt on"><span class="mtb" style="width:22px"></span></span><span class="mt"><span class="mtb" style="width:16px"></span></span>'
       '<span class="mt"><span class="mtb" style="width:18px"></span></span></div>')


def _mcol(w):
    return (f'<div class="mcol" style="width:{w}px"><div class="mnew"><span class="mtb" style="width:26px"></span></div>'
            '<div class="mrow on"><span class="dot busy"></span><span class="mtb" style="width:34px"></span></div>'
            '<div class="mrow"><span class="dot wait"></span><span class="mtb" style="width:28px"></span></div>'
            '<div class="mrow"><span class="dot"></span><span class="mtb" style="width:31px"></span></div>'
            '<div class="mrow" style="margin-top:3px"><span class="dot"></span><span class="mtb" style="width:24px"></span></div></div>')


def _tp(prev, name, sub, checked=False):
    return (f'<label class="pick"><div class="tpv" aria-hidden="true">{prev}</div>'
            f'<span class="pkc"><input type="radio" name="tp"{" checked" if checked else ""}><span class="nm"><span class="pkn">{name}</span><span class="pkd">{sub}</span></span></span></label>')


TAB_PICKS = ('<div class="picks" role="radiogroup" aria-label="Conversation tabs">'
             + _tp(f'<div class="mp v hl" style="width:176px;height:128px">{_MS}{_MB}</div>', 'Top', 'strip above')
             + _tp(f'<div class="mp hl" style="width:276px;height:128px">{_MB}{_mcol(92)}</div>', 'Side', 'column beside')
             + _tp(f'<div class="fig"><div class="mp v hl" style="width:100px;height:112px">{_MS}{_MB}</div><div class="lab">narrow</div></div>'
                   f'<div class="arr">{ico("arrow")}wider</div>'
                   f'<div class="fig"><div class="mp hl" style="width:150px;height:112px">{_MB}{_mcol(56)}</div><div class="lab">wide</div></div>',
                   'Automatic', 'by panel width', True)
             + '</div>')


# ---------------------------------------------------------------- the settings, by section

PERM_MORE = ('<details class="more"><summary>Details' + ico('down', 'i i12') + '</summary><dl>'
             '<dt>Claude Code default</dt><dd>the mode set in Claude Code’s own settings</dd>'
             '<dt>Accept edits</dt><dd>file edits in the vault run without asking</dd>'
             '<dt>Plan</dt><dd>read-only until you approve the plan</dd>'
             '<dt>Auto-approve</dt><dd>every call runs without a card, except calls Claude Code flags</dd>'
             '</dl></details>')

# (section, name, desc, control html, local?, default-if-changed, extra) ; local None = no badge
ROWS = [
    ('general', 'Model', 'An alias (opus, sonnet, fable, haiku) or a full model id. A pick in the chat overrides it for later conversations.',
     txt('opus', 'Model', 'Claude Code default', w=170), False, 'Claude Code default', {}),
    ('general', 'Default reasoning effort', 'Higher thinks longer and costs more. Changeable per conversation.',
     dd('High', 'Default reasoning effort'), False, 'CLI default', {}),
    ('general', 'Include note context by default', 'Attach the active note’s path and selection to each message. Toggle per message in the chat.',
     toggle(True, 'Include note context by default'), False, None, {}),
    ('general', 'Vault instructions', 'Appended to Claude’s system prompt in this vault. A CLAUDE.md in the vault root works too.',
     '<textarea class="tx" rows="3" aria-label="Vault instructions" placeholder="E.g. notes live in Areas/, use wikilinks, keep headings in sentence case"></textarea>',
     True, None, {'stack': True}),

    ('perm', 'Default permission mode', 'How Claude asks before using tools. Changeable per conversation.',
     dd('Accept edits', 'Default permission mode'), True, 'Claude Code default', {'more': PERM_MORE}),
    ('perm', 'Bypass-permissions mode', 'Adds “Bypass permissions” to the mode menu. In it every tool, shell commands included, runs without asking.',
     toggle(False, 'Bypass-permissions mode'), True, None, {'warn': True}),
    ('perm', 'Vault tools for Claude', 'Rename with link updates, backlinks, tag and property search, the open note. Each call still asks. Needs Claude Code 2.1.210+.',
     toggle(True, 'Vault tools for Claude'), True, None, {}),
    ('perm', 'The composer’s “!” shell escape', '“!” and a command runs it in the vault folder. It skips Claude Code’s permission prompts; nothing reaches Claude unless you add it.',
     toggle(False, 'The composer’s “!” shell escape'), True, 'On', {}),

    ('look', 'Theme', 'The panel and the workflow view follow Obsidian unless you pick one here.',
     THEME_PICKS, False, None, {'stack': True, 'pick': True}),
    ('look', 'Conversation tabs', 'Where the open conversations are listed. Automatic uses the side column whenever the panel is wide enough for one.',
     TAB_PICKS, False, 'Top', {'stack': True, 'pick': True}),
    ('look', 'Prompt style', 'How your own messages stand out in the transcript.',
     STYLE_PICKS, False, None, {'stack': True, 'pick': True}),
    ('look', 'Prompt color', PC_DESC, prompt_colors(), False, None, {'stack': True, 'pick': True}),
    ('look', 'Custom color', CC_DESC, color_in('', '#80a4e4'), None, None, {'sub': True, 'cls': 'pcx'}),
    ('look', 'Pin the current prompt while scrolling', 'The prompt you are reading under stays at the top, cut to one line.',
     toggle(True, 'Pin the current prompt while scrolling'), False, None, {}),
    ('look', 'Prompt jump rail', 'A tick per prompt on the right edge. Hover to preview, click to jump. Card only.',
     toggle(True, 'Prompt jump rail'), False, None, {'sub': True}),

    ('usage', 'Show plan usage', 'The 5-hour and fullest weekly limit at the end of the status line.',
     toggle(True, 'Show plan usage'), False, None, {}),
    ('usage', 'Refresh interval', 'How often usage is re-read while it shows: 30s, 5m, 1h. Minimum 10s.',
     txt('5m', 'Refresh interval', '5m', w=90), False, None, {'sub': True}),
    ('usage', 'Warning threshold', 'A limit turns orange from this percentage.',
     rng(75, 'Warning threshold'), False, '70%', {'sub': True}),
    ('usage', 'Critical threshold', 'A limit turns red from this percentage.',
     rng(90, 'Critical threshold'), False, None, {'sub': True}),

    ('export', 'Export transcripts to Markdown', 'Updated as the conversation goes. “Export conversation to Markdown” works anytime. The badge covers the three rows below.',
     toggle(True, 'Export transcripts to Markdown'), False, 'Off', {}),
    ('export', 'Folder', 'Created if missing.',
     txt('Agent Chats', 'Folder', 'Agent Chats', w=180), None, None, {'sub': True}),
    ('export', 'Note name pattern', '{date}, {title} and {id}; “/” makes subfolders.',
     txt('{date} {title}', 'Note name pattern', '{date} {title}', mono=True, w=180), None, None, {'sub': True}),
    ('export', 'Date format', 'Moment format for {date}; YYYY/MM gives a folder per month.',
     txt('YYYY-MM-DD', 'Date format', 'YYYY-MM-DD', mono=True, w=180), None, None, {'sub': True}),
]

# Claude Code: the profiles stacked, every row on the page. The section's badge covers them all.
DETECT = '<button class="btn btn-s" style="margin-right:4px">Detect</button>'
WIN_ROWS = [
    ('cli', 'Profile name', 'Shown in the composer’s Profile control.', txt('Windows', 'Profile name', w=170), None, None, {}),
    ('cli', 'Claude CLI path', 'Path to the claude executable. Empty means auto-detect.',
     txt('~/.local/bin/claude', 'Claude CLI path', 'Auto-detect', w=190) + DETECT, None, 'Auto-detect', {}),
    ('cli', 'Run via WSL', 'Launch the CLI inside your WSL distro. Windows only.', toggle(False, 'Run via WSL'), None, None, {}),
    ('cli', 'Claude in Chrome', 'Lets Claude drive your browser through the Claude in Chrome extension. Needs a claude.ai login.',
     dd('Claude Code default', 'Claude in Chrome'), None, None, {}),
    ('cli', 'Sandbox', 'Runs Claude’s shell commands in the OS sandbox, without asking. Needs bubblewrap and socat.',
     dd('Claude Code default', 'Sandbox'), None, None, {}),
    ('cli', 'Additional arguments', 'Added to every launch, e.g. --add-dir ~/projects. No shell reads them.',
     txt('', 'Additional arguments', 'None', mono=True, w=190), None, None, {}),
    ('cli', 'Use for new conversations', 'This profile is the default.', toggle(True, 'Use for new conversations'), None, None, {}),
]


def wsl_rows(narrow=False):
    return [
        ('cli', 'Profile name', 'Shown in the composer’s Profile control.', txt('WSL', 'Profile name', w=140), None, None, {}),
        ('cli', 'Claude CLI path', 'Read inside WSL, e.g. claude.', txt('claude', 'Claude CLI path', 'Auto-detect', mono=True, w=150) + DETECT,
         None, None, {'stack': True} if narrow else {}),
        ('cli', 'Run via WSL', 'Launch the CLI inside your WSL distro.', toggle(True, 'Run via WSL'), None, None, {}),
        ('cli', 'Claude in Chrome', 'Not available in WSL.', dd('Claude Code default', 'Claude in Chrome', off=True), None, None, {}),
        ('cli', 'Sandbox', 'Needs bubblewrap and socat in the distro.', dd('On', 'Sandbox'), None, 'Claude Code default', {}),
        ('cli', 'Additional arguments', 'Added to every launch of this profile.', txt('', 'Additional arguments', 'None', mono=True, w=150), None, None, {}),
        ('cli', 'Use for new conversations', 'Windows is the default now.', toggle(False, 'Use for new conversations'), None, None, {}),
    ]


ADD_ROW = ('cli', 'Add a CLI profile', 'Another way to launch Claude Code, e.g. WSL beside Windows.', btn('Add profile', icon='plus'), None, None, {})

LOCAL_TIP = 'Stored on this device only. Click to sync across devices.'
SYNC_TIP = 'Synced across devices. Click to store on this device only.'
ALERT = ico('alert', 'i', 'color:var(--orange)')


def row(r, mark=None, show=False):
    sec, name, desc, ctl, local, default, x = r
    if mark:
        x = {k: v for k, v in x.items() if k != 'sub'}
        name = re.sub(f'(?i)({mark})', r'<mark>\1</mark>', name)
        desc = re.sub(f'(?i)({mark})', r'<mark>\1</mark>', desc)
    cls = ('item' + (' chg' if default else '') + (' sub' if x.get('sub') else '') + (' stack' if x.get('stack') else '')
           + (' ' + x['cls'] if x.get('cls') else ''))
    plain = re.sub('<[^>]+>', '', name)
    warn = ALERT if x.get('warn') else ''
    badge = '' if local is None else f'<button class="cloud" aria-label="{LOCAL_TIP if local else SYNC_TIP}">{ico("cloudoff" if local else "cloud")}</button>'
    rs = f'<button class="rs" data-tip="Reset to default: {html.escape(default)}" aria-label="Reset {html.escape(plain)} to default: {html.escape(default)}">{ico("reset")}</button>' if default else ''
    defl = f'<div class="def">Default: <b>{html.escape(default)}</b></div>' if default else ''
    more = x.get('more', '')
    sh = (f'<a class="show" role="link" tabindex="0" aria-label="Show {html.escape(plain)} on the full page">Show{ico("arrow", "i i12")}</a>'
          if show else '')
    txtb = f'<div class="txt"><div class="name">{warn}{name}</div><div class="desc">{desc}</div>{more}{defl}{sh}</div>'
    slot = badge or '<span class="cloud" aria-hidden="true"></span>'
    if x.get('stack'):
        return (f'<div class="{cls}"><div style="display:flex;align-items:flex-start;gap:12px">{txtb}<div class="ctl">{rs}{slot}</div></div>'
                + (f'<div class="pkw">{ctl}</div></div>' if x.get('pick') else f'<div class="ctl wide">{ctl}</div></div>'))
    return f'<div class="{cls}">{txtb}<div class="ctl">{rs}{ctl}{slot}</div></div>'


def section_rows(k, narrow=False):
    if k == 'cli':
        return WIN_ROWS + wsl_rows(narrow)
    return [r for r in ROWS if r[0] == k]


def changed(k):
    return sum(1 for r in section_rows(k) if r[5])


TOTAL = sum(changed(k) for k, _, _ in SECTIONS)


def profile(pid, name, extra, rows, warn='', remove=None):
    rm = f'<div class="rmp">{btn(remove, "btn-d", "trash")}</div>' if remove else ''
    return (f'<div class="pfg"><div class="psh" id="p-{pid}"><span class="pl">Profile</span><span class="pfn">{name}</span>{extra}</div>'
            f'{warn}{"".join(row(r) for r in rows)}{rm}</div>')


def cli_body(missing=False, narrow=False):
    warn = (f'<div class="warnbox">{ico("alert", "i", "color:var(--orange);margin-top:2px")}<span>Claude Code was not found in WSL. '
            'Install it in the distro, or set the path and press Detect.</span></div>') if missing else ''
    return (profile('win', 'Windows', '<span class="tag">default</span>', WIN_ROWS)
            + profile('wsl', 'WSL', ALERT if missing else '', wsl_rows(narrow), warn, 'Remove the WSL profile')
            + f'<div class="addp">{row(ADD_ROW)}</div>')


def section(k, label, lead, body, count=None):
    n = changed(k)
    rs = btn(f'Reset {n}', 'btn-g', 'reset', f'Reset {n} settings in {label}') if n else ''
    cloud = f'<button class="cloud" aria-label="{LOCAL_TIP} Covers every row in this section.">{ico("cloudoff")}</button>' if k == 'cli' else ''
    cnt = f'<span class="n">{count}</span>' if count is not None else ''
    return (f'<section class="sec" id="s-{k}" aria-labelledby="h-{k}"><div class="sh"><h3 id="h-{k}">{label}</h3>{cnt}<span class="sp"></span>{rs}{cloud}</div>'
            f'<p class="lead">{lead}</p>{body}</section>')


def all_sections(missing=False, narrow=False):
    return ''.join(section(k, label, lead, cli_body(missing, narrow) if k == 'cli' else ''.join(row(r) for r in section_rows(k)))
                   for k, label, lead in SECTIONS)


def nav(counts=None, on=None, cli_alert=False):
    links = ''
    for k, label, _ in SECTIONS:
        cls = 'nl' + (' on' if k == on else '') + (' z' if counts is not None and not counts[k] else '')
        cur = ' aria-current="location"' if k == on else ''
        n = f'<span class="n">{counts[k]}</span>' if counts is not None else ''
        links += f'<a class="{cls}" href="#s-{k}"{cur}>{label}{ALERT if (k == "cli" and cli_alert) else ""}{n}</a>'
    return f'<nav class="nav" aria-label="Settings sections">{links}</nav>'


TITLE = '<div class="ttl"><h2>AI Agent Panel</h2><span class="crumb">Settings → Community plugins</span></div>'


def bar(nav_html, query='', compact=False, modified_input=True):
    clr = f'<button class="clr" aria-label="Clear search">{ico("x", "i i12")}</button>' if query else ''
    q = f' value="{html.escape(query)}"' if query else ''
    chk = '<input type="checkbox" id="mod" aria-label="Show modified settings only">' if modified_input else ''
    chip_label = '' if compact else 'Modified'
    reset_all = (f'<button class="ib" aria-label="Reset all settings to default">{ico("reset")}</button>' if compact
                 else btn('Reset all…', 'btn-g', 'reset'))
    return (f'<div class="hd"><div class="tools">'
            f'<label class="srch">{ico("search")}<input{q} placeholder="Search settings" aria-label="Search settings">{clr}</label>'
            f'<label class="fchip" title="Show modified settings only">{chk}<span class="mbar"></span>{chip_label}<span class="n">{TOTAL}</span></label>'
            f'{reset_all}</div>{nav_html}</div>')


# The canvas frame does not follow in-page #anchors, so section links scroll .bd themselves.
JUMP = """    if (!window.__dcJump) {
      window.__dcJump = true;
      document.addEventListener('click', e => {
        const a = e.composedPath().find(n => n.tagName === 'A' && (n.getAttribute('href') || '').startsWith('#'));
        if (!a) return;
        const t = a.getRootNode().getElementById(a.getAttribute('href').slice(1));
        const bd = t && t.closest('.bd');
        if (!bd) return;
        e.preventDefault();
        bd.scrollTo({ top: bd.scrollTop + t.getBoundingClientRect().top - bd.getBoundingClientRect().top - (parseFloat(getComputedStyle(t).scrollMarginTop) || 0) });
      }, true);
    }
"""


def page(fname, title, w, h, body, extra_css='', theme_default='dark'):
    props = ('{"theme":{"editor":"enum","options":["dark","light"],"default":"%s"},'
             '"accent":{"editor":"enum","options":["violet","blue","teal"],"default":"violet"},'
             '"$preview":{"width":%d,"height":%d}}') % (theme_default, w, h)
    doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>' + html.escape(title) + '</title>\n'
           '<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n'
           '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap" rel="stylesheet">\n'
           '<style>\n' + COMMON + '\n' + CSS.strip() + '\n' + extra_css.strip() + '\n</style>\n</helmet>\n'
           + body.replace('@W@', str(w)).replace('@H@', str(h)) +
           '\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props=\'' + props + '\'>\n'
           'class Component extends DCLogic {\n  renderVals() {\n'
           + JUMP +
           "    const theme = this.props.theme ?? '" + theme_default + "';\n"
           "    const accent = this.props.accent ?? 'violet';\n"
           "    return { mods: 't-' + theme + ' acc-' + accent, now: theme === 'dark' ? 'Dark' : 'Light' };\n  }\n}\n</script>\n</body>\n</html>\n")
    (OUT / fname).write_text(doc)
    print('wrote', fname, len(doc))


def app(extra_cls=''):
    return f'<div class="app {{{{mods}}}}{" " + extra_cls if extra_cls else ""}" style="width:@W@px;height:@H@px;--vh:@H@px">'


# ---------------------------------------------------------------- board 1: one page, section links, Modified filter

counts_mod = {k: changed(k) for k, _, _ in SECTIONS}
mlead = f'<p class="mlead">{TOTAL} settings differ from their defaults. Each shows its default under the description.</p>'
page('SettingsTabs.dc.html', 'Settings, one page with section links and the Modified filter', 720, 900,
     app() + '<div class="bd">' + TITLE + bar(nav(counts_mod)) + f'<div class="pg">{mlead}{all_sections()}</div></div></div>')

# ---------------------------------------------------------------- board 2: search filters the page in place

Q = 'prompt'
hits = [r for r in ROWS if re.search(Q, re.sub('<[^>]+>', '', r[1] + ' ' + r[2]), re.I)]
counts_q = {k: sum(1 for r in hits if r[0] == k) for k, _, _ in SECTIONS}
qlead = (f'<p class="qlead">{len(hits)} settings match “{Q}” in {sum(1 for v in counts_q.values() if v)} sections. '
         'Names, descriptions and values are searched; Esc clears. Show clears the search and scrolls to the setting.</p>')
res = ''.join(section(k, label, lead, ''.join(row(r, Q, show=True) for r in hits if r[0] == k), counts_q[k])
              for k, label, lead in SECTIONS if counts_q[k])
page('SettingsSearch.dc.html', 'Settings search, matches in place', 720, 900,
     app('q') + '<div class="bd">' + TITLE + bar(nav(counts_q), query=Q, modified_input=False) + f'<div class="pg">{qlead}{res}</div></div></div>')

# ---------------------------------------------------------------- board 3: narrow, links wrap, CLI missing, profiles stacked

banner = (f'<div class="banner" role="status">{ico("alert", "i", "color:var(--orange);margin-top:2px")}'
          '<span>Claude Code was not found in WSL, so the WSL profile can’t start conversations. <a href="#p-wsl">Fix it</a></span></div>')
css3 = """
.app{--hh:@HH3@px;--tt:0px}
.app .hd{padding:12px 16px 0 16px}
.app .pg{padding:0 16px 20px 30px}
.app .nav{display:grid;grid-template-columns:repeat(3,max-content);gap:0 2px}
.app .nl{padding:0 9px}
.app .item{gap:12px}
.app .dd{min-width:0}
.app .in{max-width:150px}
.app .desc{max-width:none}
.app .item.chg::before{left:-12px}
.app .pick{width:auto;flex:1;min-width:0}
.app .picks .pick{padding:8px}
.app .tpv{height:76px;gap:3px}
.app .tpv > *{zoom:.34}
.app .pkw > [role=radiogroup]{flex:1;min-width:0}
.app .cgrid{grid-template-columns:repeat(4,minmax(0,1fr))}
"""
HH3 = 125
page('SettingsNarrow.dc.html', 'Settings at a narrow width, CLI missing', 460, 900,
     app() + '<div class="bd">' + bar(nav(cli_alert=True), compact=True, modified_input=False)
     + f'<div class="pg">{banner}{all_sections(missing=True, narrow=True)}</div></div></div>', css3.replace('@HH3@', str(HH3)))

# ---------------------------------------------------------------- board 4: reset dialogs and undo

RESET_H = 860


def cr(name, old, new, local, warn=None):
    w = f'<span class="pill p-warn">{warn}</span>' if warn else ''
    return (f'<div class="cr"><span class="nm">{ico("cloudoff" if local else "cloud", "i i12")}<span class="ell">{name}</span>{w}</span>'
            f'<span class="vv"><span class="old">{old}</span>{ico("arrow", "i i12")}<span class="new">{new}</span></span></div>')


left = ('<div style="display:flex;flex-direction:column;gap:14px">'
        '<p class="caph">A section: “Reset 2” on its heading</p>'
        '<div class="sh" style="padding:0 0 10px 0;border-bottom:1px solid var(--line)"><h3>Permissions</h3><span class="sp"></span>'
        + btn('Reset 2', 'btn-g', 'reset', 'Reset 2 settings in Permissions') + '</div>'
        '<div class="dlg" role="dialog" aria-label="Reset Permissions to default">'
        '<h3>Reset Permissions to default?</h3>'
        '<p>2 settings change. Both are stored on this device only.</p>'
        '<div class="cl">'
        + cr('Default permission mode', 'Accept edits', 'Claude Code default', True)
        + cr('The composer’s “!” shell escape', 'Off', 'On', True, 'turns on')
        + '</div>'
        f'<div class="acts">{btn("Cancel")}{btn("Reset 2 settings", "btn-p")}</div></div>'
        f'<div class="notice" role="status">Permissions reset to default.<button>{ico("reset", "i i12")}Undo</button></div>'
        '<p class="caph" style="margin-top:22px">A row: its reset icon</p>'
        '<div class="item chg" style="margin-left:14px;border-top:0;padding-top:40px;align-items:flex-start">'
        '<div class="txt"><div class="name">Default reasoning effort</div><div class="desc">Higher thinks longer and costs more.</div><div class="def">Default: <b>CLI default</b></div></div>'
        f'<div class="ctl"><button class="rs tipon" data-tip="Reset to default: CLI default" aria-label="Reset Default reasoning effort to default: CLI default">{ico("reset")}</button>'
        f'{dd("High", "Default reasoning effort")}<button class="cloud" aria-label="{SYNC_TIP}">{ico("cloud")}</button></div></div>'
        '<p class="cap">A row resets at once, no dialog; the notice offers Undo. A section or everything asks first and lists each change. '
        'A reset that turns a capability on is marked.</p>'
        '</div>')

right = ('<div style="display:flex;flex-direction:column;gap:14px">'
         '<p class="caph">Everything: “Reset all…”</p>'
         '<div class="dlg" role="dialog" aria-label="Reset all settings to default">'
         '<h3>Reset all settings to default?</h3>'
         '<p>7 settings in 5 sections change. Synced ones (cloud) change on every device that syncs this vault.</p>'
         '<div class="cl">'
         '<div class="grp">General</div>'
         + cr('Model', 'opus', 'Claude Code default', False)
         + cr('Default reasoning effort', 'High', 'CLI default', False)
         + '<div class="grp">Permissions</div>'
         + cr('Default permission mode', 'Accept edits', 'Claude Code default', True)
         + cr('The composer’s “!” shell escape', 'Off', 'On', True, 'turns on')
         + '<div class="grp">Appearance</div>'
         + cr('Conversation tabs', 'Automatic', 'Top', False)
         + '<div class="grp">Usage</div>'
         + cr('Warning threshold', '75%', '70%', False)
         + '<div class="grp">Export</div>'
         + cr('Export transcripts to Markdown', 'On', 'Off', False)
         + '</div>'
         '<label class="ck"><input type="checkbox"><span>Also reset Claude Code<div class="d">Claude CLI path goes back to auto-detect; the WSL sandbox to the Claude Code default.</div></span></label>'
         '<label class="ck"><input type="checkbox"><span>Also reset what syncs<div class="d">Every cloud badge goes back to its default: Claude Code, permissions and vault instructions on this device, the rest synced.</div></span></label>'
         f'<div class="acts">{btn("Cancel")}{btn("Reset 7 settings", "btn-r")}</div></div>'
         '<p class="cap">Text a reset would delete, such as vault instructions, is listed with its first line.</p>'
         '</div>')

page('SettingsReset.dc.html', 'Settings reset: a row, a section, everything', 1040, RESET_H,
     '<div class="app {{mods}}" style="width:@W@px;height:@H@px;padding:32px 36px;display:grid;grid-template-columns:1fr 1fr;gap:44px;align-content:start">'
     + left + right + '</div>')

# ---------------------------------------------------------------- board 5: prompt color

CUSTOM = 'hsl(200 40% 50% / .15)'
pc_default = ('look', 'Prompt color', PC_DESC, prompt_colors(DEFAULT_PC, ids=False, group='s1'), False, None, {'stack': True, 'pick': True})
pc_custom = ('look', 'Prompt color', PC_DESC, prompt_colors('custom', ids=False, group='s2', custom=CUSTOM), False, 'Mist', {'stack': True, 'pick': True})
cc_ok = ('look', 'Custom color', CC_DESC, color_in(CUSTOM, '#4d91b3'), None, None, {'sub': True})
cc_bad = ('look', 'Custom color', CC_DESC, color_in('blu', '#4d91b3', bad=True), None, None,
          {'sub': True, 'more': f'<div class="err">{ico("alert", "i i12")}Not a CSS color. The prompt keeps the last valid one.</div>'})


def card(inner):
    return f'<div class="card">{inner}</div>'


def mode(light):
    rows = ''.join(f'<div class="pvl">{n}</div><div class="po" style="--f:var(--pf-{k});--l:var(--pl-{k});--k:var(--pk-{k})">'
                   '<span class="pn">3</span><span class="pot">Summarize the open decisions</span></div>' for k, n in SWATCHES)
    rows += (f'<div class="pvl">Custom · {CUSTOM}</div><div class="po" style="--f:{CUSTOM};--l:color-mix(in srgb,{CUSTOM},var(--text) 25%);--k:var(--muted)">'
             '<span class="pn">3</span><span class="pot">Summarize the open decisions</span></div>')
    return (f'<div class="app{" t-light" if light else ""} acc-violet pvw"><div class="pvh">{"Light" if light else "Dark"}</div>{rows}'
            '<p class="asst">Three are open: pricing, the launch date and the beta list.</p></div>')


css5 = """
.card{padding:0 16px 0 24px;border:1px solid var(--line);border-radius:12px;margin-bottom:22px}
.card .item:first-child{border-top:0}
.card .item.sub{margin-left:18px}
.card .desc{max-width:none}
.pvw{flex-direction:column;gap:5px;padding:14px 14px 16px;border-radius:12px;border:1px solid var(--line-2);min-width:0}
.pvh{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-bottom:4px}
.pvl{font-size:11px;color:var(--faint);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.po{display:flex;align-items:center;gap:7px;background:var(--f);border:1px solid var(--l);border-radius:8px;padding:6px 9px;min-width:0}
.pn{display:inline-flex;align-items:center;justify-content:center;min-width:16px;height:16px;padding:0 3px;border:1px solid var(--k);border-radius:4px;color:var(--text);font-size:10px;flex:none}
.pot{font-weight:500;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.asst{margin:8px 0 0 0;font-size:12.5px;color:var(--text);line-height:1.5}
"""

left5 = ('<div>'
         '<p class="caph">Default: Mist</p>' + card(row(pc_default))
         + '<p class="caph">Custom: typed, or picked</p>' + card(row(pc_custom) + row(cc_ok))
         + '<p class="caph">Not a color</p>' + card(row(cc_bad))
         + '<p class="cap">Clear only outlines; the others also fill. Each has a light and a dark version, so it reads in both modes. '
           'Search also finds Clear as outline, quiet or none. The Prompt style and Theme thumbnails show the picked color; the reset icon goes back to Mist.</p>'
         '</div>')
right5 = ('<div style="display:flex;flex-direction:column;gap:14px">'
          '<p class="caph" style="margin:0">Every color, in each mode</p>'
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' + mode(False) + mode(True) + '</div>'
          '<p class="cap">Text keeps the theme’s text color; the number box takes the color’s ink.</p>'
          '</div>')

page('SettingsPromptColor.dc.html', 'Settings: prompt color', 1180, 1130,
     '<div class="app {{mods}}" style="width:@W@px;height:@H@px;padding:32px 36px;display:grid;grid-template-columns:620px 1fr;gap:44px;align-content:start">'
     + left5 + right5 + '</div>', css5)

# ---------------------------------------------------------------- board set 6: the full page, dark and light

FULL_H = 4700
css6 = '.app .bd{overflow:visible}'
for th in ('dark', 'light'):
    page(f'SettingsFull-{th.capitalize()}.dc.html', f'Settings, full page, {th}', 720, FULL_H,
         app('static') + '<div class="bd">' + TITLE + bar(nav(on='general'), modified_input=False)
         + f'<div class="pg">{all_sections()}</div></div></div>', css6, theme_default=th)
