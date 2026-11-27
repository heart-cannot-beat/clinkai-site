#!/usr/bin/env python3
"""版本墙（首页第 2 屏）的设计侧生成脚本。

用法：python3 generate_wall.py     （在 design/wall/ 目录里跑，只用标准库）
输出：tiles.json   定稿的 40 张小图：位置、底色、模板名、内部 HTML
      preview.html 把 40 张拼在 1440x900 里的预览（不含页头和计数块）

画面是 10 列 x 6 行的格子（每格 144x150，格间留 4px），左下角 3 格留给计数块。
pack() 用固定种子把格子切成 1x1、1x2、2x1、2x2 四种尺寸；每种尺寸轮流套一组模板。
S-05 把它移植成构建时脚本时，以 tiles.json 为准做快照对比：同样的输入必须得到同样的 40 张。
计数（版本数、语言数、尺寸数）一律从结果里数，不手写。
"""
import json, random

INK = '#1C1C1B'
B = lambda name: '../assets/img/' + name

CUT={'open':('pebble_cut_open.webp',640,629),'closed':('pebble_cut_closed.webp',640,510),'top':('pebble_cut_top.webp',640,495),
     'pair':('pebble_cut_pair.webp',760,345),'single':('pebble_cut_single.webp',640,643),'hero':('pebble_cut_hero.webp',1336,808),'hand':('pebble_cut_hand.webp',620,990)}
EAR='pebble_photo_ear.jpg'; TABLE='pebble_photo_table.jpg'
TRUMPET='pebble_trumpet.jpg'; SUBWAY='pebble_subway.jpg'; UGCP='ugc_pebble.jpg'; AVP='avatar_pebble.jpg'
UGCK='ugc2_halfmile.jpg'
COBALT,CREAM,STONE,PALE,BRASS,NAVY,DARK='#2743C9','#F3EEE2','#CBC7BE','#B9C8EC','#CDA349','#16205A','#2A2A28'

# ---------------- K2 wall (same packing as before: 40 tiles) ----------------
COLS,ROWS,CW,CH=10,6,144,150
def pack(seed):
    rnd=random.Random(seed); occ=[[False]*COLS for _ in range(ROWS)]
    for c in range(3): occ[5][c]=True
    tiles=[]
    for r in range(ROWS):
        for c in range(COLS):
            if occ[r][c]: continue
            opts=[(1,1)]*9+[(1,2)]*4+[(2,1)]*4+[(2,2)]*2; rnd.shuffle(opts)
            for (w,h) in opts:
                if c+w<=COLS and r+h<=ROWS and all(not occ[r+j][c+i] for i in range(w) for j in range(h)):
                    for i in range(w):
                        for j in range(h): occ[r+j][c+i]=True
                    tiles.append((c,r,w,h)); break
    return tiles
tiles=pack(170); assert len(tiles)==40
PAL=[(COBALT,CREAM),(STONE,INK),(DARK,CREAM),(PALE,INK),(BRASS,INK),(NAVY,CREAM)]
NB=lambda *parts, sep='': sep.join(f'<span style="display: inline-block">{p}</span>' for p in parts)
HL=[('en','Mute the city.'),('ja',NB('街を、','ミュート。')),('en','Rush hour, on silent.'),('de','Stadt auf stumm.'),('fr','Coupe le son de la ville.'),('en','Commute, minus the noise.'),('es','Silencia la ciudad.'),('ko',NB('도시를','음소거.',sep=' ')),('ar','اكتم ضجيج المدينة.'),('en','Quiet fits in a pocket.')]
used=set()
def hl(i,maxlen=99):
    import re as _re
    while len(_re.sub(r'<[^>]+>','',HL[i%len(HL)][1]))>maxlen: i+=1
    lang,t=HL[i%len(HL)]; used.add(lang)
    return f'<span lang="{lang}"'+(' dir="rtl"' if lang=='ar' else '')+f'>{t}</span>'
def en(t):
    used.add('en'); return f'<span lang="en">{t}</span>'
