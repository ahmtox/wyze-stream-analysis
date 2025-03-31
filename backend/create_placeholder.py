import os
import cv2
import numpy as np
from datetime import datetime

def create_placeholder_image(filename, output_dir):
    """Create a placeholder image for testing"""
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Create a blank image (dark gray background)
    img = np.ones((480, 640, 3), np.uint8) * 50
    
    # Add some text
    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(img, 'Mock Camera Feed', (50, 50), font, 1, (255, 255, 255), 2)
    cv2.putText(img, datetime.now().strftime('%Y-%m-%d %H:%M:%S'), (50, 100), font, 0.7, (255, 255, 255), 1)
    cv2.putText(img, f'File: {filename}', (50, 150), font, 0.7, (255, 255, 255), 1)
    
    # Draw a border
    cv2.rectangle(img, (10, 10), (630, 470), (100, 100, 100), 2)
    
    # Save the image
    output_path = os.path.join(output_dir, filename)
    cv2.imwrite(output_path, img)
    print(f"Created placeholder image at {output_path}")
    
    return output_path

if __name__ == "__main__":
    # Create a few placeholder images
    parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frames_dir = f"{parent_dir}/output/frames"
    
    create_placeholder_image("mock_frame_1.jpg", frames_dir)
    create_placeholder_image("mock_frame_2.jpg", frames_dir)
    print("Created placeholder images for testing")