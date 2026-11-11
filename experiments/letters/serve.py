"""Local catalogue editor: python3 experiments/letters/serve.py --port 5173"""
from pathlib import Path
import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys
import re
import subprocess
from urllib.parse import urlsplit

# Use the existing session's Pillow install if no environment package is present.
try:
    import PIL
except ImportError:
    if Path('/tmp/textula-python/PIL').exists():
        sys.path.insert(0, '/tmp/textula-python')
from collection_editor import CollectionEditor, ConflictError

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]
API = '/experiments/letters/api/'


def run(port):
    editor = CollectionEditor(ROOT)

    app_source = (PROJECT / 'app.js').read_text()
    supabase = re.search(r"var SUPABASE_URL = '([^']+)'", app_source)[1]
    public_key = re.search(r"var SUPABASE_KEY = '([^']+)'", app_source)[1]

    def verify_admin(token):
        if not token or len(token) > 512:
            return False
        try:
            result = subprocess.run(
                ['curl', '-sS', '--max-time', '15', '-o', '-', '-w', '\n%{http_code}',
                 supabase + '/functions/v1/admin-action', '-H', 'Content-Type: application/json',
                 '-H', 'apikey: ' + public_key, '--data-binary', '@-'],
                input=json.dumps({'token': token, 'action': 'list_pending', 'payload': {}}),
                capture_output=True, text=True, check=True)
            body, status = result.stdout.rsplit('\n', 1)
            return status == '200' and json.loads(body).get('success') is True
        except (ValueError, subprocess.SubprocessError):
            return False

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(PROJECT), **kwargs)

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store')
            super().end_headers()

        def json_response(self, status, data):
            body = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if urlsplit(self.path).path == API + 'state':
                if not verify_admin(self.headers.get('X-Textula-Admin', '')):
                    return self.json_response(401, {'error': 'Войдите в админку на главной странице.'})
                with editor.lock:
                    self.json_response(200, editor.state())
            else:
                super().do_GET()

        def do_POST(self):
            if urlsplit(self.path).path != API + 'edit':
                return self.json_response(404, {'error': 'Неизвестный адрес.'})
            host = self.headers.get('Host', '')
            origin = self.headers.get('Origin')
            if host not in (f'127.0.0.1:{port}', f'localhost:{port}') or (origin and origin != 'http://' + host):
                return self.json_response(403, {'error': 'Сохранение доступно только с локальной страницы.'})
            if self.headers.get('X-Textula-Editor') != '1' or self.headers.get_content_type() != 'application/json':
                return self.json_response(403, {'error': 'Откройте локальный редактор.'})
            if not verify_admin(self.headers.get('X-Textula-Admin', '')):
                return self.json_response(401, {'error': 'Сессия администратора истекла. Войдите на главной странице и откройте редактор снова.'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size < 16384:
                    raise ValueError('Недопустимый размер запроса.')
                payload = json.loads(self.rfile.read(size))
                result = editor.save(payload['id'], payload['patch'], payload['revision'])
                self.json_response(200, result)
            except ConflictError as error:
                self.json_response(409, {'error': str(error)})
            except (ValueError, KeyError, TypeError) as error:
                self.json_response(400, {'error': str(error)})
            except Exception as error:
                print('Save error:', repr(error), file=sys.stderr)
                self.json_response(500, {'error': 'Не удалось сохранить файлы. Правки оставлены в форме; попробуйте снова.'})

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'Каталог и редактор: http://127.0.0.1:{port}/experiments/letters/', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5173)
    run(parser.parse_args().port)
