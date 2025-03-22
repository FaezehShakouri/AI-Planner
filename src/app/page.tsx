'use client';

import dynamic from 'next/dynamic';
import { useState, useRef, useEffect } from 'react';
import { Calendar as BigCalendar, dateFnsLocalizer, View } from 'react-big-calendar';
import { format } from 'date-fns/format';
import { parse } from 'date-fns/parse';
import { startOfWeek } from 'date-fns/startOfWeek';
import { getDay } from 'date-fns/getDay';
import { setHours, setMinutes, isValid } from 'date-fns';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { processScheduleRequest, updateEventWithAI } from '@/services/ai';
import { CalendarEvent } from '@/types';
import { Dialog } from '@headlessui/react';

// Create a type-safe calendar component
const Calendar = dynamic(
  () => import('react-big-calendar').then((mod) => {
    const Calendar = mod.Calendar;
    return function TypeSafeCalendar(props: any) {
      return (
        <Calendar
          {...props}
          className="custom-calendar"
          eventPropGetter={(event) => ({
            className: 'calendar-event',
            style: {
              backgroundColor: '#2563eb',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              fontSize: '14px',
              padding: '4px 8px'
            }
          })}
        />
      );
    };
  }),
  { ssr: false }
);

const locales = {
  'en-US': require('date-fns/locale/en-US'),
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// Add this new component for the resize handle
function ResizeHandle({ onResize }: { onResize: (width: number) => void }) {
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const handleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;

    const onMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = handle.previousElementSibling?.clientWidth || 400;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      
      const delta = e.clientX - startX.current;
      const newWidth = Math.max(300, Math.min(800, startWidth.current + delta));
      onResize(newWidth);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      handle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onResize]);

  return (
    <div
      ref={handleRef}
      className="w-1 hover:w-2 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors relative group"
    >
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="h-8 w-1 bg-blue-500 rounded"></div>
      </div>
    </div>
  );
}

// Add these new types and state variables
interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

// Add this new component for the ChatGPT-style thinking indicator
const ThinkingIndicator = () => (
  <div className="flex items-start space-x-2 animate-fade-in">
    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
      <span className="text-blue-600 text-sm font-medium">AI</span>
    </div>
    <div className="flex-1 bg-gray-100 rounded-lg p-4 maxw-[85%]">
      <div className="flex items-center space-x-2">
        <div className="text-gray-600">AI is thinking</div>
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce-1" />
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce-2" />
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce-3" />
        </div>
      </div>
    </div>
  </div>
);

// Add these animations and styling components
const WelcomeAnimation = () => (
  <div className="flex items-center space-x-2 mb-6 animate-fade-in">
    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
    <div className="flex-1">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">AI Planning Assistant</h3>
      <p className="text-sm text-gray-600">Let's organize your schedule together!</p>
    </div>
  </div>
);

