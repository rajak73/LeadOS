import urllib.request
import urllib.error
import time

urls = [
    'https://leados-web.onrender.com/',
    'https://leados-web.onrender.com/features',
    'https://leados-web.onrender.com/pricing',
    'https://leados-web.onrender.com/login',
    'https://leados-web.onrender.com/signup'
]

auth_urls = [
    'https://leados-web.onrender.com/dashboard',
    'https://leados-web.onrender.com/leads',
    'https://leados-web.onrender.com/pipeline',
    'https://leados-web.onrender.com/inbox'
]

print("Testing Public URLs:")
for url in urls:
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            print(f"{url} -> {response.status}")
    except urllib.error.HTTPError as e:
        print(f"{url} -> {e.code}")
    except Exception as e:
        print(f"{url} -> Error: {e}")

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(NoRedirectHandler)
urllib.request.install_opener(opener)

print("\nTesting Authenticated URLs (Expect 307/302 Redirect):")
for url in auth_urls:
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as response:
            print(f"{url} -> {response.status} (No redirect??)")
    except urllib.error.HTTPError as e:
        if e.code in [301, 302, 303, 307, 308]:
            redirect_target = e.headers.get('Location', 'unknown')
            print(f"{url} -> {e.code} Redirects to {redirect_target}")
        else:
            print(f"{url} -> {e.code}")
    except Exception as e:
        print(f"{url} -> Error: {e}")

