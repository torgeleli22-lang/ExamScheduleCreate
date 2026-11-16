import openpyxl, re, json, sys
wb=openpyxl.load_workbook(sys.argv[1])
ws=wb['최종 버전']
day=None; year=None
rows={}
for r in range(6,50):
    b=ws.cell(r,2).value; c=ws.cell(r,3).value; d=ws.cell(r,4).value
    if b: day=b
    if c: year=c
    if d: rows[r]=(day,year,d)
merged={(m.min_row,m.min_col):m.max_col for m in ws.merged_cells.ranges}
out=[]
for r,(day,year,ban) in rows.items():
    for col in range(5,15):
        v=ws.cell(r,col).value
        if v:
            end=merged.get((r,col),col)
            m=re.match(r'(.+?)\((.+?)\)\s*-\s*(.+)',v)
            out.append(dict(day=day,year=year,ban=ban,start=col-4,end=end-4,course=m.group(1).strip(),prof=m.group(2),room=m.group(3).strip().replace('호','').replace(' ','')))
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
for o in out: print(o['day'],f"{o['year']}{o['ban']}",f"{o['start']}-{o['end']}",o['course'],o['prof'],o['room'])
print(len(out))
