#!/usr/bin/env python3
"""版本墙（首页第 2 屏，也是第 3 屏背后那面灰墙）的设计侧生成脚本。

用法：python3 generate_wall.py     （在 design/wall/ 目录里跑，只用标准库）
输出：tiles.json   定稿的 40 张小图：位置、尺寸、比例、底色、模板名、语言、内部 HTML
      preview.html 把 40 张拼在 1440x900 里的预览（不含页头和计数块）

这面墙是手排的，不是随机切出来的：
- 四种真实的广告比例：1:1、4:5、9:16、1.91:1。每张小图的高都是按比例从宽算出来的。
- 画面分成 8 条竖带（L1 L2 L3 M1 M2 R1 R2 R3），每条带里一行一行往上或往下排；
  一行可以是一张，也可以是两张等高的并排。
- 三个东西把相邻的竖带连起来，所以竖缝不会贯穿整屏：中间的母版（跨 M1+M2）、
  左下的横幅（跨 L2+L3）、右边的两张横幅（跨 R1+R2 和 R2+R3）。
- 墙比屏幕大：最左、最右两条带和每条带的头尾都伸到 1440x900 外面，被屏幕裁掉。
- 左下角 428x146 留给计数块，左边三条带都从它上沿往上排。

S-05 把它移植成构建时脚本时，以 tiles.json 为准做快照对比。
计数（版本数、语言数、尺寸数）一律从结果里数，不手写。
"""
import json

INK = '#1C1C1B'
B = lambda name: '../assets/img/' + name

CUT={'open':('pebble_cut_open.webp',640,629),'closed':('pebble_cut_closed.webp',640,510),'top':('pebble_cut_top.webp',640,495),
     'pair':('pebble_cut_pair.webp',760,345),'single':('pebble_cut_single.webp',640,643),'hero':('pebble_cut_hero.webp',1336,808),'hand':('pebble_cut_hand.webp',620,990),
     'float':('pebble_cut_float.webp',600,1038),'pinch':('pebble_cut_pinch.webp',640,786),'side':('pebble_cut_side.webp',760,421)}
PHOTO={'ear':'pebble_photo_ear.jpg','table':'pebble_photo_table.jpg','trumpet':'pebble_trumpet.jpg','subway':'pebble_subway.jpg',
       'megaphone':'pebble_mute_megaphone.jpg','alarm':'pebble_mute_alarm.jpg','horn':'pebble_mute_horn.jpg','whistle':'pebble_mute_whistle.jpg',
       'cymbals':'pebble_mute_cymbals.jpg','cairn':'pebble_cairn_pebbles.jpg','macro':'pebble_macro_ring.jpg','crosswalk':'pebble_scene_crosswalk.jpg',
       'bus':'pebble_scene_bus_night.jpg','portrait':'pebble_portrait_profile.jpg','roadworks':'pebble_scene_roadworks.jpg','pocket':'pebble_pocket_denim.jpg','flatlay':'pebble_flatlay_pockets.jpg'}
COBALT,CREAM,STONE,PALE,BRASS,NAVY,DARK='#2743C9','#F3EEE2','#CBC7BE','#B9C8EC','#CDA349','#16205A','#2A2A28'
PALS={'cobalt':(COBALT,CREAM),'stone':(STONE,INK),'dark':(DARK,CREAM),'pale':(PALE,INK),'brass':(BRASS,INK),'navy':(NAVY,CREAM),'cream':(CREAM,INK)}
NB=lambda *parts, sep='': sep.join(f'<span style="display: inline-block">{p}</span>' for p in parts)
HL={'mute':('en','Mute the city.'),'ja':('ja',NB('街を、','ミュート。')),'rush':('en','Rush hour, on silent.'),'de':('de','Stadt auf stumm.'),
    'fr':('fr','Coupe le son de la ville.'),'commute':('en','Commute, minus the noise.'),'es':('es','Silencia la ciudad.'),
    'ko':('ko',NB('도시를','음소거.',sep=' ')),'ar':('ar','اكتم ضجيج المدينة.'),'pocket':('en','Quiet fits in a pocket.')}
RATIO={'1:1':1.0,'4:5':0.8,'9:16':9/16,'1.91:1':1.91}
G=4
SW,SH=1440,900

# ---------------- layout: strips of exact-ratio tiles, growing away from anchors ----------------
T=[]
def hh(w,r): return round(w/RATIO[r])
def add(x,y,w,h,r,c):
    d=dict(x=x,y=y,w=w,h=h,r=r); d.update(c); T.append(d)
