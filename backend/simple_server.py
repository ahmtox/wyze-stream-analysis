from flask import Flask, jsonify, request, send_file, Response
from flask_cors import CORS
import os
import sys
import datetime
import cv2
import numpy as np
from pathlib import Path

# Add parent directory to path
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)

app = Flask(__name__)

# Use a very simple CORS configuration
CORS(app, origins=["http://localhost:5173"], supports_credentials=False)

# Ensure output directories exist
Path(f"{parent_dir}/output/frames").mkdir(parents=True, exist_ok=True)
Path(f"{parent_dir}/output/analysis").mkdir(parents=True, exist_ok=True)

@app.route('/api/analyze', methods=['POST', 'OPTIONS'])
def analyze():
    """Simple analyze endpoint that creates a real frame and returns data"""
    if request.method == 'OPTIONS':
        response = Response()
        response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST')
        return response

    print("Analyze endpoint called with data:", request.json)
    
    data = request.json
    time_seconds = data.get('timeSeconds', 0)
    
    # Create timestamp
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create a real frame capture
    frame_filename = f"frame_{timestamp}.jpg"
    frame_path = f"{parent_dir}/output/frames/{frame_filename}"
    
    try:
        # Create a simple colored frame with timestamp
        img = np.ones((480, 640, 3), dtype=np.uint8) * 30  # Dark gray
        
        # Add text to the image
        font = cv2.FONT_HERSHEY_SIMPLEX
        cv2.putText(img, f'Time: {time_seconds:.2f}s', (50, 50), font, 1, (255, 255, 255), 2)
        cv2.putText(img, datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'), (50, 100), font, 0.7, (255, 255, 255), 2)
        
        # Save the image
        cv2.imwrite(frame_path, img)
        print(f"Saved frame to {frame_path}")
    except Exception as e:
        print(f"Error creating frame: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
    analysis = f"""
Analysis of frame at {time_seconds:.2f} seconds:

The image shows a blank security camera view with a timestamp.
There are no people or objects visible in this frame.
No suspicious activity detected.

Timestamp visible in the image: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
    
    # Create response data
    response_data = {
        "timestamp": timestamp,
        "frame": frame_filename,
        "analysis": analysis,
        "success": True
    }
    
    print(f"Returning response: {response_data}")
    return jsonify(response_data)

@app.route('/api/frames/<filename>')
def serve_frame(filename):
    """Serve a frame image"""
    frames_dir = f"{parent_dir}/output/frames"
    try:
        return send_file(f"{frames_dir}/{filename}", mimetype='image/jpeg')
    except:
        return jsonify({"error": "Frame not found"}), 404

@app.route('/api/history')
def get_history():
    """Simple history endpoint"""
    return jsonify([])

@app.route('/api/test')
def test():
    """Test endpoint"""
    return jsonify({"message": "Backend is working!", "time": str(datetime.datetime.now())})

if __name__ == '__main__':
    # Use port 5001 to avoid conflicts
    print("Starting Flask server on http://localhost:5001")
    print("This is a simplified server for testing the analyze endpoint")
    print("Press Ctrl+C to stop the server")
    app.run(debug=True, port=5001)