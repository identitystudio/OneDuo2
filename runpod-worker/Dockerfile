FROM python:3.11.9-slim

# Install FFmpeg + wget
RUN apt-get update && \
    apt-get install -y ffmpeg wget curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir runpod requests pypdf concurrent-log-handler

WORKDIR /app
COPY handler.py .

CMD ["python", "-u", "handler.py"]
