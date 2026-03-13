// ============================================
// Masar.ai - Vercel Serverless API
// File: /api/generate-trip.js
// ============================================

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// System prompt - the brain of Masar.ai
const SYSTEM_PROMPT = `You are Masar.ai, an expert AI travel planner specializing in creating detailed, personalized day-by-day travel itineraries.

## RULES:
1. Only suggest REAL places, restaurants, and attractions that actually exist.
2. Include exact place names suitable for Google Maps search.
3. Respect the budget tier:
   - اقتصادي (Economy): Budget hostels, street food, free attractions, public transport
   - متوسط (Mid-range): 3-4 star hotels, casual restaurants, popular attractions
   - فاخر (Luxury): 5-star hotels, fine dining, VIP experiences, private transport
4. Respect food preferences strictly (حلال/halal, نباتي/vegan, بحري/seafood).
5. Include realistic time estimates and travel time between places.
6. Include cost estimates in USD for each activity.
7. Structure each day: Morning (8-12), Afternoon (12-17), Evening (17-22).
8. Vary activities - don't repeat the same type consecutively.
9. Consider opening hours and best times to visit.
10. Return ONLY valid JSON. No markdown, no explanation, no code blocks.

## JSON SCHEMA (follow exactly):
{
  "trip_title": "string - catchy title in Arabic",
  "destination": "string",
  "total_days": number,
  "budget_level": "string",
  "total_cost_estimate": number,
  "currency": "USD",
  "tips": ["string - 3 useful tips for this destination"],
  "days": [
    {
      "day_number": number,
      "title": "string - creative day title in Arabic",
      "activities": [
        {
          "time": "string - e.g. 9:00 AM",
          "name": "string - exact place name",
          "name_ar": "string - Arabic name if available",
          "description": "string - 2 sentences in Arabic",
          "cost_usd": number,
          "duration_minutes": number,
          "maps_query": "string - Google Maps search query",
          "category": "attraction|restaurant|hotel|transport|shopping|entertainment"
        }
      ],
      "daily_cost_estimate": number
    }
  ]
}`;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { destination, days, budget, tripType, food, notes } = req.body;

    // Validation
    if (!destination || !days || !budget || !tripType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Build user message
    const userMessage = `Plan a complete travel itinerary with these details:
- Destination: ${destination}
- Duration: ${days} days
- Budget level: ${budget}
- Trip type: ${tripType}
- Food preference: ${food || 'No preference'}
- Additional notes: ${notes || 'None'}

Generate a detailed day-by-day plan following the JSON schema exactly. All descriptions should be in Arabic.`;

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Cost-efficient: ~$0.001 per trip
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    });

    // Parse response
    const tripData = JSON.parse(response.choices[0].message.content);

    // Add Google Maps links
    tripData.days.forEach(day => {
      day.activities.forEach(activity => {
        activity.maps_url = `https://www.google.com/maps/search/${encodeURIComponent(activity.maps_query)}`;
      });
    });

    // Log usage for monitoring
    console.log(`Trip generated: ${destination}, ${days} days, ${budget}`);
    console.log(`Tokens used: ${response.usage.total_tokens}`);

    return res.status(200).json({
      success: true,
      data: tripData,
      usage: {
        tokens: response.usage.total_tokens,
        estimated_cost: (response.usage.total_tokens / 1000000 * 0.60).toFixed(6),
      }
    });

  } catch (error) {
    console.error('AI Generation Error:', error);

    // Specific error handling
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({ error: 'API quota exceeded. Please try again later.' });
    }
    if (error.code === 'rate_limit_exceeded') {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }

    return res.status(500).json({
      error: 'Failed to generate trip. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}


// ============================================
// Alternative: Using Claude API instead of OpenAI
// ============================================
/*
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// In the handler, replace the OpenAI call with:
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4000,
  system: SYSTEM_PROMPT,
  messages: [
    { role: 'user', content: userMessage }
  ],
});

const tripData = JSON.parse(response.content[0].text);
*/
