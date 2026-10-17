import json,os,sys,collections
from decimal import Decimal as D, ROUND_HALF_UP
base=os.environ.get('OUT', os.path.dirname(os.path.abspath(__file__))+'/out')+'/'
S=json.load(open(base+'rand_scenarios.json')); R={r['id']:r for r in json.load(open(base+'rand_engine.json'))}
q=lambda x:int((D(x)*100).quantize(D('1'),rounding=ROUND_HALF_UP))
T=collections.Counter(); byline=collections.defaultdict(collections.Counter); fails=[]
FED=('US_FIT','US_FIT_SUPP','US_SS_EE','US_SS_ER','US_MED_EE','US_MED_ER','US_MED_ADDL','US_FUTA')
for s in S:
    r=R[s['id']]
    if not r['ok']: T['THREW']+=1; fails.append((s['id'],'THREW',r['error'])); continue
    e=s['expected']; L=r['lines']
    lines=['PA_SIT','PA_UC_EE','PA_SUI_ER']+(['PA_EIT'] if 'PA_EIT' in e else [])+(['PA_LST'] if 'PA_LST' in e else [])
    lines+=[k for k in FED if (k in e)]
    for k in lines:
        exp=q(e[k]); got=L.get(k,0)
        alt=q(e[k+'_alt']) if k+'_alt' in e else None
        if got==exp: st='PASS'
        elif k=='US_FIT' and got in (q(e['US_FIT_lr']),): st='WORKSHEET_LINE_ROUNDING'
        elif k=='US_FIT' and got in (q(e['US_FIT_alt']),q(e['US_FIT_lr_alt'])): st='IRS_PRINTED_ROUNDING'
        elif alt is not None and got==alt: st='UNVERIFIED_BASE'
        elif k.startswith('US_FIT') and (abs(got-exp)<=1 or abs(got-q(e['US_FIT_alt']))<=1): st='ROUND_1c'
        else: st='FAIL'
        T[st]+=1; byline[k][st]+=1
        if st=='FAIL': fails.append((s['id'],k,exp,got,s['freq'],s['date']))
    # net-pay identity (engine internal): gross - pretax - posttax - employee taxes
    ident=r['gross']-r['pretax']-r['post']-r['ee']
    if ident!=r['net']: T['NET_IDENTITY_FAIL']+=1; fails.append((s['id'],'NET',ident,r['net']))
    else: T['NET_IDENTITY_PASS']+=1
print(dict(T))
for k,v in sorted(byline.items()): print(f"  {k:12}",dict(v))
print(len(fails),'failures; first 25:')
for f in fails[:25]: print(' ',f)
json.dump(fails,open(base+'rand_fails.json','w'))
