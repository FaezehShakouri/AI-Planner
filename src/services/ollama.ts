import axios from 'axios';

const API_URL = '/api/ollama';

interface OllamaResponse {
  response: string;
  done: boolean;
}

const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

function cleanJSONString(str: string): string {
  try {
    // Remove any text before the first {
    const startIndex = str.indexOf('{');
    if (startIndex === -1) return '';
    str = str.slice(startIndex);

    // Remove any text after the last }
    const endIndex = str.lastIndexOf('}');
    if (endIndex === -1) return '';
    str = str.slice(0, endIndex + 1);

    // Clean up the string
    str = str
      // Remove line breaks and extra spaces
      .replace(/\\n/g, '')
      .replace(/\n/g, '')
      .replace(/\s+/g, ' ')
      // Remove escaped quotes and fix double quotes
      .replace(/\\"/g, '"')
      .replace(/"{2,}/g, '"')
      // Remove any trailing commas before closing brackets
      .replace(/,\s*([\]}])/g, '$1')
      // Ensure property names are properly quoted
      .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
      .trim();

    return str;
  } catch (error) {
    console.error('Error cleaning JSON string:', error);
    return '';
  }
}

function extractJSON(text: string): string {
  try {
    // First try to find a complete JSON object
    const jsonRegex = /\{(?:[^{}]|(\{[^{}]*\}))*\}/g;
    const matches = text.match(jsonRegex);
    
    if (!matches) return '';

    // Try each match until we find a valid JSON
    for (const match of matches) {
      try {
        const cleaned = cleanJSONString(match);
        // Verify it's valid JSON and has the required structure
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object' && 'events' in parsed) {
          return cleaned;
        }
      } catch (e) {
        continue; // Try next match if this one fails
      }
    }

    // If no valid JSON found, try to extract from the entire text
    const cleaned = cleanJSONString(text);
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object' && 'events' in parsed) {
        return cleaned;
      }
    } catch (e) {
      // Ignore error and continue
    }

    return '';
  } catch (error) {
    console.error('Error extracting JSON:', error);
    return '';
  }
}

export async function generateResponse(prompt: string): Promise<string> {
  try {
    console.log('=== START generateResponse ===');
    console.log('🚀 Sending request with prompt:', prompt);

    const response = await axiosInstance.post('', {
      model: 'llama2',
      prompt: `You are a calendar scheduling assistant. Create calendar events based on the following request.
The user may request one or multiple tasks/events to be scheduled.

IMPORTANT: You must respond with ONLY a JSON object. No other text, no explanations, no comments.
The response must be a single JSON object with this exact structure:

{
  "events": [
    {
      "title": "Team Meeting",
      "startTime": "14:00",
      "endTime": "15:00",
      "description": "Team sync meeting"
    }
  ]
}

Rules:
1. Time format MUST be 24-hour (HH:mm) with leading zeros (e.g., "09:00" not "9:00")
2. All times must be between "00:00" and "23:59"
3. Include exactly these fields: title, startTime, endTime, description
4. Do not add any other fields
5. Do not add any text before or after the JSON
6. Create separate events for each task/activity mentioned
7. For recurring events, add "Recurring: [frequency]" to the description

Example valid times:
- "09:00" (not "9:00")
- "14:30" (not "2:30 pm")
- "23:00" (not "11:00 pm")
- "00:00" (for midnight)

User request: ${prompt}`,
      stream: false
    });

    console.log('📥 Raw response from Ollama:', response.data);
    const data = response.data as OllamaResponse;
    console.log('📝 Response text:', data.response);
    
    // Extract and clean JSON from the response
    const jsonStr = extractJSON(data.response);
    console.log('🔍 Extracted JSON:', jsonStr);

    if (!jsonStr) {
      console.error('❌ Failed to extract JSON from response:', {
        originalResponse: data.response,
        cleanedResponse: jsonStr
      });
      throw new Error('No valid JSON found in response');
    }

    // Validate JSON
    try {
      const parsed = JSON.parse(jsonStr);
      console.log('✅ Successfully parsed JSON:', parsed);
      
      if (!parsed.events || !Array.isArray(parsed.events)) {
        console.error('❌ Invalid JSON structure:', parsed);
        throw new Error('Invalid response structure');
      }
      
      // Validate each event
      parsed.events.forEach((event, index) => {
        console.log(`🔄 Validating event ${index + 1}:`, event);
        
        if (!event.title || !event.startTime || !event.endTime) {
          console.error(`❌ Invalid event structure for event ${index + 1}:`, event);
          throw new Error('Invalid event structure');
        }
        
        // Validate time format with more detailed regex
        const timeRegex = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(event.startTime)) {
          console.error(`❌ Invalid start time format for event ${index + 1}:`, event.startTime);
          throw new Error(`Invalid start time format: ${event.startTime}`);
        }
        if (!timeRegex.test(event.endTime)) {
          console.error(`❌ Invalid end time format for event ${index + 1}:`, event.endTime);
          throw new Error(`Invalid end time format: ${event.endTime}`);
        }

        // Ensure description exists (can be empty)
        if (typeof event.description !== 'string') {
          event.description = '';
        }
      });
      
      console.log('✅ All validations passed');
      return jsonStr;
    } catch (parseError) {
      console.error('❌ JSON parsing error:', parseError);
      console.error('Failed JSON string:', jsonStr);
      throw new Error('Invalid response format from AI');
    }
  } catch (error) {
    console.error('❌ Error in generateResponse:', error);
    if (axios.isAxiosError(error)) {
      console.error('Network error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Could not connect to Ollama. Please ensure the Ollama server is running.');
      }
      throw new Error(`Failed to generate response from AI: ${error.message}`);
    }
    throw error;
  } finally {
    console.log('=== END generateResponse ===');
  }
}

export async function getEventSuggestions(eventDescription: string): Promise<string> {
  try {
    console.log('Requesting suggestions for event:', eventDescription);
    const response = await axiosInstance.post('', {
      model: 'llama2',
      prompt: `You are an AI assistant specialized in optimizing learning and productivity schedules.
      
      Current event: ${eventDescription}
      
      Analyze this event and provide specific, actionable suggestions for:
      1. Time optimization (Is this the best time for this activity?)
      2. Learning effectiveness (How to maximize learning during this time?)
      3. Preparation and materials needed
      4. Related sub-tasks or prerequisites
      5. Progress tracking metrics
      
      Format your response as a structured list with clear, actionable items.
      Be specific and practical in your suggestions.
      Focus on measurable improvements and concrete steps.
      
      Important: Respond with ONLY the suggestions, no additional text or explanations.`,
      stream: false
    });

    console.log('Received suggestions from Ollama:', response.data);
    const data = response.data as OllamaResponse;
    return data.response.trim();
  } catch (error) {
    console.error('Error getting suggestions from Ollama:', error);
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Could not connect to Ollama. Please ensure the Ollama server is running.');
      }
      throw new Error(`Failed to get suggestions from AI: ${error.message}`);
    }
    throw error;
  }
} 