def row(x,y,w,spec,cont):
    """place one row whose top is y; returns its height"""
    if isinstance(spec,str):
        h=hh(w,spec); add(x,y,w,h,spec,cont); return h
    n=len(spec); h=round((w-G*(n-1))/sum(RATIO[r] for r in spec)); xx=x
    for i,r in enumerate(spec):
        ww=round(RATIO[r]*h) if i<n-1 else x+w-xx
        add(xx,y,ww,h,r,cont[i]); xx+=ww+G
    return h
def rowh(w,spec):
    if isinstance(spec,str): return hh(w,spec)
    return round((w-G*(len(spec)-1))/sum(RATIO[r] for r in spec))
def up(x,w,bottom,rows):
    y=bottom
    for spec,cont in rows:
        h=rowh(w,spec); y-=h; row(x,y,w,spec,cont); y-=G
def down(x,w,top,rows):
    y=top
    for spec,cont in rows:
        h=row(x,y,w,spec,cont); y+=h+G

c=lambda t,pal='cobalt',**k: dict(t=t,pal=pal,**k)
L1,L2,L3=(-84,156),(76,164),(244,186)
M1,M2=(434,236),(674,260)
R1,R2,R3=(938,220),(1162,176),(1342,136)
COUNTER=(2,752,428,146)
MX,MY,MW=434,170,500

# left group: everything sits on top of the counter block
P=lambda img,pos='50% 50%',**k: dict(t='photo',pal='dark',img=img,pos=pos,bg='#2A2A28',**k)
LBH=hh(354,'1.91:1'); LBY=COUNTER[1]-G-LBH
add(76,LBY,354,LBH,'1.91:1',P('roadworks','50% 35%',hl='commute',fs=23,fg=INK,box=(0.30,0.07,0.54)))
up(*L1,COUNTER[1]-G,[
 ('9:16',c('cut','navy',cut='single',cw=1.5,cx=0.86,cy=0.52,rot=-10)),
 ('1:1', c('type','stone',hl='rush',fs=21,mark=False,align='right')),
 ('4:5', P('cairn')),
 ('1:1', c('flat','dark')),
])
up(*L2,LBY-G,[
 ('4:5', P('pocket',hl='pocket',fs=17,fg=INK,box=(0.22,0.06,0.74))),
 (('9:16','9:16'),[c('cut','cobalt',cut='single',cw=1.25,cx=0.52,cy=0.56,rot=12), c('cut','dark',cut='closed',cw=1.05,cx=0.5,cy=0.7)]),
 ('1:1', P('whistle',hl='ko',fs=17,fg=CREAM,box=(0.08,0.2,0.86))),
 ('1.91:1', c('flat','navy')),
])
up(*L3,LBY-G,[
 ('4:5', P('portrait',hl='es',fs=20,fg=INK,box=(0.08,0.06,0.86))),
 ('1.91:1', c('type','dark',hl='ar',fs=21,mark=False)),
 (('9:16','9:16'),[c('cut','pale',cut='pinch',cw=1.15,cx=0.5,cy=0.4), c('cut','cobalt',cut='float',cw=0.84,cx=0.5,cy=0.52)]),
 ('1:1', c('flat','stone')),
])

# the key visual and what grows above and below it
add(MX,MY,MW,MW,'1:1',c('mother'))
up(*M1,MY-G,[
 ('1.91:1', P('megaphone',hl='mute',html='Mute<br>the city.',fs=17,fg=INK,box=(0.06,0.12,0.36))),
 ('1:1', c('flat','cobalt')),
])
up(*M2,MY-G,[
 (('9:16','9:16'),[P('subway'), c('type','dark',hl='ko',fs=19,mark=True)]),
])
down(*M1,MY+MW+G,[
 ('1.91:1', P('cymbals',hl='ja',fs=18,fg=CREAM,box=(0.56,0.14,0.4))),
 (('4:5','4:5'),[c('cut','stone',cut='side',cw=1.05,cx=0.5,cy=0.4), c('cut','cobalt',cut='open',cw=0.9,cx=0.5,cy=0.42)]),
])
down(*M2,MY+MW+G,[
 ('4:5', P('flatlay')),
])

