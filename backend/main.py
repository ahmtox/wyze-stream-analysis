import os
import sys
import time
import datetime
import cv2
import base64
import requests
import json
from dotenv import load_dotenv
from wyzely import WyzeClient
from pathlib import Path

# Load environment variables
load_dotenv()

# Wyze API credentials
EMAIL = os.getenv("EMAIL")
PASSWORD = os.getenv("PASSWORD")
KEYID = os.getenv("KEYID")
APIKEY = os.getenv("APIKEY")

# Claude API credentials - add to your .env file
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Timestamp formatting
def format_timestamp(timestamp_ms):
    dt = datetime.datetime.fromtimestamp(timestamp_ms / 1000)
    return dt.strftime("%Y-%m-%d %H:%M:%S")

# Function to initialize Wyze client
def initialize_client():
    client = WyzeClient(keyid=KEYID, apikey=APIKEY)
    client.login(email=EMAIL, password=PASSWORD)
    print(f"Authentication successful! Access Token: {client.access_token[:10]}...")
    return client

# Function to get recent events with video URLs
def get_video_events(client, limit=5, days=7):
    print(f"Getting up to {limit} events with videos from the past {days} days...")
    
    # Calculate the start time (now - days)
    start_time = int((time.time() - (days * 24 * 60 * 60)) * 1000)
    
    # Get the events
    response = client.event.get_event_list(
        begin_time=start_time,
        end_time=int(time.time() * 1000),
        page_size=50  # Get more to filter for ones with videos
    )
    
    if response["code"] != 1:
        print(f"Error: {response['message']}")
        return []
    
    events = response["data"]["event_list"]
    
    # Filter events with video URLs
    video_events = []
    for event in events:
        parsed_event = client.event.parse_event_data(event)
        if 'video_url' in parsed_event:
            video_events.append(parsed_event)
            if len(video_events) >= limit:
                break
    
    print(f"Found {len(video_events)} events with videos")
    return video_events

# Function to download a video from URL
def download_video(video_url, output_path):
    print(f"Downloading video from {video_url[:50]}...")
    response = requests.get(video_url, stream=True)
    if response.status_code == 200:
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)
        print(f"Video saved to {output_path}")
        return True
    else:
        print(f"Failed to download video: {response.status_code}")
        return False

# Function to extract a frame at a specific time
def extract_frame(video_path, time_seconds, output_path):
    print(f"Extracting frame at {time_seconds} seconds...")
    
    try:
        # Ensure OpenCV is imported
        import cv2
        
        # Open the video file
        print(f"Opening video file: {video_path}")
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            print(f"Error: Could not open video file at {video_path}")
            return None
        
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
        print(f"Seeking to frame position {frame_pos}")
        success = cap.set(cv2.CAP_PROP_POS_FRAMES, frame_pos)
        if not success:
            print(f"Warning: Failed to set frame position to {frame_pos}, trying alternative approach")
            # Alternative approach: read frames until we reach the target position
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            for _ in range(frame_pos):
                cap.read()
        
        # Read the frame
        print("Reading frame")
        ret, frame = cap.read()
        if not ret:
            print("Error: Failed to read frame")
            cap.release()
            return None
        
        # Ensure the output directory exists
        print(f"Creating output directory: {os.path.dirname(output_path)}")
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save the frame
        print(f"Saving frame to {output_path}")
        success = cv2.imwrite(output_path, frame)
        if not success:
            print(f"Error: Failed to save frame to {output_path}")
            cap.release()
            return None
            
        print(f"Frame saved to {output_path}, size: {os.path.getsize(output_path)} bytes")
        
        cap.release()
        return output_path
    except Exception as e:
        print(f"Error in extract_frame: {str(e)}")
        import traceback
        traceback.print_exc()
        return None
        
# Function to encode image to base64
def encode_image_to_base64(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

# Function to analyze image with Claude
def analyze_image_with_claude(image_path, prompt):
    print("Analyzing image with Claude API...")
    
    try:
        # Check if the image exists and has content
        if not os.path.exists(image_path):
            return f"Error: Image file not found at {image_path}"
        
        if os.path.getsize(image_path) == 0:
            return "Error: Image file is empty"
        
        # Encode image
        try:
            base64_image = encode_image_to_base64(image_path)
        except Exception as e:
            return f"Error: Failed to encode image: {str(e)}"
        
        # Get API key
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return "Error: ANTHROPIC_API_KEY not set in environment variables"
        
        # Prepare the API request
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
                            "text": prompt
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
            timeout=30  # Add timeout
        )
        
        print(f"Claude API response status code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            analysis = result["content"][0]["text"]
            print("Analysis complete!")
            return analysis
        else:
            error_message = f"Error from Claude API: {response.status_code}"
            try:
                error_message += f" - {response.json().get('error', {}).get('message', '')}"
            except:
                error_message += f" - {response.text[:100]}"
            print(error_message)
            return error_message
    except Exception as e:
        error_message = f"Error in analyze_image_with_claude: {str(e)}"
        print(error_message)
        import traceback
        traceback.print_exc()
        return error_message
    
# Main function
def main():
    # Create output directories
    Path("output/videos").mkdir(parents=True, exist_ok=True)
    Path("output/frames").mkdir(parents=True, exist_ok=True)
    Path("output/analysis").mkdir(parents=True, exist_ok=True)
    
    # Initialize client
    client = initialize_client()
    
    # For simplicity, we'll use a local video file path for testing
    # In production, you would use the video_events from get_video_events()
    
    # Option 1: Use a local video file
    video_path = "test_video.mp4"  # Replace with your video path
    
    # Option 2: Uncomment to get videos from Wyze API
    # video_events = get_video_events(client, limit=1)
    # if not video_events:
    #     print("No video events found.")
    #     return
    # 
    # event = video_events[0]
    # video_url = event.get('video_url')
    # timestamp = event.get('timestamp')
    # event_id = event.get('id')
    # 
    # video_path = f"output/videos/{event_id}.mp4"
    # if not download_video(video_url, video_path):
    #     print("Failed to download video. Exiting.")
    #     return
    
    # Extract frame at 5 seconds into the video
    time_seconds = 5.0
    frame_path = f"output/frames/frame_{int(time.time())}.jpg"
    frame_path = extract_frame(video_path, time_seconds, frame_path)
    
    if frame_path:
        # Define the analysis prompt
        analysis_prompt = """
        Please analyze this image from a security camera. 
        Focus on:
        1. Are there any people or objects of interest visible?
        2. Describe any potential issues or anomalies you can detect.
        3. Is there any text visible in the image? If so, what does it say?
        
        Provide a detailed but concise analysis.
        """
        
        # Analyze the frame with Claude
        analysis = analyze_image_with_claude(frame_path, analysis_prompt)
        
        # Save the analysis
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        analysis_path = f"output/analysis/analysis_{timestamp}.txt"
        with open(analysis_path, "w") as f:
            f.write(analysis)
        
        # Print the analysis
        print("\n--- Image Analysis Result ---")
        print(analysis)
        print(f"Analysis saved to {analysis_path}")

if __name__ == "__main__":
    main()