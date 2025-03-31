import { useState, useEffect } from 'react';
import type { AnalysisResult } from '../services/api';
import api from '../services/api';

interface AnalysisHistoryProps {
  history: AnalysisResult[];
}

export default function AnalysisHistory({ history }: AnalysisHistoryProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  
  // Reset image errors when history changes
  useEffect(() => {
    setImageErrors({});
  }, [history]);
  
  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };
  
  const handleImageError = (id: number) => {
    setImageErrors(prev => ({...prev, [id]: true}));
  };
  
  const formatTimestamp = (timestamp: string) => {
    // Format YYYYMMDD_HHMMSS to a more readable format
    if (timestamp.includes('_')) {
      const [date, time] = timestamp.split('_');
      const year = date.substring(0, 4);
      const month = date.substring(4, 6);
      const day = date.substring(6, 8);
      
      const hours = time.substring(0, 2);
      const minutes = time.substring(2, 4);
      const seconds = time.substring(4, 6);
      
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    return timestamp;
  };
  
  const isStreamAnalysis = (item: AnalysisResult): boolean => {
    return item.device_id.startsWith('stream_') || item.frame_path.startsWith('stream_');
  };
  
  if (history.length === 0) {
    return (
      <div className="text-center p-4">
        <p className="text-gray-500">No analysis history yet</p>
      </div>
    );
  }
  
  return (
    <div className="space-y-4 mt-4">
      <h2 className="text-lg font-medium text-gray-900">Analysis History</h2>
      <div className="space-y-3">
        {history.map((item) => (
          <div 
            key={item.id}
            className="bg-white p-4 rounded-lg shadow"
          >
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">{formatTimestamp(item.timestamp)}</p>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">
                    {isStreamAnalysis(item) ? 'Stream' : 'Video'} Analysis #{item.id}
                  </h3>
                  {isStreamAnalysis(item) && (
                    <span className="bg-red-100 text-red-800 text-xs px-2 py-0.5 rounded-full">
                      Live Stream
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => toggleExpand(item.id)}
                className="text-blue-600 hover:text-blue-800"
              >
                {expandedId === item.id ? 'Hide Details' : 'View Details'}
              </button>
            </div>
            
            {expandedId === item.id && (
              <div className="mt-4 space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Frame</h4>
                  <div className="mt-2 flex justify-center">
                    {!imageErrors[item.id] ? (
                      <div className="border border-gray-200 rounded-lg overflow-hidden max-w-xs">
                        <img
                          src={api.getFrameUrl(item.frame_path)}
                          alt={`Frame ${item.id}`}
                          className="h-auto w-full object-contain"
                          onError={() => handleImageError(item.id)}
                        />
                      </div>
                    ) : (
                      <div className="border border-gray-200 rounded-lg overflow-hidden max-w-xs bg-gray-100 p-4 text-center">
                        <p className="text-gray-500 text-sm">Image not available</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Prompt</h4>
                  <pre className="mt-1 text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 p-2 rounded-md">
                    {item.prompt}
                  </pre>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Analysis Result</h4>
                  <div className="mt-1 prose prose-sm max-w-none bg-gray-50 p-2 rounded-md">
                    {item.result}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}