# right group: two banners bridge the strips
RB1Y=236; RB1H=hh(400,'1.91:1')
add(938,RB1Y,400,RB1H,'1.91:1',c('type','stone',hl='de',fs=58,mark=True,big=True))
up(*R1,RB1Y-G,[
 ('4:5', P('ear','45% 30%')),
])
down(*R1,RB1Y+RB1H+G,[
 (('4:5','9:16'),[P('horn'), c('hand','brass')]),
 ('1:1', P('bus','55% 0%',hl='fr',fs=19,fg=CREAM,box=(0.2,0.07,0.74))),
 ('1.91:1', c('flat','pale',mark=True)),
])
up(*R2,RB1Y-G,[
 (('9:16','9:16'),[c('cut','cobalt',cut='closed',cw=1.1,cx=0.5,cy=0.62), c('cut','stone',cut='single',cw=1.15,cx=0.5,cy=0.58,rot=-12)]),
 ('1.91:1', c('flat','dark')),
])
R2MY=RB1Y+RB1H+G; R2MH=hh(R2[1],'1.91:1')
add(R2[0],R2MY,R2[1],R2MH,'1.91:1',P('macro','100% 50%'))
RB2Y=R2MY+R2MH+G; RB2W=R2[1]+G+R3[1]; RB2H=hh(RB2W,'1.91:1')
add(R2[0],RB2Y,RB2W,RB2H,'1.91:1',c('banner','cobalt',hl='mute',html='Mute<br>the city.',fs=30,tw=0.42,cut='hero',cw=0.5,cx=0.69,cy=0.56,rot=-8,winner=True))
down(*R2,RB2Y+RB2H+G,[
 ('4:5', P('alarm','45% 50%',hl='ar',fs=18,fg=INK,box=(0.08,0.06,0.84))),
])
up(*R3,RB2Y-G,[
 ('9:16', P('crosswalk')),
 ('1:1', P('table')),
 ('4:5', c('flat','cobalt')),
])
down(*R3,RB2Y+RB2H+G,[
 ('9:16', c('cut','dark',cut='open',cw=1.2,cx=0.3,cy=0.3)),
])

VIS=[t for t in T if t['x']<SW and t['x']+t['w']>0 and t['y']<SH and t['y']+t['h']>0]

# ---------------- tile contents ----------------
used=set()
def hl(key):
    lang,t=HL[key]; used.add(lang)
    return lang,f'<span lang="{lang}"'+(' dir="rtl"' if lang=='ar' else '')+f'>{t}</span>'
def cutimg(name,W,H,cw,cx,cy,rot=0):
    b,w0,h0=CUT[name]; w=round(cw*W); h=round(w*h0/w0); l=round(cx*W-w/2); t=round(cy*H-h/2)
    return f'<img src="{B(b)}" alt="" style="position: absolute; left: {l}px; top: {t}px; width: {w}px; height: {h}px; max-width: none'+(f'; transform: rotate({rot}deg)' if rot else '')+'">'
def cover(b,pos):
    return f'<img src="{B(b)}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: {pos}">'
def span(inner,css): return f'<span style="position: absolute; {css}">{inner}</span>'
def mark(pad,where='top',side='left',fs=10): return span('PEBBLESOUND',f'{side}: {pad}px; {where}: {pad}px; font-size: {fs}px; letter-spacing: 0.1em')
def headline(key,pad,where,fs,extra='',off=None):
    lang,h=hl(key); al='; text-align: right' if lang=='ar' else ''
    return span(h,f'left: {pad}px; right: {pad}px; {where}: {pad if off is None else off}px; font-size: {fs}px; line-height: 1.08; letter-spacing: -0.01em{al}{extra}')

