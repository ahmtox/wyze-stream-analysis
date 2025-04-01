import axios from 'axios';

const API_URL = 'http://localhost:5001/api';
const USE_DEV_MODE = false; // Set to true to bypass backend for testing

// Cache the video URL to prevent repeated logging
let cachedVideoUrls: {[key: string]: string} = {};

export interface AnalysisResult {
  id: number;
  timestamp: string;
  frame_path: string;
  prompt: string;
  result: string;
  device_id: string;
}

// Mock history data for dev mode
const MOCK_HISTORY: AnalysisResult[] = [
  {
    id: 1,
    timestamp: "20230915_143022",
    frame_path: "mock_frame_1.jpg",
    prompt: "Please analyze this security camera footage.",
    result: "This is a mock analysis result for testing. The image shows a typical scene with no unusual activity.",
    device_id: "default"
  },
  {
    id: 2,
    timestamp: "20230915_153022",
    frame_path: "mock_frame_2.jpg",
    prompt: "Please analyze this security camera footage with custom prompt.",
    result: "This is another mock analysis result. The image appears to show a static scene with nothing of concern.",
    device_id: "default"
  }
];

const api = {
  // Get list of available videos
  getVideos: async () => {
    if (USE_DEV_MODE) {
      // Mock video list for dev mode
      return [
        { id: "football", name: "Backyard Cam", filename: "football.mp4", description: "Football game in backyard" },
        { id: "cat_food", name: "Kitchen Cam", filename: "cat_food.mp4", description: "Cat food monitoring" },
        { id: "gauge", name: "Utility Cam", filename: "gauge.mp4", description: "Gauge monitoring" },
        { id: "pedestrians", name: "Front Door Cam", filename: "pedestrians.mp4", description: "Pedestrians on sidewalk" },
        { id: "thermometer", name: "Weather Cam", filename: "thermometer.mp4", description: "Temperature monitoring" },
        { id: "times_square", name: "Times Square Cam", filename: "times_square.mp4", description: "Times Square street view" }
      ];
    }
    
    try {
      const response = await axios.get(`${API_URL}/videos`);
      return response.data;
    } catch (error) {
      console.error('Error fetching videos:', error);
      return [];
    }
  },

  // Get video stream URL
  getVideoUrl: (filename = "football.mp4") => {
    if (cachedVideoUrls[filename]) return cachedVideoUrls[filename];
    
    // Try in this order:
    // 1. Direct from public folder
    // 2. From API endpoint
    
    // Use public folder first (most reliable)
    const publicUrl = `/${filename}`;
    cachedVideoUrls[filename] = publicUrl;
    console.log(`Using video URL: ${publicUrl}`);
    
    return cachedVideoUrls[filename];
  },

  testConnection: async () => {
    try {
      const response = await axios.get(`${API_URL}/test`);
      console.log('Backend connection test:', response.data);
      return response.data;
    } catch (error) {
      console.error('Backend connection test failed:', error);
      throw error;
    }
  },
  
  // Get frame image - ensure we're using the full API URL
  getFrameUrl: (filename: string) => {
    if (USE_DEV_MODE) {
      // For development: return a placeholder image instead
      return `https://developers.elementor.com/docs/hooks/placeholder-image/`;
    }
    
    // Make sure the filename is properly formatted regardless of whether it contains the path
    const cleanFilename = filename.includes('/') ? 
      filename.split('/').pop() : filename;
    
    return `${API_URL}/frames/${cleanFilename}`;
  },
    
  // Analyze video frame
  analyzeFrame: async (timeSeconds: number, deviceId: string = 'default', videoFilename: string = 'football.mp4', prompt?: string) => {
    try {
      console.log(`Analyzing frame at ${timeSeconds.toFixed(2)}s from ${videoFilename}${prompt ? ' with custom prompt' : ''}`);
      
      // Development mode mock response
      if (USE_DEV_MODE) {
        console.log('Using development mock for analysis');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate delay
        
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '_');
        const mockResult = {
          timestamp: timestamp,
          frame: `mock_frame_${timestamp}.jpg`,
          analysis: `This is a mock analysis of a frame captured at ${timeSeconds.toFixed(2)} seconds from ${videoFilename}.\n\nThe scene shows a typical security camera view.\n\nNo unusual activity detected.`,
          success: true
        };
        
        return mockResult;
      }
  
      // Create proper headers
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      // Make the request with proper CORS handling
      const response = await axios.post(
        `${API_URL}/analyze`, 
        {
          timeSeconds,
          deviceId,
          videoFilename,  // Pass the video filename to the backend
          prompt
        }, 
        {
          timeout: 120000,
          headers: headers,
          withCredentials: false // Important for CORS
        }
      );
      
      console.log('Analysis complete:', response.data);
      return response.data;
    } catch (error: any) {
          console.error('Error during analysis:', error);
      
      // Extract the specific error message from the backend response
      let errorMessage = 'Unknown error occurred';
      
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Backend error response:', error.response.data);
        if (error.response.data && error.response.data.error) {
          errorMessage = error.response.data.error;
        } else if (error.response.status) {
          errorMessage = `Server error (${error.response.status})`;
        }
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received:', error.request);
        errorMessage = 'No response from server';
      } else if (error.message) {
        // Something happened in setting up the request that triggered an error
        console.error('Request setup error:', error.message);
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  },

  analyzeStreamSnapshot: async (formData: FormData) => {
    try {
      console.log('Analyzing livestream snapshot');
      
      // Development mode mock response
      if (USE_DEV_MODE) {
        console.log('Using development mock for stream snapshot analysis');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate delay
        
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '_');
        const mockResult = {
          timestamp: timestamp,
          frame: `mock_frame_${timestamp}.jpg`,
          analysis: `This is a mock analysis of a live stream snapshot.\n\nThe scene shows a typical security camera view with a livestream.\n\nNo unusual activity detected.`,
          success: true
        };
        
        return mockResult;
      }
  
      // Make the request with proper CORS handling
      const response = await axios.post(
        `${API_URL}/analyze-stream`, 
        formData,
        {
          timeout: 120000,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          withCredentials: false // Important for CORS
        }
      );
      
      console.log('Stream analysis complete:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Error during stream analysis:', error);
      
      // Extract the specific error message from the backend response
      let errorMessage = 'Unknown error occurred';
      if (error.response && error.response.data && error.response.data.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      throw new Error(errorMessage);
    }
  },

  // Get analysis history
  getHistory: async (deviceId: string = 'default', includeStreams: boolean = true) => {
    // Use mock data in development mode
    if (USE_DEV_MODE) {
      console.log('Using mock history data');
      return MOCK_HISTORY;
    }
    
    // Otherwise call the real API
    try {
      // Make two requests - one for regular history and one for streams
      let history: AnalysisResult[] = [];
      
      // Get regular history
      const response = await axios.get(`${API_URL}/history`, {
        params: { deviceId }
      });
      history = response.data as AnalysisResult[];
      
      // Also get stream history if requested
      if (includeStreams) {
        const streamResponse = await axios.get(`${API_URL}/history`, {
          params: { isStream: 'true' }
        });
        
        // Combine the results
        history = [...history, ...(streamResponse.data as AnalysisResult[])];
        
        // Sort by timestamp (newest first)
        history.sort((a, b) => {
          return b.timestamp.localeCompare(a.timestamp);
        });
      }
      
      console.log(`Retrieved ${history.length} history items (including streams: ${includeStreams})`);
      return history;
    } catch (error) {
      console.error('Error fetching history:', error);
      return []; // Return empty array on error
    }
  },
    
  // Get custom prompt
  getPrompt: async () => {
    if (USE_DEV_MODE) {
      return "Please analyze this image from a security camera and describe what you see. Focus on any unusual activities, people, or objects present.";
    }
    
    try {
      const response = await axios.get(`${API_URL}/prompt`);
      return response.data.prompt;
    } catch (error) {
      console.error('Error fetching prompt:', error);
      return "Please analyze this image."; // Default prompt on error
    }
  },
  
  // Update custom prompt
  updatePrompt: async (prompt: string) => {
    if (USE_DEV_MODE) {
      console.log('Mock prompt update:', prompt);
      return { success: true, prompt };
    }
    
    const response = await axios.post(`${API_URL}/prompt`, { prompt });
    return response.data;
  }
};

export default api;