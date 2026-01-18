FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app/ ./app/

# Create directories
RUN mkdir -p /app/data /app/imports

ENV DATABASE_PATH=/app/data/central-chat.db
ENV IMPORTS_PATH=/app/imports

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
