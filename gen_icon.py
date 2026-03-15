from PIL import Image, ImageDraw
img = Image.new('RGBA', (24,24), (0,0,0,0))
d = ImageDraw.Draw(img)
d.rectangle([4,6,19,18], fill=(200,0,0,255), outline=(0,0,0,255))
d.rectangle([7,3,16,5], fill=(200,0,0,255), outline=(0,0,0,255))
img.save('trash-bin-red.png')
print('created trash-bin-red.png')
