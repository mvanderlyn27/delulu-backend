FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Cloud Run will set PORT environment variable
ENV PORT=8000

# Remove debugging tools for production
EXPOSE ${PORT}

CMD ["python", "main.py"]