export default function Home() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editedEvent, setEditedEvent] = useState<CalendarEvent | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());
  const [chatWidth, setChatWidth] = useState(400);

  // In your Home component, add these state variables
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    type: 'ai',
    text: `How can I assist you with planning today?`,
    timestamp: new Date()
  }]);
  const [isAiTyping, setIsAiTyping] = useState(false);

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      type: 'user',
      text: aiInput,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);

    // Clear input and show AI is typing
    setAiInput('');
    setIsProcessing(true);
    setIsAiTyping(true);
    setError(null);
    setAiResponse(null);

    // Scroll to bottom
    setTimeout(() => {
      const chatMessages = document.getElementById('chat-messages');
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }, 100);

    try {
      const result = await processScheduleRequest({ text: userMessage.text });
      
      // Add AI response
      setMessages(prev => [...prev, {
        id: `ai-${Date.now()}`,
        type: 'ai',
        text: result.error 
          ? `Sorry, I encountered an error: ${result.error}`
          : "I've scheduled your events! You can see them in the calendar.",
        timestamp: new Date()
      }]);

      if (result.error) {
        setError(result.error);
      } else {
        setEvents(result.events);
        if (result.rawResponse) {
          setAiResponse(result.rawResponse);
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: `ai-error-${Date.now()}`,
        type: 'ai',
        text: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date()
      }]);
      setError('Failed to process your request. Please try again.');
    } finally {
      setIsProcessing(false);
      setIsAiTyping(false);
      
      // Scroll to bottom again after response
      setTimeout(() => {
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }, 100);
    }
  };

  const handleEventSelect = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setEditedEvent(event);
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleEventUpdate = async () => {
    if (!editedEvent) return;

    try {
      const updatedEvent = await updateEventWithAI(editedEvent);
      setEvents(events.map(e => e.id === updatedEvent.id ? updatedEvent : e));
      setIsEditModalOpen(false);
    } catch (err) {
      setEditError('Failed to update event with AI suggestions.');
    }
  };

  const handleTimeChange = (field: 'start' | 'end', timeStr: string) => {
    if (!editedEvent) return;

    const [hours, minutes] = timeStr.split(':').map(Number);
    const newDate = field === 'start' ? new Date(editedEvent.start) : new Date(editedEvent.end);
    const updatedDate = setHours(setMinutes(newDate, minutes || 0), hours || 0);

    if (!isValid(updatedDate)) {
      setEditError('Invalid time format');
      return;
    }

    if (field === 'start' && updatedDate >= editedEvent.end) {
      setEditError('Start time must be before end time');
      return;
    }

    if (field === 'end' && updatedDate <= editedEvent.start) {
      setEditError('End time must be after start time');
      return;
    }

    setEditError(null);
    setEditedEvent({
      ...editedEvent,
      [field]: updatedDate
    });
  };

  const handleSaveChanges = () => {
    if (!editedEvent) return;

    if (editedEvent.start >= editedEvent.end) {
      setEditError('Start time must be before end time');
      return;
    }

    setEvents(events.map(e => e.id === editedEvent.id ? editedEvent : e));
    setIsEditModalOpen(false);
  };

  // Add this handler function
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); // Prevent new line
      if (aiInput.trim() && !isProcessing) {
        handleAiSubmit(e as any);
      }
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="h-screen flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 flex-shrink-0">
          <div className="px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900">AI Planner</h1>
                <span className="px-3 py-1 text-sm text-blue-600 bg-blue-50 rounded-full font-medium">Beta</span>
              </div>
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors inline-flex items-center space-x-1"
              >
                <span>{showDebug ? 'Hide' : 'Show'} Debug</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Chat Panel */}
          <div 
            className="flex flex-col bg-gradient-to-b from-white to-gray-50 border-r border-gray-200 overflow-hidden"
            style={{ width: `${chatWidth}px` }}
          >
            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-4" id="chat-messages">
              <WelcomeAnimation />
              
              <div className="space-y-6">
                {/* Quick Suggestions */}
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 animate-fade-in">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">Quick Examples:</h4>
                  <div className="space-y-2">
                    {[
                      "Schedule a team meeting tomorrow at 2pm",
                      "Plan my daily workout routine at 7am",
                      "Set up weekly project reviews every Monday"
                    ].map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => setAiInput(suggestion)}
                        className="block w-full text-left text-sm text-blue-700 hover:text-blue-800 hover:bg-blue-100 rounded p-2 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex items-start space-x-3 animate-fade-in-up ${
                      message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`flex-shrink-0 ${message.type === 'user' ? 'ml-3' : 'mr-3'}`}>
                      {message.type === 'ai' ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-purple-600 flex items-center justify-center shadow-md">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Message Content */}
                    <div className={`flex flex-col ${message.type === 'user' ? 'items-end' : 'items-start'} max-w-[75%]`}>
                      <div className={`rounded-2xl p-4 shadow-sm ${
                        message.type === 'ai' 
                          ? 'bg-white border border-gray-200 text-gray-900' 
                          : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white'
                      }`}>
                        <p className={`text-sm whitespace-pre-wrap ${
                          message.type === 'ai' ? 'text-gray-900' : 'text-white'
                        }`}>{message.text}</p>
                      </div>
                      <span className={`text-xs text-gray-400 mt-1 ${
                        message.type === 'user' ? 'text-right' : 'text-left'
                      }`}>
                        {format(message.timestamp, 'HH:mm')}
                      </span>
                    </div>
                  </div>
                ))}

                {isAiTyping && (
                  <div className="flex items-start space-x-3 animate-fade-in">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center shadow-md">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-700">AI is planning</span>
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce-1" />
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce-2" />
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce-3" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Chat Input Area */}
            <div className="border-t border-gray-200 p-4 bg-white">
              <form onSubmit={handleAiSubmit} className="space-y-4">
                <div className="relative">
                  <textarea
                    id="schedule-input"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Tell me about your schedule... (Press Enter to send)"
                    className="w-full pl-4 pr-12 py-3 text-sm text-gray-900 bg-gray-50 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white border border-gray-200 resize-none transition-all"
                    rows={3}
                    style={{ minHeight: '60px' }}
                  />
                  <button
                    type="submit"
                    disabled={isProcessing || !aiInput.trim()}
                    className="absolute right-3 bottom-3 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isProcessing ? (
                      <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Resize Handle */}
          <ResizeHandle onResize={setChatWidth} />

          {/* Calendar Area */}
          <div className="flex-1 overflow-hidden bg-white p-6 min-w-[500px]">
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 'calc(100vh - 140px)' }}
              view={view}
              onView={setView}
              date={date}
              onNavigate={setDate}
              views={['week', 'month']}
              onSelectEvent={handleEventSelect}
              toolbar={true}
              popup={true}
              selectable={true}
              length={90}
            />
          </div>
        </div>

        {/* Modal */}
        <Dialog
          open={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          className="relative z-50"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" aria-hidden="true" />
          
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <Dialog.Panel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
              <div className="flex justify-between items-center mb-6">
                <Dialog.Title className="text-xl font-semibold text-gray-900">
                  Edit Event
                </Dialog.Title>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {editedEvent && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Title
                    </label>
                    <input
                      type="text"
                      value={editedEvent.title}
                      onChange={(e) => setEditedEvent({
                        ...editedEvent,
                        title: e.target.value
                      })}
                      className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Time
                      </label>
                      <input
                        type="time"
                        value={format(editedEvent.start, 'HH:mm')}
                        onChange={(e) => handleTimeChange('start', e.target.value)}
                        className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Time
                      </label>
                      <input
                        type="time"
                        value={format(editedEvent.end, 'HH:mm')}
                        onChange={(e) => handleTimeChange('end', e.target.value)}
                        className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description
                    </label>
                    <textarea
                      value={editedEvent.description || ''}
                      onChange={(e) => setEditedEvent({
                        ...editedEvent,
                        description: e.target.value
                      })}
                      className="w-full px-4 py-2 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[100px] resize-none"
                      placeholder="Add a description..."
                    />
                  </div>

                  {editError && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-600">{editError}</p>
                    </div>
                  )}

                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={handleEventUpdate}
                      className="px-6 py-2 text-base font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                      Get AI Suggestions
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveChanges}
                      className="px-6 py-2 text-base font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              )}
            </Dialog.Panel>
          </div>
        </Dialog>
    </div>

      <style jsx global>{`
        .custom-calendar {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          height: 100%;
        }
        .custom-calendar .rbc-header {
          padding: 12px;
          font-weight: 600;
          font-size: 0.875rem;
          color: #374151;
          background-color: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }
        .custom-calendar .rbc-time-header-content {
          font-size: 0.875rem;
          color: #374151;
        }
        .custom-calendar .rbc-today {
          background-color: #eff6ff;
        }
        .custom-calendar .rbc-event {
          padding: 4px 8px;
          font-size: 0.875rem;
          border-radius: 4px;
          background-color: #2563eb;
          border: none;
          color: white;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .custom-calendar .rbc-event.rbc-selected {
          background-color: #1d4ed8;
        }
        .custom-calendar .rbc-time-slot {
          font-size: 0.875rem;
          color: #6b7280;
        }
        .custom-calendar .rbc-current-time-indicator {
          background-color: #ef4444;
          height: 2px;
        }
        .custom-calendar .rbc-toolbar {
          margin-bottom: 20px;
          padding: 0 1rem;
        }
        .custom-calendar .rbc-toolbar button {
          color: #374151;
          background-color: #ffffff;
          border: 1px solid #d1d5db;
          padding: 8px 16px;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        .custom-calendar .rbc-toolbar button:hover {
          background-color: #f3f4f6;
          border-color: #9ca3af;
        }
        .custom-calendar .rbc-toolbar button.rbc-active {
          background-color: #2563eb;
          border-color: #2563eb;
          color: white;
        }
        .custom-calendar .rbc-toolbar button.rbc-active:hover {
          background-color: #1d4ed8;
          border-color: #1d4ed8;
        }
        .custom-calendar .rbc-toolbar-label {
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }
        .custom-calendar .rbc-month-view {
          border-radius: 8px;
          border: 1px solid #e5e7eb;
        }
        .custom-calendar .rbc-day-bg {
          transition: background-color 0.2s;
        }
        .custom-calendar .rbc-day-bg:hover {
          background-color: #f9fafb;
        }

        /* Custom scrollbar for chat area */
        .overflow-y-auto {
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }

        .overflow-y-auto::-webkit-scrollbar {
          width: 6px;
        }

        .overflow-y-auto::-webkit-scrollbar-track {
          background: transparent;
        }

        .overflow-y-auto::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }

        /* Smooth transitions */
        .transition-all {
          transition: all 0.2s ease-in-out;
        }

        /* Prevent text selection while resizing */
        .resize-active {
          user-select: none;
        }

        /* Ensure calendar responsiveness */
        .rbc-calendar {
          min-width: 500px;
          width: 100%;
          height: 100%;
        }

        /* Adjust calendar for smaller screens */
        @media (max-width: 1024px) {
          .rbc-toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          
          .rbc-toolbar-label {
            margin: 8px 0;
          }
          
          .rbc-btn-group {
            justify-content: center;
          }
        }

        /* Handle very small screens */
        @media (max-width: 640px) {
          .rbc-calendar {
            min-width: 300px;
          }
          
          .rbc-toolbar {
            font-size: 0.875rem;
          }
          
          .rbc-event {
            padding: 2px 4px;
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }

        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out forwards;
        }

        .animate-bounce-1 {
          animation: bounce 1s infinite;
          animation-delay: 0s;
        }

        .animate-bounce-2 {
          animation: bounce 1s infinite;
          animation-delay: 0.15s;
        }

        .animate-bounce-3 {
          animation: bounce 1s infinite;
          animation-delay: 0.3s;
        }

        #chat-messages {
          scroll-behavior: smooth;
          scrollbar-width: thin;
          scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
        }

        #chat-messages::-webkit-scrollbar {
          width: 5px;
        }

        #chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        #chat-messages::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }

        .message-group {
          margin-bottom: 1rem;
        }

        .message-group:last-child {
          margin-bottom: 0;
        }

        .rounded-2xl {
          border-radius: 1rem;
        }

        .message-bubble {
          transition: transform 0.2s ease;
        }

        .message-bubble:hover {
          transform: scale(1.01);
        }
      `}</style>
    </main>
  );
}
