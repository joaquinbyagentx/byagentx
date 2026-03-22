import urllib.request, json, base64, os, re
from pathlib import Path

env = Path.home() / '.openclaw' / '.env'
content = env.read_text()
m = re.search(r'^GOOGLE_API_KEY=(.*)$', content, re.M)
API_KEY = m.group(1).strip()

def generate_image(prompt, output_path):
    url = f'https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key={API_KEY}'
    payload = {
        'instances': [{'prompt': prompt}],
        'parameters': {'sampleCount': 1}
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    try:
        resp = urllib.request.urlopen(req, timeout=90)
        d = json.load(resp)
        predictions = d.get('predictions', [])
        if predictions and 'bytesBase64Encoded' in predictions[0]:
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'wb') as f:
                f.write(base64.b64decode(predictions[0]['bytesBase64Encoded']))
            size = Path(output_path).stat().st_size
            print(f'✅ {output_path} ({size:,} bytes)')
            return True
        else:
            print(f'❌ No image data in response for {output_path}')
            print(f'   Response keys: {list(d.keys())}')
            if predictions:
                print(f'   Prediction keys: {list(predictions[0].keys())}')
    except Exception as e:
        print(f'❌ {output_path}: {e}')
    return False

def generate_image_gemini(prompt, output_path):
    """Fallback using gemini flash image generation"""
    url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={API_KEY}'
    payload = {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'responseModalities': ['IMAGE', 'TEXT']}
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    try:
        resp = urllib.request.urlopen(req, timeout=90)
        d = json.load(resp)
        candidates = d.get('candidates', [])
        for candidate in candidates:
            for part in candidate.get('content', {}).get('parts', []):
                if 'inlineData' in part and part['inlineData'].get('mimeType', '').startswith('image/'):
                    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                    with open(output_path, 'wb') as f:
                        f.write(base64.b64decode(part['inlineData']['data']))
                    size = Path(output_path).stat().st_size
                    print(f'✅ (gemini fallback) {output_path} ({size:,} bytes)')
                    return True
        print(f'❌ No image data in gemini response for {output_path}')
    except Exception as e:
        print(f'❌ Gemini fallback failed for {output_path}: {e}')
    return False

images = [
    (
        "pollo-rostizado.jpg",
        "Professional food photography of a whole golden-brown rotisserie chicken on a rustic wooden board, perfectly charred skin, steam rising, dark dramatic background with warm amber lighting, garnished with lime, chili peppers and fresh herbs, appetizing, Mexican style, cinematic quality"
    ),
    (
        "pollo-adobado.jpg",
        "Professional food photography of a whole adobo-marinated rotisserie chicken with deep red-brown skin, rustic clay plate, dark moody background, smoke and steam, traditional Mexican spices visible, appetizing close-up, warm lighting"
    ),
    (
        "complementos.jpg",
        "Traditional Mexican side dishes arranged beautifully: red rice, coleslaw, macaroni soup, cambray potatoes, in colorful clay bowls on rustic wooden table, warm lighting, overhead shot, appetizing, vibrant colors"
    ),
    (
        "salsas.jpg",
        "Three traditional Mexican salsas in small clay bowls: red salsa, green tomatillo salsa, and salsa macha with dried chiles, fresh cilantro and lime garnish, dark rustic background, professional food photography"
    ),
    (
        "paquete-familiar.jpg",
        "Mexican family feast spread: two whole rotisserie chickens on wooden boards, surrounded by rice, tortillas, salsas, and drinks, overhead flat lay on rustic dark wood table, warm inviting lighting, abundant and appetizing"
    ),
    (
        "hero-new.jpg",
        "Stunning hero image of rotisserie chicken cooking over wood fire at a Mexican restaurant, flames visible, golden chickens on spit, smoke and embers, dramatic low-light photography, rustic brick oven, artisanal atmosphere"
    ),
]

base_dir = Path.home() / '.openclaw' / 'workspace' / 'byagentx' / 'ricki-pollo-img'

print(f"Generating {len(images)} images for Ricki Pollo...")
print(f"Output dir: {base_dir}\n")

results = []
for filename, prompt in images:
    output_path = base_dir / filename
    print(f"Generating: {filename}")
    success = generate_image(prompt, str(output_path))
    if not success:
        print(f"  → Trying Gemini fallback...")
        success = generate_image_gemini(prompt, str(output_path))
    results.append((filename, success))
    print()

print("\n=== SUMMARY ===")
for filename, success in results:
    path = base_dir / filename
    if success and path.exists():
        size = path.stat().st_size
        print(f"✅ {filename}: {size:,} bytes ({size/1024:.1f} KB)")
    else:
        print(f"❌ {filename}: FAILED")
