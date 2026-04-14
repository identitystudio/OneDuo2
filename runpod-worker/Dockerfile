FROM python:3.11-slim

# Install FFmpeg + wget
RUN apt-get update && \
    apt-get install -y ffmpeg wget curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir runpod requests pypdf

WORKDIR /app
COPY handler.py .
# cache-bust: 2026-04-14

CMD ["python", "-u", "handler.py"]
