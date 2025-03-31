import { useState } from 'react';
import PromptModal from './PromptModal';

interface AnalysisControlsProps {
  currentTime: number;
  onAnalysisRequest: (time: number, prompt?: string) => Promise<void>;
  isProcessing: boolean;
  isLiveStream?: boolean;
  isPeopleDetectionEnabled?: boolean;
  onTogglePeopleDetection?: () => void;
}

export default function AnalysisControls({ 
  currentTime, 
  onAnalysisRequest,
  isProcessing,
  isLiveStream = false,
  isPeopleDetectionEnabled = false,
  onTogglePeopleDetection
}: AnalysisControlsProps) {
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string | undefined>();
  const [hasCustomPrompt, setHasCustomPrompt] = useState(false);
  
  const handleTakeSnapshot = () => {
    onAnalysisRequest(currentTime, customPrompt);
  };
  
  const handlePromptSave = (prompt: string) => {
    setCustomPrompt(prompt);
    setHasCustomPrompt(true);
  };
  
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Analysis Controls</h3>
        <button
          onClick={() => setIsPromptModalOpen(true)}
          disabled={isProcessing}
          className={`
            flex items-center gap-1 text-sm 
            ${isProcessing ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800'}
          `}
        >
          <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Edit Prompt
        </button>
      </div>
      
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="mb-4">
          <p className="text-gray-600 text-sm">
            {isLiveStream 
              ? "Take a snapshot of the current live stream and analyze it using AI."
              : "Take a snapshot of the current frame and analyze it using AI."}
          </p>
          
          {hasCustomPrompt && (
            <div className="mt-2 p-2 bg-blue-50 rounded-md">
              <p className="text-xs text-blue-700 font-medium">Using custom analysis prompt</p>
            </div>
          )}
          
          {!isLiveStream && (
            <div className="mt-4">
              <label htmlFor="time-display" className="block text-sm font-medium text-gray-600">
                Current Video Position: <span className="font-semibold">{currentTime.toFixed(2)}s</span>
              </label>
            </div>
          )}
          
          {/* People Detection Toggle for Live Streams */}
          {isLiveStream && onTogglePeopleDetection && (
            <div className="mt-3 border-t pt-3 border-gray-100">
              <div className="flex items-center justify-between">
                <label htmlFor="people-detection" className="text-sm font-medium text-gray-600">
                  Real-time People Detection
                </label>
                <button 
                  onClick={onTogglePeopleDetection}
                  className={`px-3 py-1 text-xs rounded-full ${
                    isPeopleDetectionEnabled 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {isPeopleDetectionEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {isPeopleDetectionEnabled 
                  ? "Detection is active: people will be highlighted in the stream."
                  : "Enable to detect and count people in the live stream."}
              </p>
            </div>
          )}
        </div>
        
        <div className="flex justify-center">
          <button
            onClick={handleTakeSnapshot}
            disabled={isProcessing}
            className={`
              px-4 py-2 rounded-lg flex items-center gap-2 w-full justify-center
              ${isProcessing 
                ? 'bg-gray-300 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
              }
            `}
          >
            {isProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Analyzing {isLiveStream ? "Stream" : "Frame"}...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {isLiveStream ? "Capture & Analyze Stream" : "Take Snapshot & Analyze"}
              </>
            )}
          </button>
        </div>
      </div>
      
      <PromptModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        onSave={handlePromptSave}
      />
    </div>
  );
}