# FLAC → ALAC Converter Web UI

A lightweight, Docker-Compose–powered FastAPI service with a Material-Design front-end for bulk-converting FLAC files to Apple Lossless (ALAC).  
Browse your mounted input directory, pick files or folders, choose a sample rate, and hit **Convert Selected**—all from any browser, on any device.

---

## 📋 Prerequisites

- **Docker** (Engine) installed  
- **Docker Compose** (v1.27+) installed  
- A machine (Linux, macOS, Windows, Raspberry Pi, Jetson, …) capable of running Docker  

---

## 🚀 Setup & Run

1. **Clone this repo**  
   ```bash
   git clone https://github.com/raspberrycoulis/flac2alac.git
   cd flac2alac
   ```

2. **Create your .env file**
   ```dotenv
   COMPOSE_BAKE=true
   INPUT_DIR=/full/path/to/your/flac_source
   OUTPUT_DIR=/full/path/to/your/alac_target
   ```

3. **Build & launch the service**
   ```bash
   docker compose up --build -d
   ```

4. **Open the UI**
Visit [http://your-machine-ip:8000](http://your-machine-ip:8000)


## Directory structure
   ```
   flac2alac/
   ├── .env                ← your INPUT_DIR/OUTPUT_DIR definitions
   ├── docker-compose.yml
   └── converter/
       ├── Dockerfile
       ├── requirements.txt
       ├── main.py         ← FastAPI back-end + ffmpeg worker
       └── static/
           ├── index.html  ← Materialize front-end (Alpha 3.0)
           └── app.js
   ```
