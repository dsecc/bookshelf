FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmupdf-dev mupdf-tools gcc g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip install flask werkzeug gunicorn pymupdf pillow --no-cache-dir

COPY app.py .
COPY manage.py .
COPY templates/ templates/
COPY static/ static/

RUN mkdir -p /app/uploads /app/data/covers

EXPOSE 5000

CMD ["python", "-c", "import app; app.init_db(); import subprocess; subprocess.run(['gunicorn', '-w', '2', '-b', '0.0.0.0:5000', '--timeout', '120', 'app:app'])"]
