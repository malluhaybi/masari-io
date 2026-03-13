import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are Masari.io, an elite AI travel planner. For each time slot, provide 3 real place OPTIONS with ratings, pros, cons, and mark the best as recommended.

RULES:
1. ONLY real places that exist on Google Maps
2. Budget: اقتصادي=cheap, متوسط=mid-range, فاخر=luxury
3. Respect food preferences (حلال/نباتي/بحري)
4. All text in Arabic
5. Return ONLY valid JSON

JSON SCHEMA:
{
  "trip_title": "Arabic title",
  "destination": "string",
  "total_days": number,
  "total_cost_estimate": number,
  "tips": ["3 tips in Arabic"],
  "days": [
    {
      "day_number": number,
      "title": "Arabic day title",
      "daily_cost_estimate": number,
      "slots": [
        {
          "time": "9:00 AM",
          "slot_title": "زيارة صباحية",
          "category": "attraction|restaurant|shopping|entertainment",
          "options": [
            {
              "name": "exact place name",
              "name_ar": "Arabic name",
              "description": "2 sentences Arabic",
              "rating": 4.5,
              "cost_usd": 25,
              "duration_minutes": 90,
              "maps_query": "place name city",
              "pros": ["pro1 Arabic", "pro2 Arabic"],
              "cons": ["con1 Arabic"],
              "recommended": true,
              "why_recommended": "Arabic reason"
            }
          ]
        }
      ]
    }
  ]
}`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { destination, days, budget, tripType, food, notes } = req.body;
    if (!destination || !days || !budget) return res.status(400).json({ error: 'Missing fields' });

    const userMsg = `Plan trip: ${destination}, ${days} days, budget: ${budget}, type: ${tripType}, food: ${food || 'any'}, notes: ${notes || 'none'}. Each day needs 4 slots (morning activity, lunch, afternoon, dinner). Each slot has 3 options. All Arabic. Real places only.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg }
      ],
      temperature: 0.7,
      max_tokens: 6000,
      response_format: { type: 'json_object' },
    });

    const data = JSON.parse(response.choices[0].message.content);

    // Add Maps URLs
    if (data.days) {
      data.days.forEach(function(day) {
        if (day.slots) {
          day.slots.forEach(function(slot) {
            if (slot.options) {
              slot.options.forEach(function(opt) {
                opt.maps_url = 'https://www.google.com/maps/search/' + encodeURIComponent(opt.maps_query || opt.name);
              });
            }
          });
        }
      });
    }

    return res.status(200).json({ success: true, data: data });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to generate trip' });
  }
}
