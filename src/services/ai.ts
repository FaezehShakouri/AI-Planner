import { CalendarEvent, ScheduleRequest } from '@/types';
import { addDays, setHours, setMinutes, parse, format, isSaturday, isSunday } from 'date-fns';
import { generateResponse, getEventSuggestions } from './ollama';

interface AIEvent {
  title: string;
  startTime: string;
  endTime: string;
  description?: string;
  daysOfWeek: string[];
}

export interface ProcessedSchedule {
  events: CalendarEvent[];
  error?: string;
  rawResponse?: string;
}

export async function processScheduleRequest({ text }: { text: string }): Promise<ProcessedSchedule> {
  try {
    const response = await generateResponse(text);
    
    // Store the raw response
    const result: ProcessedSchedule = {
      events: [],
      rawResponse: response
    };

    // Parse the response
    const parsedResponse = JSON.parse(response);
    
    // Process each event from the AI response
    for (const event of parsedResponse.events) {
      // Parse the time
      const [startHour, startMinute] = event.startTime.split(':').map(Number);
      const [endHour, endMinute] = event.endTime.split(':').map(Number);

      // Check if this is a recurring event with episodes
      const episodeMatch = text.match(/(\d+)\s*episodes?/i);
      const isRecurring = episodeMatch || event.description?.toLowerCase().includes('every day');
      
      if (isRecurring) {
        // Handle recurring events
        const numEpisodes = episodeMatch ? parseInt(episodeMatch[1]) : 30; // Default to 30 days if no episodes specified
        let currentDate = addDays(new Date(), 1); // Start from tomorrow
        let episodeCount = 0;

        while (episodeCount < numEpisodes) {
          // Skip weekends if mentioned in description
          if (event.description?.toLowerCase().includes('weekday') && 
              (isSaturday(currentDate) || isSunday(currentDate))) {
            currentDate = addDays(currentDate, 1);
            continue;
          }

          const start = new Date(currentDate);
          start.setHours(startHour, startMinute, 0);
          
          const end = new Date(currentDate);
          end.setHours(endHour, endMinute, 0);
          
          result.events.push({
            id: `${event.title.toLowerCase()}-${episodeCount}`,
            title: episodeMatch ? `${event.title} - Episode ${episodeCount + 1}` : event.title,
            start,
            end,
            description: episodeMatch 
              ? `Episode ${episodeCount + 1} of ${numEpisodes} - ${event.description || ''}`
              : event.description
          });

          episodeCount++;
          currentDate = addDays(currentDate, 1);
        }
      } else {
        // Handle single events
        const start = new Date();
        start.setDate(start.getDate() + 1); // Schedule for tomorrow
        start.setHours(startHour, startMinute, 0);
        
        const end = new Date();
        end.setDate(end.getDate() + 1);
        end.setHours(endHour, endMinute, 0);
        
        result.events.push({
          id: `${event.title.toLowerCase()}-single`,
          title: event.title,
          start,
          end,
          description: event.description
        });
      }
    }

    return result;
  } catch (error) {
    console.error('Error processing schedule request:', error);
    return {
      events: [],
      error: error instanceof Error ? error.message : 'Failed to process schedule',
      rawResponse: error instanceof Error ? error.message : undefined
    };
  }
}

export async function updateEventWithAI(event: CalendarEvent): Promise<CalendarEvent> {
  try {
    const eventDescription = `${event.title} from ${format(event.start, 'HH:mm')} to ${format(event.end, 'HH:mm')}. ${event.description || ''}`;
    const suggestions = await getEventSuggestions(eventDescription);
    
    return {
      ...event,
      description: suggestions
    };
  } catch (error) {
    console.error('Error updating event:', error);
    return event;
  }
} 