def cut(name,l,t,w,rot=0,flip=False):
    b,w0,h0=CUT[name]; tr=(' scaleX(-1)' if flip else '')+(f' rotate({rot}deg)' if rot else '')
    return f'<img src="{B(b)}" alt="" style="position: absolute; left: {l}px; top: {t}px; width: {w}px; height: {round(w*h0/w0)}px; max-width: none'+(f'; transform:{tr}' if tr else '')+'">'
def ch(name,w): return round(w*CUT[name][2]/CUT[name][1])
def cover(b,pos='50% 50%'):
    return f'<img src="{B(b)}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: {pos}">'
def txt(inner,css): return f'<span style="position: absolute; {css}">{inner}</span>'
MARK='font-size: 10px; letter-spacing: 0.1em'
k11=['open','type','cropS','closed','table','pair','type','single','cropC','top','ear','open','type','single','closed']
k12=['hand','stack','ear','subway']
k21=['bopen','typeb','trumpet','pairR','hero','typeb','bclosed']
k22=['trumpet','hero']
PW={'open':92,'closed':104,'top':104,'single':84}
cnt={'11':0,'12':0,'21':0,'22':0}; out=[]; meta=[]
for i,(c,r,w,h) in enumerate(tiles):
    x,y,W,H=c*CW+2,r*CH+2,w*CW-4,h*CH-4
    bg,fg=PAL[(i*5+r)%6]; top=(r==0 and (x<200 or x+W>880)); key=f'{w}{h}'; n=cnt[key]; cnt[key]+=1; inner=''
    if key=='11':
        k='cropC' if (c==9 and r==5) else k11[n%len(k11)]
        if k in PW:
            pw=PW[k]; ph=ch(k,pw); low=top or n%2==1          # low = text at the bottom
            inner=cut(k,round((W-pw)/2),(8 if low else H-ph-10),pw,(0 if k!='single' else (-14 if n%2 else 10)))+txt(hl(i),'left: 10px; right: 10px; '+('bottom: 10px' if low else 'top: 10px')+'; font-size: 15px; line-height: 1.12')
        elif k=='pair':
            inner=cut('pair',8,(20 if top else 74),124)+txt(hl(i),'left: 10px; right: 10px; '+('bottom: 10px' if top else 'top: 10px')+'; font-size: 15px; line-height: 1.12')
        elif k=='type':
            inner=txt('PEBBLESOUND','left: 10px; top: 10px; '+MARK)+txt(hl(i),'left: 10px; right: 10px; bottom: 10px; font-size: 23px; line-height: 1.05; letter-spacing: -0.01em')
        elif k=='cropS':
            inner=cut('single',-46,4,250,-8)
        elif k=='cropC':
            inner=cut('closed',-96,34,310)+txt('PEBBLESOUND','left: 10px; top: 10px; '+MARK)
        elif k=='table':
            bg,fg='#C9C1B4',INK
            inner=cover(TABLE,'40% 62%')+txt(hl(i),'left: 10px; right: 10px; '+('bottom: 10px' if top else 'top: 10px')+'; font-size: 15px; line-height: 1.12')
        else:
            bg,fg='#1F3BB3',CREAM
            inner=cover(EAR,'42% 22%')+txt(hl(i),'left: 10px; right: 10px; '+('bottom: 10px' if top else 'top: 10px')+'; font-size: 15px; line-height: 1.12')
    elif key=='12':
        k=k12[n%len(k12)]
        if k=='hand':
            inner=cut('hand',-5,(40 if top else 70),150)+txt(hl(i,20),'left: 12px; right: 12px; '+('bottom: 14px' if top else 'top: 14px')+'; font-size: 19px; line-height: 1.1')
        elif k=='stack':
            inner=cut('open',14,(40 if top else 96),112)+cut('pair',10,(160 if top else 222),120)+txt(hl(i,20),'left: 12px; right: 12px; '+('bottom: 14px' if top else 'top: 14px')+'; font-size: 19px; line-height: 1.1')
        elif k=='ear':
            bg,fg='#1F3BB3',CREAM
            inner=cover(EAR,'45% 50%')+txt(hl(i),'left: 12px; right: 12px; '+('top: 70px' if top else 'top: 14px')+'; font-size: 19px; line-height: 1.1')
        else:
            bg,fg='#B9BEC2',INK
            inner=cover(SUBWAY)+txt(en('Rush hour,<br>on silent.'),'left: 8px; right: 8px; '+('top: 70px' if top else 'top: 16px')+'; font-size: 19px; line-height: 1.05; text-align: center')
    elif key=='21':
        k=k21[n%len(k21)]
        if k=='bopen':
            inner=cut('open',160,20,110)+txt(hl(i),'left: 14px; width: 132px; '+('bottom: 14px' if top else 'top: 14px')+'; font-size: 21px; line-height: 1.08')
        elif k=='bclosed':
            inner=cut('closed',148,24,124)+txt(hl(i),'left: 14px; width: 124px; '+('bottom: 14px' if top else 'top: 14px')+'; font-size: 21px; line-height: 1.08')
        elif k=='pairR':
            inner=cut('pair',10,40,150)+txt(hl(i),'right: 14px; width: 104px; text-align: right; bottom: 14px; font-size: 19px; line-height: 1.08')
        elif k=='hero':
            inner=cut('hero',110,(22 if top else 34),170)+txt(hl(i),'left: 14px; width: 92px; '+('bottom: 14px' if top else 'top: 14px')+'; font-size: 19px; line-height: 1.08')
        elif k=='typeb':
            inner=txt('PEBBLESOUND','right: 14px; '+('bottom: 12px' if top else 'top: 12px')+'; '+MARK)+txt(hl(i),'left: 14px; right: 14px; '+('top: 70px' if top else 'bottom: 14px')+'; font-size: 31px; line-height: 1.04; letter-spacing: -0.015em')
        else:
            bg,fg='#1B35B0',CREAM
            inner=cover(TRUMPET,'50% 56%')+txt(en('Mute<br>the city.'),'left: 14px; '+('bottom: 14px' if top else 'top: 14px')+'; font-size: 21px; line-height: 1.02')
    else:
        k=k22[n%len(k22)]
        if k=='trumpet':
            bg,fg='#1B35B0',CREAM
            inner=cover(TRUMPET,'72% 50%')+txt(en('Mute<br>the city.'),'left: 16px; top: 16px; font-size: 36px; line-height: 0.98; letter-spacing: -0.02em')+txt('PEBBLESOUND','left: 16px; bottom: 16px; '+MARK)
        else:
            bg,fg=COBALT,CREAM
            inner=cut('hero',12,118,262)+txt(hl(i),'left: 16px; right: 16px; top: 16px; font-size: 34px; line-height: 1.02; letter-spacing: -0.02em')+txt('PEBBLESOUND','left: 16px; bottom: 16px; '+MARK)
    out.append(f'<div style="position: absolute; left: {x}px; top: {y}px; width: {W}px; height: {H}px; overflow: hidden; background: {bg}; color: {fg}">{inner}</div>')
    meta.append({'index': i, 'col': c, 'row': r, 'colSpan': w, 'rowSpan': h, 'left': x, 'top': y, 'width': W, 'height': H, 'background': bg, 'color': fg, 'size': f'{w}x{h}', 'template': k, 'html': inner})

languages = sorted(used)
sizes = sorted({t['size'] for t in meta})
json.dump({'grid': {'cols': COLS, 'rows': ROWS, 'cellWidth': CW, 'cellHeight': CH, 'gap': 4, 'seed': 170,
                    'reserved': 'row 5, cols 0-2 (counter tile)'},
           'counts': {'versions': len(meta), 'languages': len(languages), 'sizes': len(sizes)},
           'languages': languages, 'sizes': sizes, 'tiles': meta},
          open('tiles.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open('preview.html', 'w', encoding='utf-8').write(
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>版本墙预览</title>'
    '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400&family=Noto+Sans+SC:wght@400&display=swap" rel="stylesheet">'
    '<style>body{margin:0}</style></head><body>'
    '<div style="position: relative; width: 1440px; height: 900px; overflow: hidden; background: #1C1C1B; '
    "font-family: 'Inter Tight', 'Noto Sans SC', system-ui, sans-serif; font-weight: 400\">"
    + '\n'.join(out) + '</div></body></html>')
print(len(meta), 'tiles;', len(languages), 'languages;', len(sizes), 'sizes')
