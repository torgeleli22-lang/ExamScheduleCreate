import json, re, subprocess, sys
classes = json.load(open(sys.argv[1]))
for c in classes:
    c['id'] = f"{c['day']}-{c['year']}{c['ban']}-{c['start']}"
txt = subprocess.run(['pdftotext','-layout',sys.argv[2],'-'],capture_output=True,text=True).stdout
weeks=[]
for line in txt.splitlines():
    m = re.match(r'\s*(\d{1,2})\s+(\d{1,2}/\d{1,2}.*)$', line)
    if m:
        toks = re.findall(r'\d{1,2}/\d{1,2}(?:\([월화수목금토일]\))?', m.group(2))
        if len(toks)==6: weeks.append(toks)
assert len(weeks)==15, len(weeks)
seed = dict(title='2026학년도 2학기 기말고사', dept='컴퓨터소프트웨어과', year=2026, examWeek=15,
            calendar=dict(cols=['월','화','수','목','금','토'], weeks=weeks), classes=classes)
json.dump(seed, open(sys.argv[3],'w'), ensure_ascii=False)
for w,row in enumerate(weeks,1): print(w,row)
print(len(classes),'classes')
