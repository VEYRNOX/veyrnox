#!/usr/bin/env python3
# Build a horizontal contact sheet: sheet.py OUT w img1 img2 ...
import sys
from PIL import Image
out=sys.argv[1]; w=int(sys.argv[2]); files=sys.argv[3:]
ims=[Image.open(f) for f in files]
ims=[im.resize((w,int(im.height*w/im.width))) for im in ims]
h=max(i.height for i in ims)
sheet=Image.new("RGB",(w*len(ims),h),(15,15,15))
for i,im in enumerate(ims): sheet.paste(im,(i*w,0))
sheet.save(out); print("sheet:",out,sheet.size)
