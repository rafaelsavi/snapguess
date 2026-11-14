FROM python:3.13-slim

# Copy uv binary for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files first to leverage layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies into virtual environment
RUN uv sync --frozen --no-dev

# Copy project source code, assets, localization files, and container entrypoint
COPY src ./src
COPY static ./static
COPY locales ./locales
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Ensure POSIX entrypoint has LF endings, prepare default data dir, and verify runtime deps
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
 && chmod 0755 /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p data \
 && chown -R 1000:1000 data \
 && chmod -R a+rX /app/src /app/static /app/locales /app/.venv \
 && setpriv --version \
 && /app/.venv/bin/python -c "import io, pillow_heif, reverse_geocoder; from PIL import Image; pillow_heif.register_heif_opener(); buf = io.BytesIO(); Image.new('RGB', (4, 4)).save(buf, format='JPEG'); assert buf.tell() > 0; res = reverse_geocoder.RGeocoder(mode=1, verbose=False).query([(48.8566, 2.3522)]); assert res and res[0]['cc'] == 'FR'"

EXPOSE 8010

# Bind to 0.0.0.0 inside container and drop privileges to PUID:PGID in entrypoint (default 1000:1000)
ENV APP_HOST=0.0.0.0 \
    PUID=1000 \
    PGID=1000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD /app/.venv/bin/python -c "import urllib.request, os; port = os.getenv('APP_PORT', '8010'); urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health')" || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/app/.venv/bin/python", "-m", "src.main"]
