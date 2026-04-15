FROM python:3.11.9-slim

# Install FFmpeg, Tesseract OCR and dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg wget curl tesseract-ocr tesseract-ocr-eng && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir runpod requests pypdf pytesseract Pillow

WORKDIR /app
COPY handler.py .

CMD ["python", "-u", "handler.py"]
