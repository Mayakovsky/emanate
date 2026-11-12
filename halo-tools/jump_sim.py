#!/usr/bin/env python3
"""Jump model with the REAL Unity constants (CharacterControllerSettings.asset + the velocity systems):
 gravity 10 (x4 while rising); jump v0 = sqrt(2*40*H); horizontal MoveVelocity: in the air it moves toward the
 input target at the air acceleration (15) while a QUADRATIC drag (AirDrag 0.05 * JumpVelocityDrag 4 = 0.2) acts on
 v^2; external velocity (forces/impulses) decays at ExternalEnvDrag 1.5 /s, forces x1.5 while gliding.
Compares BEFORE (62891ce) with AFTER (momentum jump: run-speed jump bonus + takeoff impulse + in-air carry force)."""
import math, sys
G=10.0; RISE=4.0; DRAG=0.05*4.0; AIRACC=15.0; EXTDRAG=1.5; WIND=1.5; GLIDE_SPEED=6.0; SINK=0.3; DT=1/120

def sim(speed_limit, H, *, impulse=0.0, carry_k=0.0, carry_cap=26.0, glide=False, secs_glide=5.0, hold_input=True, record=False):
    move_v=speed_limit; ext_v=impulse*speed_limit; y=0.0; vy=math.sqrt(2*G*RISE*H); t=0.0; x=0.0
    h0=speed_limit; gliding=False; trace=[]
    while True:
        # vertical
        if gliding: g=G; vy=max(vy-g*DT,-SINK)
        else:
            g=G*(RISE if vy>0 else 1.0); vy-=g*DT
        y+=vy*DT
        if glide and not gliding and vy<=0 and t>0.3: gliding=True; vy=max(vy,-SINK)
        # horizontal: air control toward the input target, then quadratic drag
        target=(GLIDE_SPEED if gliding else speed_limit) if hold_input else 0.0
        step=AIRACC*DT
        move_v+=max(-step,min(step,target-move_v))
        move_v-=DRAG*move_v*move_v*DT
        # in-air carry force along the takeoff heading (forces x1.5 while gliding)
        total=move_v+ext_v
        f=carry_k*h0*(1.0 if total<carry_cap-3 else max(0.0,(carry_cap-total)/3.0))
        a=f*(WIND if gliding else 1.0)
        ext_v+=a*DT; ext_v*=max(0.0,1-EXTDRAG*DT)
        x+=(move_v+ext_v)*DT; t+=DT
        if record and int(t/DT)%int(0.25/DT)==0: trace.append((t,x,move_v+ext_v,y))
        if (y<=0 and vy<0 and not gliding) or (gliding and t>secs_glide+0.9): break
        if t>40: break
    return t,x,(x/t if t else 0)

def jump_height(run_h, speed, base, bonus):   # AFTER: scale the jump with run speed
    return base*(1+bonus*min(1.0,speed/18.0))

# settings of the current halo (tiers 2/3): jumpHeight 1.6 (jog/walk), runJumpHeight 2.2
CASES=[("walk 5 m/s",5.0,1.6,5.0),("jog 13 m/s",13.0,1.6,13.0),("run 18 m/s",18.0,2.2,18.0)]
IMP=0.30; K=0.55; BONUS=0.25
print("Jump with forward input held. Real Unity constants. AFTER = takeoff impulse %.0f%% of speed + carry force %.2f*speed + jump height x(1+%.2f*speed/18)\n"%(IMP*100,K,BONUS))
print(f"{'':16}{'--- BEFORE (62891ce) ---':36}{'--- AFTER (momentum jump) ---'}")
print(f"{'case':16}{'height':>7}{'airtime':>9}{'dist':>8}{'avg h':>8}   {'height':>7}{'airtime':>9}{'dist':>8}{'avg h':>8}")
for name,sp,H,hs in CASES:
    tb,xb,ab=sim(sp,H)
    Ha=jump_height(sp,sp,H,BONUS)
    ta,xa,aa=sim(sp,Ha,impulse=IMP,carry_k=K)
    print(f"{name:16}{H:7.2f}{tb:8.2f}s{xb:7.1f}m{ab:7.1f}   {Ha:7.2f}{ta:8.2f}s{xa:7.1f}m{aa:7.1f}")
# gliding: run takeoff then the glider opens at the apex and holds for 5 s (no thrust key)
tb,xb,ab=sim(18.0,2.2,glide=True)
ta,xa,aa=sim(18.0,jump_height(18,18,2.2,BONUS),impulse=IMP,carry_k=K,glide=True)
print(f"{'run 18 + glide 5s':16}{2.2:7.2f}{tb:8.2f}s{xb:7.1f}m{ab:7.1f}   {jump_height(18,18,2.2,BONUS):7.2f}{ta:8.2f}s{xa:7.1f}m{aa:7.1f}")
