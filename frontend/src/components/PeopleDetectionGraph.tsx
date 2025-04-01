import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

interface DataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  count: number;     // Number of people detected
}

interface PeopleDetectionGraphProps {
  data: DataPoint[];
  maxPoints?: number; // Maximum number of points to display (for performance)
  sessionId: string; // Used to reset chart when detection is re-enabled
  isPaused: boolean; // Whether detection is paused
}

export default function PeopleDetectionGraph({ data, maxPoints = 60, sessionId, isPaused }: PeopleDetectionGraphProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const intervalRef = useRef<number | null>(null);
  const currentDataRef = useRef<DataPoint[]>([]); // Reference to keep track of latest data
  const updateCountRef = useRef<number>(0); // To track updates and detect duplicates
  
  // Keep the currentDataRef updated with the latest data
  useEffect(() => {
    currentDataRef.current = data;
  }, [data]);
  
  // One main effect to handle all interval management
  useEffect(() => {
    // Function to create and manage the update interval
    function setupInterval() {
      // Make absolutely sure any existing interval is cleared
      clearAllIntervals();
      
      // Only create a new interval if not paused
      if (!isPaused) {
        const intervalId = window.setInterval(() => {
          updateChart();
          updateCountRef.current += 1;
          console.log(
            `Chart updated at ${new Date().toLocaleTimeString()}`,
            `with ${currentDataRef.current.length} data points`,
            `(update #${updateCountRef.current})`
          );
        }, 1000);
        
        intervalRef.current = intervalId;
        console.log(`Interval created: ${intervalId}`);
      }
    }
    
    // Helper to make sure all intervals are cleared
    function clearAllIntervals() {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        console.log(`Cleared interval: ${intervalRef.current}`);
        intervalRef.current = null;
      }
    }
    
    // Setup the interval
    setupInterval();
    
    // Cleanup on unmount or when dependencies change
    return clearAllIntervals;
  }, [isPaused, sessionId]); // Recreate interval when pause state or session changes
  
  // Separate effect to initialize or recreate the chart when sessionId changes
  useEffect(() => {
    if (!chartRef.current) return;
    
    // Clear existing chart if there is one
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }
    
    // Reset update counter when creating a new chart
    updateCountRef.current = 0;
    
    const ctx = chartRef.current.getContext('2d');
    if (!ctx) return;
    
    // Create a new chart
    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'People Detected',
            data: [],
            borderColor: 'rgb(59, 130, 246)', // blue-600
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderWidth: 2,
            tension: 0.2,
            pointRadius: 3,
            pointBackgroundColor: 'rgb(37, 99, 235)', // blue-700
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 300,
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time',
            },
            ticks: {
              maxTicksLimit: 8,
              callback: function(value, index) {
                // Access data via the ref to always have the latest
                const dataPoints = currentDataRef.current;
                if (index >= 0 && index < dataPoints.length) {
                  const date = new Date(dataPoints[index].timestamp);
                  return date.toLocaleTimeString();
                }
                return '';
              }
            }
          },
          y: {
            title: {
              display: true,
              text: 'People Count'
            },
            beginAtZero: true,
            min: 0,
            suggestedMax: 5,
            ticks: {
              stepSize: 1,
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
          },
          tooltip: {
            callbacks: {
              title: function(context) {
                const dataIndex = context[0].dataIndex;
                const dataPoints = currentDataRef.current;
                if (dataIndex >= 0 && dataIndex < dataPoints.length) {
                  return new Date(dataPoints[dataIndex].timestamp).toLocaleTimeString();
                }
                return '';
              }
            }
          }
        },
      },
    });
    
    // Initial update with any existing data
    updateChart();
    
    // Cleanup function for unmount or sessionId change
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [sessionId]); // Only recreate when sessionId changes
  
  // Update the chart with current data from reference
  function updateChart() {
    const chart = chartInstanceRef.current;
    if (!chart) return;
    
    // Always use currentDataRef to get the latest data
    const currentData = currentDataRef.current;
    
    // Don't update if no data
    if (currentData.length === 0) return;
    
    // Limit data points for performance
    const limitedData = currentData.slice(-maxPoints);
    
    // Format time labels
    chart.data.labels = limitedData.map(point => {
      const date = new Date(point.timestamp);
      return date.toLocaleTimeString();
    });
    
    chart.data.datasets[0].data = limitedData.map(point => point.count);
    
    // Update without animation for smoother transitions
    chart.update('none');
  }
  
  return (
    <div className="relative h-64 w-full">
      <canvas ref={chartRef}></canvas>
    </div>
  );
}