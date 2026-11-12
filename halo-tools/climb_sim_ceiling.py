"""Ceiling check for halo 62891ce: Unity-like vertical glide physics + the halo's climb logic WITH the
25 m ceiling fade and the 45 m/s speed cap, held at a fixed pitch for 20 s."""
import math
G=10.0; RISE=4.0; WIND=1.5; SINK=0.3; DT=1/60
CEILING=200.0; TAPER=25.0; SPEED_CAP=45.0; BRAKE=40.0
HOLD,RISING,EASE,CLIMB,CM=7.0,27.0,24.0,30.0,18.0
def clamp(x,a,b): return max(a,min(b,x))
def lift(y): return clamp((CEILING-y)/TAPER,0,1)
def halo_fy(vs,sp,y):
    if sp<=0: fy=HOLD
    else:
        w=clamp(sp/0.17,0,1); base=HOLD+(RISING-HOLD)*w+CLIMB*sp; target=min(CM,CM*sp/0.7)
        fy=base if vs<target else EASE
    return fy*lift(y) if fy>0 else fy       # the fade, exactly as in the halo
def run(pitch,secs=20,y0=30.0,brake=True,fade=True):
    sp=math.sin(math.radians(pitch)); y=y0; vy=0.0; vs=0.0; py=y; peak=y; log=[]
    for i in range(int(secs/DT)):
        fy=halo_fy(vs,sp,y) if fade else (halo_fy(vs,sp,0) )
        a=fy*WIND
        if brake and abs(vy)>SPEED_CAP: a+= -math.copysign(BRAKE*WIND,vy)   # brake force opposes velocity over the cap
        g=G*(RISE if vy>0 else 1.0)
        vy+=-(g-a)*DT; vy=max(vy,-SINK); y+=vy*DT; peak=max(peak,y)
        m=(y-py)/DT; py=y; vs=vs*0.85+m*0.15
        if i%int(2/DT)==0: log.append(f"{i*DT:4.0f}s y={y:6.1f} vy={vy:5.1f}")
    return peak,y,vy,log
for p in (45,90):
    pk,y,vy,log=run(p)
    print(f"pitch {p:2d} held 20 s, with fade: peak altitude {pk:6.1f} m (ceiling 200), final y {y:6.1f}, vy {vy:5.1f}  -> {'OVERSHOOT' if pk>=200 else 'stays under 200'}")
    print("   "+" | ".join(log))
for p in (45,90):
    pk,_,_,_=run(p,fade=False)
    print(f"[control] pitch {p:2d} NO fade: peak {pk:6.1f} m")
