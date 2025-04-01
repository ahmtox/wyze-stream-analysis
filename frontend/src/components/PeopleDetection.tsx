import { useEffect, useRef, useState } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

interface PeopleDetectionProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isEnabled: boolean;
  showOverlay?: boolean;
  onPeopleCountChange?: (count: number) => void;
}

interface Detection {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score: number;
}

export default function PeopleDetection({ 
  videoRef, 
  isEnabled, 
  showOverlay = true, 
  onPeopleCountChange 
}: PeopleDetectionProps) {
  const [model, setModel] = useState<cocoSsd.ObjectDetection | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  
  // Initialize TensorFlow.js and load the model on component mount
  useEffect(() => {
    let isMounted = true;
    
    async function initTensorFlowAndLoadModel() {
      try {
        if (!isMounted) return;
        setIsLoading(true);
        setModelLoadError(null);
        console.log('Initializing TensorFlow.js...');
        
        // Make sure TensorFlow.js is loaded with the required backends
        await Promise.all([
          tf.setBackend('webgl'),
          tf.ready()
        ]);
        
        console.log('TensorFlow backend initialized:', tf.getBackend());
        
        // Now load the model
        console.log('Loading COCO-SSD model...');
        const loadedModel = await cocoSsd.load({
          base: 'lite_mobilenet_v2' // Use lighter model for better performance
        });
        
        if (!isMounted) return;
        setModel(loadedModel);
        setIsLoading(false);
        console.log('COCO-SSD model loaded successfully');
      } catch (error: any) {
        console.error('Failed to load COCO-SSD model:', error);
        
        if (!isMounted) return;
        setModelLoadError(error?.message || 'Failed to load detection model');
        
        // Try fallback to CPU if WebGL fails
        try {
          console.log('Attempting to use CPU backend as fallback...');
          await tf.setBackend('cpu');
          console.log('Switched to CPU backend, loading model...');
          const loadedModel = await cocoSsd.load({
            base: 'lite_mobilenet_v2'
          });
          
          if (!isMounted) return;
          setModel(loadedModel);
          setIsLoading(false);
          setModelLoadError(null);
          console.log('COCO-SSD model loaded successfully with CPU backend');
        } catch (fallbackError: any) {
          if (!isMounted) return;
          console.error('Failed to load model with fallback backend:', fallbackError);
          setIsLoading(false);
          setModelLoadError(fallbackError?.message || 'Failed to load detection model with fallback');
        }
      }
    }
    
    // Only try to load model when enabled to save resources
    if (isEnabled) {
      initTensorFlowAndLoadModel();
    }
    
    // Cleanup function
    return () => {
      isMounted = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [isEnabled]);
  
  // Run detection when model is loaded and enabled
  useEffect(() => {
    if (!model || !isEnabled || !videoRef.current) return;
    
    const video = videoRef.current;
    
    // Detection function that will run periodically
    const detectPeople = async () => {
      if (video.readyState !== 4 || !model || !canvasRef.current) {
        // Video not ready yet, request next frame
        requestRef.current = requestAnimationFrame(detectPeople);
        return;
      }
      
      try {
        // Only run detection if video is playing and not paused
        if (!video.paused && !video.ended && video.currentTime > 0) {
          // Run object detection
          const predictions = await model.detect(video);
          
          // Filter only people detections with confidence > 0.5
          const peopleDetections = predictions.filter(
            pred => pred.class === 'person' && pred.score > 0.5
          ) as Detection[];
          
          // Update detections state
          setDetections(peopleDetections);
          
          // Notify parent component about people count
          if (onPeopleCountChange) {
            onPeopleCountChange(peopleDetections.length);
          }
          
          // Draw bounding boxes on canvas
          drawDetections(peopleDetections);
        }
      } catch (error) {
        console.error('Detection error:', error);
      }
      
      // Request next frame (throttle to every 500ms for performance)
      setTimeout(() => {
        requestRef.current = requestAnimationFrame(detectPeople);
      }, 500);
    };
    
    // Start detection loop
    detectPeople();
    
    // Cleanup function
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
        requestRef.current = null;
      }
    };
  }, [model, isEnabled, videoRef, onPeopleCountChange]);
  
  // Adjust canvas size when video dimensions change
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    
    const resizeObserver = new ResizeObserver(() => {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      
      // Redraw detections when size changes
      if (detections.length > 0) {
        drawDetections(detections);
      }
    });
    
    resizeObserver.observe(video);
    
    // Initial size
    canvas.width = video.clientWidth;
    canvas.height = video.clientHeight;
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [videoRef, detections]);
  
  // Draw the bounding boxes and labels on the canvas
  const drawDetections = (detections: Detection[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Don't draw if overlay is disabled
    if (!showOverlay) return;
    
    // Calculate scale factors
    const scaleX = canvas.width / video.videoWidth;
    const scaleY = canvas.height / video.videoHeight;
    
    // Draw each detection
    detections.forEach((detection) => {
      const [x, y, width, height] = detection.bbox;
      const scaledX = x * scaleX;
      const scaledY = y * scaleY;
      const scaledWidth = width * scaleX;
      const scaledHeight = height * scaleY;
      
      // Draw bounding box
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(scaledX, scaledY, scaledWidth, scaledHeight);
      
      // Draw a filled circle at the center (alternative to box)
      const centerX = scaledX + scaledWidth / 2;
      const centerY = scaledY + scaledHeight / 2;
      ctx.fillStyle = 'rgba(255, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // Draw label with confidence score
      const score = Math.round(detection.score * 100);
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      ctx.font = '12px Arial';
      ctx.fillText(`Person ${score}%`, scaledX, scaledY - 5);
    });
  };
  
  // Clean up canvas when detection is disabled
  useEffect(() => {
    if ((!isEnabled || !showOverlay) && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    } else if (isEnabled && showOverlay && detections.length > 0) {
      // Redraw if overlay is enabled
      drawDetections(detections);
    }
  }, [isEnabled, showOverlay, detections]);
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {isLoading && isEnabled && (
        <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded-full text-sm z-20">
          Loading people detection...
        </div>
      )}
      
      {modelLoadError && isEnabled && (
        <div className="absolute top-4 right-4 bg-red-800/90 text-white px-3 py-1 rounded-full text-sm z-20">
          Model failed to load
        </div>
      )}
      
      <canvas 
        ref={canvasRef}
        className={`absolute top-0 left-0 w-full h-full pointer-events-none z-10 ${
          !isEnabled || !showOverlay ? 'hidden' : ''
        }`}
      />
    </div>
  );
}