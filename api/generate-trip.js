// ============================================
// Masari.io - Smart Trip Generator API
// File: /api/generate-trip.js
// ============================================

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are Masari.io, an elite AI travel architect. You don't just plan trips — you give travelers SMART CHOICES.

## YOUR APPROACH:
For each time slot in the day, provide exactly 3 OPTIONS ranked from best to good. Each option includes a rating, pros, cons, estimated cost, and your recommendation reason. This helps the traveler make informed decisions.

## RULES:
1. ONLY suggest REAL places that ACTUALLY EXIST. Use their real names.
2. Include exact names searchable on Google Maps.
3. Budget tiers:
   - اقتصادي: Budget stays, street food, free/cheap attractions, public transport
   - متوسط: 3-4 star hotels, mid-range restaurants, popular attractions
   - فاخر: 5-star hotels, fine dining, VIP/exclusive experiences, private transport
4. Strictly respect food preferences (حلال/halal, نباتي/vegan, بحري/seafood).
5. All descriptions in Arabic.
6. For each activity slot, provide 3 real alternatives with honest comparison.
7. Mark your top pick as "recommended": true.
8. Include real ratings (out of 5) based on general reputation.
9. Return ONLY valid JSON. No markdown, no code blocks, no explanation.

## JSON SCHEMA:
{
  "trip_title": "string - catchy Arabic title",
  "destination": "string",
  "total_days": number,
  "budget_level": "string",
  "total_cost_estimate": number,
  "currency": "USD",
  "tips": ["3 useful travel tips in Arabic"],
  "days": [
    {
      "day_number": number,
      "title": "string - creative Arabic day title",
      "slots": [
        {
          "time": "string - e.g. 9:00 AM",
          "slot_title": "string - e.g. زيارة صباحية or غداء or نشاط مسائي",
          "category": "attraction|restaurant|shopping|entertainment|relaxation",
          "options": [
            {
              "name": "string - exact real place name",
              "name_ar": "string - Arabic name",
              "description": "string - 2 sentences in Arabic describing the place",
              "rating": number (1-5, one decimal like 4.5),
              "cost_usd": number,
              "duration_minutes": number,
              "maps_query": "string - for Google Maps search",
              "pros": ["2 pros in Arabic"],
              "cons": ["1 con in Arabic"],
              "recommended": boolean (true for your top pick only),
              "why_recommended": "string - 1 sentence in Arabic why this is the best choice (only if recommended=true)"
            }
          ]
        }
      ],
      "daily_cost_estimate": number
    }
  ]
}`;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { destination, days, budget, tripType, food, notes } = req.body;

    if (!destination || !days || !budget || !tripType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const userMessage = `Plan a complete travel itinerary:
- Destination: ${destination}
- Duration: ${days} days
- Budget: ${budget}
- Trip type: ${tripType}
- Food: ${food || 'No preference'}
- Notes: ${notes || 'None'}

For EACH time slot, provide exactly 3 real place options with ratings, pros, cons, cost, and mark the best one as recommended. 
Each day should have 4 slots: morning activity, lunch, afternoon activity, dinner/evening.
All text in Arabic. Place names must be real and findable on Google Maps.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
    });

    const tripData = JSON.parse(response.choices[0].message.content);

    // Add Google Maps URLs
    if (tripData.days) {
      tripData.days.forEach(day => {
        if (day.slots) {
          day.slots.forEach(slot => {
            if (slot.options) {
              slot.options.forEach(opt => {
                opt.maps_url = `https://www.google.com/maps/search/${encodeURIComponent(opt.maps_query || opt.name)}`;
              });
            }
          });
        }
        // Backward compat: also handle old 'activities' format
        if (day.activities) {
          day.activities.forEach(act => {
            act.maps_url = `https://www.google.com/maps/search/${encodeURIComponent(act.maps_query || act.name)}`;
          });
        }
      });
    }

    console.log(`Trip: ${destination}, ${days}d, ${budget} | Tokens: ${response.usage.total_tokens}`);

    return res.status(200).json({
      success: true,
      data: tripData,
      usage: {
        tokens: response.usage.total_tokens,
        cost_usd: (response.usage.total_tokens / 1000000 * 0.60).toFixed(6),
      }
    });

  } catch (error) {
    console.error('Error:', error);
    if (error.code === 'insufficient_quota') return res.status(402).json({ error: 'API quota exceeded' });
    if (error.code === 'rate_limit_exceeded') return res.status(429).json({ error: 'Too many requests' });
    return res.status(500).json({ error: 'Failed to generate trip' });
  }
}
