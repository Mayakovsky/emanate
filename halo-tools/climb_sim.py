import math
G=10.0; RISE=4.0; WIND=1.5; SINK=0.3; DT=1/60

def clamp(x,a,b): return max(a,min(b,x))

def sim(fy_fn, pitch_deg, secs=12, y0=30.0):
    """Unity-like vertical motion while gliding: a = F.y*WIND; gravity G (x RISE if vy>0);
    fall clamped to -SINK. Halo sees only Transform deltas (smoothed vy)."""
    y=y0; vy=0.0; vy_sm=0.0; prev_y=y; sinp=math.sin(math.radians(pitch_deg)); out=[]
    for i in range(int(secs/DT)):
        fy=fy_fn(vy_sm,sinp)
        a_ext=fy*WIND
        g=G*(RISE if vy>0 else 1.0)
        vy += -(g - a_ext)*DT
        vy = max(vy,-SINK)         # glide only clamps fall speed
        y += vy*DT
        meas=(y-prev_y)/DT; prev_y=y; vy_sm=vy_sm*0.85+meas*0.15
        if i%int(2/DT)==0: out.append(f"t={i*DT:4.1f}s y={y-y0:6.1f} vy={vy:5.1f}")
    return y-y0, vy, out

# 1) f7903a6: rising 13.4, climb 10, hold 7, climbMax 10
def old1(vs,sp): return (13.4 if vs>0.2 else 7.0)+ (10*sp*clamp((10-vs)/3,0,1) if sp>0 else 0)
# 2) c7e3381: rising 27, climb 15, hold 7, switch on measured vy (the previous build)
def old2(vs,sp): return (27.0 if vs>0.2 else 7.0)+ (15*sp*clamp((10-vs)/3,0,1) if sp>0 else 0)
# 3) proposed: when looking up, ALWAYS use the rising-force base; cap climb rate by easing off above CLIMB_MAX
CM=18.0
def new(vs,sp):
    if sp<=0: return 7.0
    base=27.0+30.0*sp
    return base if vs<CM else 24.0
for name,fn in (("f7903a6 (first force build)",old1),("c7e3381 (the previous build)",old2),("proposed",new)):
    for p in (45,):
        y,vy,out=sim(fn,p)
        print(f"{name:30} pitch {p}: after 12 s height gain {y:6.1f} m, vy {vy:5.1f}")
        print("    "+"  |  ".join(out))
