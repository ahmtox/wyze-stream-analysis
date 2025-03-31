import os
import sys
import datetime
from flask import Flask, jsonify, request, send_file, Response
from flask_cors import CORS
import sqlite3
from pathlib import Path

# Add parent directory to path
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)

app = Flask(__name__)

# Configure CORS with the appropriate settings
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)

# Make sure all responses have CORS headers
@app.after_request
def add_cors_headers(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

# Special handling for OPTIONS requests
@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        return response

# Database setup
DB_PATH = f"{parent_dir}/backend/analysis_history.db"

# Ensure output directories exist
for dir_path in [f"{parent_dir}/output/frames", f"{parent_dir}/output/analysis"]:
    Path(dir_path).mkdir(parents=True, exist_ok=True)

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS analysis_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        frame_path TEXT,
        prompt TEXT,
        result TEXT,
        device_id TEXT
    )
    ''')
    
    # Create a table to store the custom prompt
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS custom_prompt (
        id INTEGER PRIMARY KEY,
        prompt TEXT
    )
    ''')
    
    # Insert default prompt if not exists
    cursor.execute("SELECT COUNT(*) FROM custom_prompt")
    if cursor.fetchone()[0] == 0:
        default_prompt = '''Please analyze this image from a security camera.'''
        cursor.execute("INSERT INTO custom_prompt (id, prompt) VALUES (1, ?)", (default_prompt,))
    
    conn.commit()
    conn.close()

# Initialize database
init_db()

# Test endpoint
@app.route('/api/test', methods=['GET', 'OPTIONS'])
def test_endpoint():
    """Simple endpoint to test CORS"""
    return jsonify({
        "message": "CORS is working correctly!",
        "time": datetime.datetime.now().isoformat()
    })

# Simple analyze endpoint that returns mock data (for testing)
@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    """Mock analyze endpoint that always succeeds"""
    if request.method == 'OPTIONS':
        return Response()

    data = request.json
    time_seconds = data.get('timeSeconds', 0)
    
    # Create timestamp
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create a mock response
    response_data = {
        "timestamp": timestamp,
        "frame": f"mock_frame_{timestamp}.jpg",
        "analysis": f"This is a test analysis of frame at {time_seconds} seconds. The mock API is working!",
        "success": True
    }
    
    # Log the request
    print(f"Analyze request for time: {time_seconds}")
    print(f"Returning mock response: {response_data}")
    
    return jsonify(response_data)

# History endpoint
@app.route('/api/history')
def get_history():
    """Get analysis history with mock data"""
    return jsonify([
        {
            "id": 1,
            "timestamp": "20230915_143022",
            "frame_path": "mock_frame_1.jpg",
            "prompt": "Please analyze this security camera footage.",
            "result": "This is a mock analysis result. The image shows a typical scene with no unusual activity.",
            "device_id": "default"
        },
        {
            "id": 2,
            "timestamp": "20230915_153022", 
            "frame_path": "mock_frame_2.jpg",
            "prompt": "Please analyze this security camera footage.",
            "result": "This is another mock analysis result. The image appears to be a static scene with nothing of concern.",
            "device_id": "default"
        }
    ])

# Prompt endpoints
@app.route('/api/prompt', methods=['GET'])
def get_prompt():
    """Get the current custom prompt"""
    return jsonify({"prompt": "Please analyze this image from a security camera."})

@app.route('/api/prompt', methods=['POST'])
def update_prompt():
    """Update the custom prompt"""
    data = request.json
    prompt = data.get('prompt', '')
    return jsonify({"success": True, "prompt": prompt})

# Add a test image endpoint to serve mock frames
@app.route('/api/frames/<filename>')
def serve_frame(filename):
    """Serve a mock frame"""
    # Create a simple image if it doesn't exist
    frames_dir = f"{parent_dir}/output/frames"
    os.makedirs(frames_dir, exist_ok=True)
    
    # If the filename starts with mock_frame, generate a test image
    if filename.startswith("mock_frame"):
        import numpy as np
        import cv2
        from datetime import datetime
        
        # Create a blank image
        img = np.zeros((480, 640, 3), np.uint8)
        
        # Add some text
        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(img, 'Mock Frame', (50, 50), font, 1, (255, 255, 255), 2)
        cv2.putText(img, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), (50, 100), font, 0.7, (255, 255, 255), 1)
        cv2.putText(img, f'File: {filename}', (50, 150), font, 0.7, (255, 255, 255), 1)
        
        # Save the image
        output_path = f"{frames_dir}/{filename}"
        cv2.imwrite(output_path, img)
        
        return send_file(output_path, mimetype='image/jpeg')
    
    # Try to serve an existing file
    try:
        return send_file(f"{frames_dir}/{filename}", mimetype='image/jpeg')
    except:
        # Return a 404 error
        return jsonify({"error": "Frame not found"}), 404

if __name__ == '__main__':
    print("Starting CORS-enabled Flask server on http://localhost:5000")
    print("Available endpoints:")
    print("  - GET /api/test - Test endpoint")
    print("  - POST /api/analyze - Mock analysis endpoint")
    print("  - GET /api/history - Get analysis history")
    print("  - GET/POST /api/prompt - Get/set analysis prompt")
    app.run(debug=True)