def render(t):
    W,H,k=t['w'],t['h'],t['t']; bg,fg=PALS[t['pal']]; pad=max(8,min(20,round(min(W,H)*0.08))); inner=''
    if k=='flat':
        if t.get('mark'): inner=mark(pad)
    elif k=='cut':
        inner=cutimg(t['cut'],W,H,t['cw'],t['cx'],t['cy'],t.get('rot',0))
        if t.get('hl'): inner+=headline(t['hl'],pad,t.get('tp','top'),t['fs'],'; text-align: right' if t.get('align')=='right' else '')
        if t.get('mark'): inner+=mark(pad,fs=9)
    elif k=='type':
        if t.get('big'):
            inner=mark(22,'top','right',11)+headline(t['hl'],22,'bottom',t['fs'],'; letter-spacing: -0.025em; line-height: 1')
        else:
            if t.get('mark'): inner=mark(pad,fs=9)
            inner+=headline(t['hl'],pad,'bottom',t['fs'],'; text-align: right' if t.get('align')=='right' else '')
    elif k=='photo':
        bg=t['bg']; fg=t.get('fg',CREAM); inner=cover(PHOTO[t['img']],t['pos'])
        if t.get('hl') and t.get('box'):
            lang,h=hl(t['hl']); bl,bt,bw=t['box']; al='; text-align: right' if lang=='ar' else ''
            if t.get('html'): h=f'<span lang="{lang}">{t["html"]}</span>'
            inner+=span(h,f'left: {round(bl*W)}px; top: {round(bt*H)}px; width: {round(bw*W)}px; font-size: {t["fs"]}px; line-height: 1.08; letter-spacing: -0.01em{al}')
        elif t.get('hl'): inner+=headline(t['hl'],pad,t.get('tp','top'),t['fs'],'; text-align: right' if t.get('align')=='right' else '',t.get('off'))
    elif k=='hand':
        b,w0,h0=CUT['hand']; w=round(W*0.98); h=round(w*h0/w0)
        inner=f'<img src="{B(b)}" alt="" style="position: absolute; left: {round((W-w)/2)-4}px; top: {round(H*0.3) if t.get("hl") else H-h+2}px; width: {w}px; height: {h}px; max-width: none">'+(headline(t['hl'],pad,'top',t['fs']) if t.get('hl') else '')
    elif k=='banner':
        lang,h=hl(t['hl']); al='; text-align: right' if lang=='ar' else ''
        if t.get('html'): h=f'<span lang="{lang}">{t["html"]}</span>'
        inner=cutimg(t['cut'],W,H,t['cw'],t['cx'],t['cy'],t.get('rot',0))+span(h,f'left: {pad}px; width: {round(W*t["tw"])}px; top: {pad}px; font-size: {t["fs"]}px; line-height: 1.06; letter-spacing: -0.015em{al}')
    elif k=='mother':
        bg,fg='#1B35B0',CREAM; used.add('en')
        inner=(cover(PHOTO['trumpet'],'80% 50%')
          +'<span lang="en" style="position: absolute; left: 28px; top: 24px; font-size: 84px; line-height: 0.94; letter-spacing: -0.035em">Mute<br>the city.</span>'
          +span('PEBBLESOUND','left: 30px; bottom: 28px; font-size: 12px; letter-spacing: 0.1em')
          +'<span style="position: absolute; right: 22px; top: 22px; display: flex; align-items: center; gap: 8px; padding: 6px 13px; border-radius: 999px; background: #F3EEE2; color: #1C1C1B; font-size: 14px"><span aria-hidden="true" style="width: 7px; height: 7px; border-radius: 50%; background: #1C1C1B"></span>母版</span>')
    return f'<div style="position: absolute; left: {t["x"]}px; top: {t["y"]}px; width: {W}px; height: {H}px; overflow: hidden; background: {bg}; color: {fg}">{inner}</div>'

out=[render(t) for t in VIS]
NT=len(VIS); NL=len(used); NS=len({t['r'] for t in VIS})

# ---------------- output ----------------
import re
def parts(t):
    h = render(t)
    m = re.match(r'<div style="[^"]*?background: (#[0-9A-Fa-f]{6}); color: (#[0-9A-Fa-f]{6})">(.*)</div>$', h, flags=re.S)
    return m.group(1), m.group(2), m.group(3)

if __name__ == '__main__':
    tiles = []
    for i, t in enumerate(VIS):
        bg, fg, inner = parts(t)
        lang = 'en' if t['t'] == 'mother' else (HL[t['hl']][0] if t.get('hl') else None)
        tiles.append({'index': i, 'left': t['x'], 'top': t['y'], 'width': t['w'], 'height': t['h'], 'ratio': t['r'],
                      'background': bg, 'color': fg, 'template': t['t'], 'language': lang,
                      'keyVisual': t['t'] == 'mother', 'winner': bool(t.get('winner')), 'html': inner})
    doc = {
        'layout': {'screen': [SW, SH], 'gap': G, 'ratios': {k: round(v, 4) for k, v in RATIO.items()},
                   'strips': {'L1': L1, 'L2': L2, 'L3': L3, 'M1': M1, 'M2': M2, 'R1': R1, 'R2': R2, 'R3': R3},
                   'keyVisual': {'left': MX, 'top': MY, 'width': MW, 'height': MW},
                   'counterBlock': {'left': COUNTER[0], 'top': COUNTER[1], 'width': COUNTER[2], 'height': COUNTER[3]},
                   'bleed': 'tiles run past all four edges of the 1440x900 screen on purpose; the screen clips them'},
        'counts': {'versions': NT, 'languages': NL, 'sizes': NS},
        'languages': sorted(used),
        'sizes': sorted({t['r'] for t in VIS}),
        'tiles': tiles,
    }
    json.dump(doc, open('tiles.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    body = '\n'.join(out)
    open('preview.html', 'w', encoding='utf-8').write(
        '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>版本墙预览</title>'
        '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400&family=Noto+Sans+SC:wght@400&display=swap" rel="stylesheet">'
        '<style>body{margin:0}</style></head><body>'
        '<div style="position: relative; width: 1440px; height: 900px; overflow: hidden; background: #1C1C1B; '
        "font-family: 'Inter Tight', 'Noto Sans SC', system-ui, sans-serif; font-weight: 400\">" + body + '</div></body></html>')
    print('tiles', NT, 'languages', NL, 'sizes', NS)
