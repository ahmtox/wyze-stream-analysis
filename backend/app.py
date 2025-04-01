import os
import sys
import time
import datetime
import cv2
import base64
import requests
import json
import sqlite3
from pathlib import Path
from flask import Flask, jsonify, request, send_file, Response
from flask_cors import CORS
from dotenv import load_dotenv

# Add parent directory to path to import main.py functions
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(parent_dir)

# Import functions from main.py
from main import (
    initialize_client, 
    extract_frame, 
    analyze_image_with_claude, 
    encode_image_to_base64
)

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)

# Configure CORS more explicitly
CORS(app, resources={
    r"/api/*": {
        "origins": "*",  # Allow all origins
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Add a before_request handler to log all incoming requests
@app.before_request
def before_request():
    print(f"\n==== INCOMING REQUEST ====")
    print(f"Method: {request.method}")
    print(f"Path: {request.path}")
    
    # Only print selected headers, not all to reduce log spam
    important_headers = {k: v for k, v in request.headers.items() 
                         if k.lower() in ['content-type', 'content-length', 'accept']}
    print(f"Headers: {important_headers}")
    
    # Don't log data for file uploads or multipart form data
    content_type = request.headers.get('Content-Type', '')
    if request.method != 'OPTIONS' and 'multipart/form-data' not in content_type and 'application/octet-stream' not in content_type:
        # Only log JSON data, not binary data
        if 'application/json' in content_type:
            try:
                print(f"Data: {request.get_json()}")
            except:
                print("Data: [Unable to parse JSON]")
        else:
            print("Data: [Not logged - not JSON]")
            
# Add an after_request handler to check CORS headers
@app.after_request
def after_request(response):
    print(f"\n==== OUTGOING RESPONSE ====")
    print(f"Status: {response.status}")
    print(f"Headers: {dict(response.headers)}")
    
    # Only add CORS headers if they're not already present
    if 'Access-Control-Allow-Origin' not in response.headers:
        response.headers.add('Access-Control-Allow-Origin', '*')
    if 'Access-Control-Allow-Headers' not in response.headers:
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    if 'Access-Control-Allow-Methods' not in response.headers:
        response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    
    return response

# Special handler for OPTIONS requests (preflight)
@app.route('/api/analyze', methods=['OPTIONS'])
def handle_options():
    print("Handling OPTIONS preflight request for /api/analyze")
    return Response()  # The after_request handler will add the CORS headers

# Ensure output directories exist
Path(f"{parent_dir}/output/videos").mkdir(parents=True, exist_ok=True)
Path(f"{parent_dir}/output/frames").mkdir(parents=True, exist_ok=True)
Path(f"{parent_dir}/output/analysis").mkdir(parents=True, exist_ok=True)

print(f"Output directories:")
print(f"  Frames dir: {parent_dir}/output/frames - Exists: {os.path.exists(f'{parent_dir}/output/frames')}")
print(f"  Analysis dir: {parent_dir}/output/analysis - Exists: {os.path.exists(f'{parent_dir}/output/analysis')}")
print(f"  Videos dir: {parent_dir}/output/videos - Exists: {os.path.exists(f'{parent_dir}/output/videos')}")

# Ensure directories exist with more verbose output
for path in [f"{parent_dir}/output/videos", f"{parent_dir}/output/frames", f"{parent_dir}/output/analysis"]:
    try:
        Path(path).mkdir(parents=True, exist_ok=True)
        print(f"Successfully ensured directory exists: {path}")
    except Exception as e:
        print(f"Error creating directory {path}: {str(e)}")

# Database setup
DB_PATH = f"{parent_dir}/backend/analysis_history.db"

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
        default_prompt = '''Please analyze this image from a security camera. 
Focus on:
1. Are there any people or objects of interest visible?
2. Describe any potential issues or anomalies you can detect.
3. Is there any text visible in the image? If so, what does it say?

Provide a detailed but concise analysis.'''
        cursor.execute("INSERT INTO custom_prompt (id, prompt) VALUES (1, ?)", (default_prompt,))
    
    conn.commit()
    conn.close()

# Initialize the database
init_db()

# Get the default prompt
def get_default_prompt():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT prompt FROM custom_prompt WHERE id=1")
    result = cursor.fetchone()
    conn.close()
    return result[0] if result else "Please analyze this image."

# Update the custom prompt
def update_custom_prompt(new_prompt):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("UPDATE custom_prompt SET prompt=? WHERE id=1", (new_prompt,))
    conn.commit()
    conn.close()

# Save analysis to database
def save_analysis(timestamp, frame_path, prompt, result, device_id="default"):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO analysis_history (timestamp, frame_path, prompt, result, device_id) VALUES (?, ?, ?, ?, ?)",
        (timestamp, frame_path, prompt, result, device_id)
    )
    conn.commit()
    conn.close()

# Routes
@app.route('/api/hello')
def hello():
    return jsonify(message="Hello from Flask!")

@app.route('/api/video/<filename>')
def serve_video_by_filename(filename):
    """Serve a specified video file"""
    try:
        # Security: Only allow specific video files
        allowed_videos = ["cat_food.mp4", "gauge.mp4", "pedestrians.mp4", "football.mp4", "thermometer.mp4", "times_square.mp4"]
        if filename not in allowed_videos:
            print(f"ERROR: Requested video {filename} is not in allowed list")
            return jsonify({"error": "Video not found"}), 404
                    
        # Try multiple locations for the video
        possible_paths = [
            f"{parent_dir}/{filename}",
            f"{parent_dir}/frontend/public/{filename}",
            f"{parent_dir}/frontend/src/assets/{filename}"
        ]
        
        video_path = None
        for path in possible_paths:
            if os.path.exists(path):
                video_path = path
                break
                
        if not video_path:
            print(f"ERROR: Video file not found in any of the expected locations")
            return jsonify({"error": "Video file not found"}), 404
            
        print(f"Video file found, serving from: {video_path}")
        
        # Create response
        try:
            # Add content headers to avoid CORS issues
            response = send_file(
                video_path, 
                mimetype='video/mp4',
                as_attachment=False,
                conditional=True  # Support partial requests
            )
            response.headers['Accept-Ranges'] = 'bytes'
            print("Video response prepared successfully")
            return response
        except Exception as e:
            print(f"ERROR creating response: {str(e)}")
            return jsonify({"error": f"Failed to create response: {str(e)}"}), 500
    except Exception as e:
        print(f"ERROR serving video: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/videos')
def list_videos():
    """List available videos"""
    videos = [
        {
            "id": "football",
            "name": "Backyard Cam",
            "filename": "football.mp4",
            "description": "Football game in backyard"
        },
        {
            "id": "cat_food",
            "name": "Cat Cam",  # Changed from Kitchen Cam
            "filename": "cat_food.mp4", 
            "description": "Cat food monitoring"
        },
        {
            "id": "gauge",
            "name": "Gauge Cam",  # Changed from Utility Cam
            "filename": "gauge.mp4",
            "description": "Gauge monitoring"
        },
        {
            "id": "pedestrians",
            "name": "Street Cam",  # Changed from Front Door Cam
            "filename": "pedestrians.mp4", 
            "description": "Pedestrians on sidewalk"
        },
        {
            "id": "thermometer",
            "name": "Thermometer Cam",  # Changed from Weather Cam
            "filename": "thermometer.mp4",
            "description": "Temperature monitoring"
        },
        {
            "id": "times_square",
            "name": "Times Square Cam",
            "filename": "times_square.mp4",
            "description": "Times Square street view"
        }
    ]
    return jsonify(videos)

@app.route('/api/analyze', methods=['POST'])
def analyze():
    """Analyze a frame from the video at a specific time"""
    try:
        print("\n\n==== NEW ANALYSIS REQUEST ====")
        data = request.json
        time_seconds = data.get('timeSeconds', 5.0)
        device_id = data.get('deviceId', 'default')
        video_filename = data.get('videoFilename', 'football.mp4')  # Get video filename from request
        custom_prompt = data.get('prompt')
        
        print(f"Debug: Received analysis request for time {time_seconds}s with device_id {device_id}")
        print(f"Debug: Using video file: {video_filename}")
        print(f"Request data: {data}")
        
        if not custom_prompt:
            custom_prompt = get_default_prompt()
            print(f"Debug: Using default prompt: {custom_prompt[:50]}...")
        else:
            print(f"Debug: Using custom prompt: {custom_prompt[:50]}...")
        
        # Check for required modules
        try:
            import cv2
            print("Debug: OpenCV imported successfully")
        except ImportError:
            print("ERROR: OpenCV (cv2) is not installed")
            return jsonify({"error": "OpenCV is not installed on the server"}), 500
        
        # Look for the video in multiple locations
        possible_video_paths = [
            f"{parent_dir}/{video_filename}",
            f"{parent_dir}/frontend/public/{video_filename}",
            f"{parent_dir}/frontend/src/assets/{video_filename}"
        ]
        
        # Find the first path that exists
        video_path = None
        for path in possible_video_paths:
            if os.path.exists(path):
                video_path = path
                print(f"Debug: Video found at {video_path}")
                break
        
        if not video_path:
            print(f"Error: Video file '{video_filename}' not found in any expected location")
            return jsonify({"error": f"Video file '{video_filename}' not found"}), 404
            
        print(f"Debug: Using video at {video_path}")
        print(f"File size: {os.path.getsize(video_path)} bytes")
        
        # Extract a frame
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        frame_path = f"{parent_dir}/output/frames/frame_{timestamp}.jpg"
        
        # Ensure the output directory exists
        os.makedirs(os.path.dirname(frame_path), exist_ok=True)
        
        # Test output directory permissions
        try:
            test_file = f"{parent_dir}/output/test_permissions.txt"
            with open(test_file, 'w') as f:
                f.write("Test")
            os.remove(test_file)
            print("Debug: Output directory has write permissions")
        except Exception as e:
            print(f"ERROR: Output directory permission issue: {str(e)}")
            return jsonify({"error": f"Server cannot write to output directory: {str(e)}"}), 500
        
        # Log the extraction attempt
        print(f"Debug: Extracting frame at {time_seconds}s from {video_path} to {frame_path}")
        
        # Try extracting the frame with extensive logging
        try:
            print("Opening video file...")
            cap = cv2.VideoCapture(video_path)
            
            if not cap.isOpened():
                print(f"ERROR: Could not open video file at {video_path}")
                return jsonify({"error": "Could not open video file"}), 500
            
            # Get video properties
            fps = cap.get(cv2.CAP_PROP_FPS)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            duration = total_frames / fps if fps > 0 else 0
            
            print(f"Video properties: {fps} FPS, {total_frames} frames, {duration:.2f} seconds")
            
            # Ensure time_seconds is within the video duration
            if time_seconds > duration:
                time_seconds = duration / 2  # Take middle frame if specified time exceeds duration
                print(f"Requested time exceeds video duration. Using {time_seconds:.2f} seconds instead.")
            
            # Set frame position
            frame_pos = int(time_seconds * fps)
            success = cap.set(cv2.CAP_PROP_POS_FRAMES, frame_pos)
            print(f"Seeking to frame position {frame_pos}: {'Success' if success else 'Failed'}")
            
            # Read the frame
            print("Reading frame...")
            ret, frame = cap.read()
            if not ret:
                print("ERROR: Failed to read frame")
                cap.release()
                return jsonify({"error": "Failed to read frame from video"}), 500
            
            # Save the frame
            print(f"Saving frame to {frame_path}...")
            success = cv2.imwrite(frame_path, frame)
            if not success:
                print(f"ERROR: Failed to save frame to {frame_path}")
                cap.release()
                return jsonify({"error": "Failed to save frame"}), 500
            
            cap.release()
            
            # Verify frame was saved
            if not os.path.exists(frame_path):
                print(f"ERROR: Frame was not saved to {frame_path}")
                return jsonify({"error": "Frame was not saved properly"}), 500
            
            print(f"Debug: Frame extracted successfully to {frame_path}, size: {os.path.getsize(frame_path)} bytes")
            
            # Check if Anthropic API key exists
            api_key = os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                print(f"ERROR: ANTHROPIC_API_KEY environment variable not set")
                return jsonify({"error": "Claude API key not configured"}), 500
            else:
                print(f"Debug: Found Claude API key (first few chars): {api_key[:5]}...")
            
            # Analyze with Claude
            print(f"Debug: Sending frame to Claude for analysis")
            
            try:
                # Encode the image to base64
                print("Encoding image to base64...")
                with open(frame_path, "rb") as image_file:
                    base64_image = base64.b64encode(image_file.read()).decode('utf-8')
                print(f"Base64 image length: {len(base64_image)} characters")
                
                # Prepare the API request
                print("Preparing Claude API request...")
                headers = {
                    "x-api-key": api_key,
                    "content-type": "application/json",
                    "anthropic-version": "2023-06-01"
                }
                
                data = {
                    "model": "claude-3-opus-20240229",
                    "max_tokens": 1000,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": custom_prompt
                                },
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": "image/jpeg",
                                        "data": base64_image
                                    }
                                }
                            ]
                        }
                    ]
                }
                
                print("Sending request to Claude API...")
                response = requests.post(
                    "https://api.anthropic.com/v1/messages",
                    headers=headers,
                    json=data,
                    timeout=60  # Increase timeout
                )
                
                print(f"Claude API response status code: {response.status_code}")
                
                if response.status_code == 200:
                    result = response.json()
                    analysis = result["content"][0]["text"]
                    print("Analysis complete! First 100 chars:")
                    print(analysis[:100] + "...")
                else:
                    error_text = response.text[:500] if response.text else "No error details"
                    print(f"ERROR from Claude API: {response.status_code}")
                    print(f"Error details: {error_text}")
                    return jsonify({"error": f"Claude API returned error: {response.status_code}"}), 500
            except Exception as e:
                print(f"ERROR during Claude API request: {str(e)}")
                import traceback
                traceback.print_exc()
                return jsonify({"error": f"Error calling Claude API: {str(e)}"}), 500
            
            # Save analysis to file
            print("Saving analysis to file...")
            analysis_path = f"{parent_dir}/output/analysis/analysis_{timestamp}.txt"
            with open(analysis_path, "w") as f:
                f.write(analysis)
            
            # Save to database
            try:
                print("Saving to database...")
                frame_filename = os.path.basename(frame_path)
                print(f"Debug: Saving analysis to database with frame path: {frame_filename}")
                save_analysis(timestamp, frame_filename, custom_prompt, analysis, device_id)
                print("Successfully saved to database")
            except Exception as e:
                print(f"ERROR saving to database: {str(e)}")
                import traceback
                traceback.print_exc()
                # Continue even if database save fails
            
            print(f"Debug: Analysis complete and saved successfully")
            
            # Return result with full data
            return jsonify({
                "timestamp": timestamp,
                "frame": frame_filename,
                "analysis": analysis,
                "success": True
            })
            
        except Exception as e:
            print(f"ERROR during frame extraction or analysis: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": str(e)}), 500
            
    except Exception as e:
        print(f"UNEXPECTED ERROR in analyze endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
            
# Fix 1: Modify the analyze-stream endpoint to avoid printing base64 data
@app.route('/api/analyze-stream', methods=['POST'])
def analyze_stream():
    """Analyze a snapshot from a live stream"""
    try:
        print("\n\n==== NEW STREAM SNAPSHOT ANALYSIS REQUEST ====")
        
        # Check if the image file was provided
        if 'image' not in request.files:
            print("No image file provided")
            return jsonify({"error": "No image file provided"}), 400
            
        # Get image file
        image_file = request.files['image']
        prompt = request.form.get('prompt', 'Please analyze this live stream snapshot.')
        device_id = request.form.get('deviceId', 'default')
        stream_name = request.form.get('streamName', 'Unknown Stream')
        
        print(f"Debug: Received stream snapshot from {stream_name} with device_id {device_id}")
        
        # Save the image to a temporary file
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        frame_path = f"{parent_dir}/output/frames/stream_{timestamp}.jpg"
        
        # Ensure the output directory exists
        os.makedirs(os.path.dirname(frame_path), exist_ok=True)
        
        try:
            image_file.save(frame_path)
            print(f"Debug: Stream snapshot saved to {frame_path}")
        except Exception as e:
            print(f"ERROR: Failed to save stream snapshot: {str(e)}")
            return jsonify({"error": f"Failed to save stream snapshot: {str(e)}"}), 500
        
        # Check if the file was saved successfully
        if not os.path.exists(frame_path):
            print(f"ERROR: Stream snapshot was not saved to {frame_path}")
            return jsonify({"error": "Stream snapshot was not saved properly"}), 500
            
        print(f"Debug: Stream snapshot saved successfully, size: {os.path.getsize(frame_path)} bytes")
        
        # Check for API key
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            print("ERROR: ANTHROPIC_API_KEY environment variable not set")
            return jsonify({"error": "Claude API key not configured"}), 500
            
        # Analyze with Claude
        print("Debug: Sending stream snapshot to Claude for analysis")
        
        try:
            # Encode the image to base64
            print("Encoding image to base64...")
            with open(frame_path, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            
            # Don't print the base64 data, just its length
            print(f"Base64 image encoded successfully, length: {len(base64_image)} bytes")
            
            # Prepare Claude API request
            print("Preparing Claude API request...")
            headers = {
                "x-api-key": api_key,
                "content-type": "application/json",
                "anthropic-version": "2023-06-01"
            }
            
            data = {
                "model": "claude-3-opus-20240229",
                "max_tokens": 1000,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": f"{prompt}\n\nThis is a snapshot from the live stream: {stream_name}."
                            },
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": "image/jpeg",
                                    "data": base64_image
                                }
                            }
                        ]
                    }
                ]
            }
            
            print("Sending request to Claude API...")
            response = requests.post(
                "https://api.anthropic.com/v1/messages",
                headers=headers,
                json=data,
                timeout=60
            )
            
            if response.status_code == 200:
                result = response.json()
                analysis = result["content"][0]["text"]
                # Fix 2: Don't print the raw content, just a short preview
                print(f"Analysis complete! Preview: {analysis[:50]}...")
            else:
                error_text = response.text[:500] if response.text else "No error details"
                print(f"ERROR from Claude API: {response.status_code}")
                print(f"Error details: {error_text}")
                return jsonify({"error": f"Claude API returned error: {response.status_code}"}), 500
                
        except Exception as e:
            print(f"ERROR during Claude API request: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({"error": f"Error calling Claude API: {str(e)}"}), 500
            
        # Save analysis to file
        analysis_path = f"{parent_dir}/output/analysis/stream_analysis_{timestamp}.txt"
        with open(analysis_path, "w") as f:
            f.write(analysis)
        print(f"Analysis saved to file: {analysis_path}")
        
        # Fix 3: Create consistent frame filename for database storage
        frame_filename = f"stream_{timestamp}.jpg"
        
        # Fix 4: Save stream analysis to database with correct device_id format
        try:
            # Ensure we use a consistent device_id format that can be queried later
            stream_device_id = f"stream_{device_id}"
            
            print(f"Saving to database with device_id: {stream_device_id}, frame: {frame_filename}")
            save_analysis(timestamp, frame_filename, prompt, analysis, stream_device_id)
            print(f"Successfully saved stream analysis to database with ID: {stream_device_id}")
        except Exception as e:
            print(f"ERROR saving stream analysis to database: {str(e)}")
            import traceback
            traceback.print_exc()
            # Continue even if database save fails
            
        # Return result with the correct frame path
        return jsonify({
            "timestamp": timestamp,
            "frame": frame_filename,
            "analysis": analysis,
            "success": True
        })
        
    except Exception as e:
        print(f"UNEXPECTED ERROR in analyze-stream endpoint: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
                
@app.route('/api/frames/<filename>')
def serve_frame(filename):
    """Serve a stored frame"""
    try:
        frame_path = f"{parent_dir}/output/frames/{filename}"
        
        # Check if file exists
        if not os.path.exists(frame_path):
            print(f"Frame not found at {frame_path}, checking alternate paths...")
            
            # Try other possible locations
            alternate_paths = [
                f"{parent_dir}/output/frames/stream_{filename}",  # In case "stream_" prefix is missing
                f"{filename}"  # In case the full path was provided
            ]
            
            for alt_path in alternate_paths:
                if os.path.exists(alt_path):
                    frame_path = alt_path
                    print(f"Found frame at alternate path: {frame_path}")
                    break
            
            if not os.path.exists(frame_path):
                print(f"ERROR: Frame {filename} not found in any location")
                return jsonify({"error": "Frame not found"}), 404
        
        print(f"Serving frame: {frame_path}")
        return send_file(frame_path, mimetype='image/jpeg')
    except Exception as e:
        print(f"Error serving frame {filename}: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
@app.route('/api/video')
def serve_video():
    """Serve the test video for frontend"""
    try:
        video_path = f"{parent_dir}/test_video.mp4"
        print(f"Video path: {video_path}")
        
        # Check if file exists
        if not os.path.exists(video_path):
            print(f"ERROR: Video file not found at {video_path}")
            # Try the fallback location
            video_path = f"{parent_dir}/frontend/public/test_video.mp4"
            print(f"Trying fallback path: {video_path}")
            
            if not os.path.exists(video_path):
                print(f"ERROR: Video not found at fallback path either")
                return jsonify({"error": "Video file not found"}), 404
            
        print(f"Video file found, attempting to serve: {video_path}")
        
        # Create a test response 
        try:
            # Add content headers to avoid CORS issues
            response = send_file(
                video_path, 
                mimetype='video/mp4',
                as_attachment=False,
                conditional=True  # Support partial requests
            )
            response.headers['Accept-Ranges'] = 'bytes'
            response.headers['Access-Control-Allow-Origin'] = '*'
            print("Video response prepared successfully")
            return response
        except Exception as e:
            print(f"ERROR creating response: {str(e)}")
            return jsonify({"error": f"Failed to create response: {str(e)}"}), 500
    except Exception as e:
        print(f"ERROR serving video: {str(e)}")
        return jsonify({"error": str(e)}), 500
        
@app.route('/api/history')
def get_history():
    """Get analysis history"""
    device_id = request.args.get('deviceId', 'default')
    
    # Check if we're looking for stream analysis - support both formats
    is_stream = request.args.get('isStream', 'false').lower() == 'true'
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    if is_stream:
        # Get stream analysis specifically
        cursor.execute(
            "SELECT * FROM analysis_history WHERE device_id LIKE 'stream_%' ORDER BY timestamp DESC"
        )
        print("Fetching stream analysis history")
    else:
        # Get standard analysis or for specific device
        if device_id == 'default':
            cursor.execute(
                "SELECT * FROM analysis_history WHERE device_id='default' ORDER BY timestamp DESC"
            )
        else:
            # Support both formats for backward compatibility
            cursor.execute(
                "SELECT * FROM analysis_history WHERE device_id=? OR device_id=? ORDER BY timestamp DESC",
                (device_id, f"stream_{device_id}")
            )
        print(f"Fetching analysis history for device: {device_id}")
    
    history = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    print(f"Found {len(history)} analysis history entries")
    return jsonify(history)

@app.route('/api/test', methods=['GET', 'OPTIONS'])
def test_endpoint():
    """Simple endpoint to test CORS issues"""
    if request.method == 'OPTIONS':
        # Handle OPTIONS preflight request
        response = Response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'GET,OPTIONS')
        return response
    
    print("Test endpoint called")
    return jsonify({"message": "Backend connection successful", "time": str(datetime.datetime.now())})

@app.route('/api/prompt', methods=['GET'])
def get_prompt():
    """Get the current custom prompt"""
    return jsonify({"prompt": get_default_prompt()})

@app.route('/api/prompt', methods=['POST'])
def update_prompt():
    """Update the custom prompt"""
    data = request.json
    new_prompt = data.get('prompt', '')
    if not new_prompt:
        return jsonify({"error": "No prompt provided"}), 400
    
    update_custom_prompt(new_prompt)
    return jsonify({"success": True, "prompt": new_prompt})

if __name__ == '__main__':
    print("\n========================================")
    print("Starting Flask server on http://localhost:5001")
    print("Available endpoints:")
    print("  - GET /api/test - Test endpoint")
    print("  - POST /api/analyze - Analysis endpoint")
    print("  - GET /api/history - Get analysis history")
    print("  - GET/POST /api/prompt - Get/set analysis prompt")
    print("  - GET /api/frames/<filename> - Serve frame images")
    print("  - GET /api/video - Serve video file")
    print("========================================\n")
    app.run(debug=True, port=5001)