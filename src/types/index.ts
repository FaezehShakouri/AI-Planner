export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  description?: string;
}

export interface ScheduleRequest {
  text: string;
}

export interface ProcessedSchedule {
  events: CalendarEvent[];
  error?: string;
} 